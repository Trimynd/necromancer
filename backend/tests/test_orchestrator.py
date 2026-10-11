import pytest

from app.agents import orchestrator as orchestrator_module
from app.agents.soul_binder import Ruling
from app.agents.orchestrator import Orchestrator, parse_case
from app.agents.router import Route
from app.models.manifest import AgentConfig, AgentManifest
from app.models.session import SessionState, SessionStatus
from app.services.blackboard import Blackboard


class _FakeGhost:
    def __init__(self, agent_id: str):
        self.id = agent_id
        self.name = agent_id
        self.contexts = []
        self.tool_flags = []

    async def run(self, task, context=None, use_tools=True):
        self.contexts.append(context)
        self.tool_flags.append(use_tools)
        return f'{{"claim": "{self.id} claim v{len(self.contexts)}", "evidence": [], "confidence": 0.8, "emotion": "calm"}}'


class _FakeSoulBinder:
    def __init__(self):
        self.rule_calls = 0

    async def rule(self, question, cases, window=None, think=True, strict=False):
        self.rule_calls += 1
        # send "weak" back once, then accept everything
        return {
            gid: Ruling(agent_id=gid, decision="retry" if gid == "weak" and self.rule_calls == 1 else "accept",
                        guidance="search UPI fraud stats", needs_more="NPCI fraud report 2026", missing_sources=["news"])
            for gid in cases
        }

    async def score(self, question, cases):
        return {"label": "GO", "dimensions": {"Market demand": 8.0}, "overall": 80}

    async def report(self, question, cases):
        for chunk in ["## 1. Verdict\nGO 80", "\n## 2. Question\nctx"]:
            yield chunk


async def _no_memory(*args, **kwargs):
    return []


async def _fake_research(query, sources=None):
    return {"query": query, "per_source": {"web": 1}, "chunks_stored": 1,
            "evidence": [{"text": "fact", "source": "http://x", "source_type": "web"}]}


@pytest.fixture
def court(monkeypatch):
    manifest = AgentManifest(
        domain="fintech_problem", problem_summary="t", topology="star", hub_agent="strong",
        agents=[AgentConfig(id="strong", name="S", system_prompt="x"), AgentConfig(id="weak", name="W", system_prompt="y")],
    )
    ghosts = {"strong": _FakeGhost("strong"), "weak": _FakeGhost("weak")}

    async def fake_route(self, q):
        return Route(complexity="complex", needs_web=False)

    async def fake_manifest(self, q, data=None, max_agents=None):
        return manifest

    monkeypatch.setattr(orchestrator_module.RouterAgent, "route", fake_route)
    monkeypatch.setattr(orchestrator_module.RoleMakerAgent, "generate_manifest", fake_manifest)
    monkeypatch.setattr(orchestrator_module.AgentFactory, "create_team", staticmethod(lambda m, b, s: list(ghosts.values())))
    monkeypatch.setattr(orchestrator_module.memory, "search", _no_memory)
    monkeypatch.setattr(orchestrator_module, "verify_companies", _no_memory)
    monkeypatch.setattr(orchestrator_module, "web_research", _fake_research)
    return ghosts


@pytest.mark.asyncio
async def test_court_sends_back_weak_ghost_then_reaches_verdict(court):
    orch = Orchestrator(Blackboard())
    orch.soul_binder = _FakeSoulBinder()
    session = SessionState(session_id="s1", problem_statement="detect UPI fraud")

    result = await orch.solve_problem(session)

    assert result.status == SessionStatus.DONE, result.error
    assert result.verdict == "GO 80"
    assert result.summary.startswith("## 1. Verdict") and "## 2. Question" in result.summary
    assert len(court["strong"].contexts) == 1  # accepted first time
    assert len(court["weak"].contexts) == 2  # sent back once
    assert court["weak"].contexts[1]["binder_guidance"] == "search UPI fraud stats"
    assert court["weak"].contexts[1]["missing_sources"] == ["news"]
    # first case: evidence pre-gathered, one call, no tools; the sent-back redo may research again
    assert court["weak"].contexts[0]["your_research"][0]["text"] == "fact"
    assert court["weak"].contexts[1]["your_research"][0]["text"] == "fact"  # redo keeps its own research
    assert court["weak"].tool_flags == [False, True]
    assert result.usage == {}  # fakes make no real API calls
    assert result.cases["weak"]["claim"] == "weak claim v2"
    events = [e.event for e in orch.blackboard._history["s1"]]
    assert events[-1] == "status" and events.index("usage") < len(events) - 1  # usage reaches the UI before "done"
    assert result.scores["overall"] == 80 and events.index("scores") < events.index("verdict")


@pytest.mark.asyncio
async def test_simple_question_skips_court(monkeypatch):
    async def fake_route(self, q):
        return Route(complexity="simple", needs_web=False)

    class _Direct:
        async def generate(self, **kw):
            return {"text": "UPI is India's instant payment rail.", "function_calls": []}

    monkeypatch.setattr(orchestrator_module.RouterAgent, "route", fake_route)
    monkeypatch.setattr(orchestrator_module, "GemmaClient", lambda *a, **k: _Direct())
    monkeypatch.setattr(orchestrator_module.memory, "search", _no_memory)

    result = await Orchestrator(Blackboard()).solve_problem(SessionState(session_id="s2", problem_statement="what is UPI"))

    assert result.status == SessionStatus.DONE
    assert result.manifest is None
    assert "UPI" in result.verdict


def test_parse_case_counts_real_source_types():
    case = parse_case('{"claim": "x", "evidence": [{"source_type": "News"}, {"source_type": "web"}, '
                      '{"source_type": "news"}, {"source_type": "made-up"}]}')
    assert case["source_types"] == ["news", "web"]


def test_clean_query_collapses_model_loops():
    from app.services.research import clean_query
    assert clean_query("tiffin Viman Nagar Viman Nagar Viman Nagar Pune") == "tiffin Viman Nagar Pune"
    assert len(clean_query(" ".join(f"w{i}" for i in range(500)))) == 200


def test_parse_case_handles_prose():
    assert parse_case("just prose")["claim"] == "just prose"
    assert parse_case('```json\n{"claim": "x"}\n```')["confidence"] == 0.5


def test_ruling_accepts_nulls_from_the_soul_binder():
    r = Ruling.model_validate({"agent_id": "a", "decision": "accept", "reason": "ok", "search_quality": 0.9,
                               "missing_sources": None, "needs_more": None, "guidance": None})
    assert r.needs_more == "" and r.guidance == "" and r.missing_sources == [] and r.search_quality == 0.9


def test_memory_searches_stay_inside_the_session():
    from app.services import memory
    token = memory.evidence_tag.set({"session_id": "s-tiffin", "round": 0})
    try:
        assert memory.session_scope() == {"session_id": "s-tiffin"}
        assert memory.session_scope({"source_type": ["news"]}) == {"source_type": ["news"], "session_id": "s-tiffin"}
    finally:
        memory.evidence_tag.reset(token)
    assert memory.session_scope() is None  # outside a session: global (scripts/tests)
