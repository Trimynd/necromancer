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
        self.contexts = []

    async def run(self, task, context=None):
        self.contexts.append(context)
        return f'{{"claim": "{self.id} claim v{len(self.contexts)}", "evidence": [], "confidence": 0.8, "emotion": "calm"}}'


class _FakeSoulBinder:
    def __init__(self):
        self.rule_calls = 0

    async def rule(self, question, cases, window=None):
        self.rule_calls += 1
        # send "weak" back once, then accept everything
        return {
            gid: Ruling(agent_id=gid, decision="retry" if gid == "weak" and self.rule_calls == 1 else "accept",
                        guidance="search UPI fraud stats", needs_more="NPCI fraud report 2026", missing_sources=["news"])
            for gid in cases
        }

    async def verdict(self, question, cases):
        return "VERDICT"

    async def summarize(self, question, cases, verdict):
        return "SUMMARY"


async def _no_memory(*args, **kwargs):
    return []


@pytest.fixture
def court(monkeypatch):
    manifest = AgentManifest(
        domain="fintech_problem", problem_summary="t", topology="star", hub_agent="strong",
        agents=[AgentConfig(id="strong", name="S", system_prompt="x"), AgentConfig(id="weak", name="W", system_prompt="y")],
    )
    ghosts = {"strong": _FakeGhost("strong"), "weak": _FakeGhost("weak")}

    async def fake_route(self, q):
        return Route(complexity="complex", needs_web=False)

    async def fake_manifest(self, q, data=None):
        return manifest

    monkeypatch.setattr(orchestrator_module.RouterAgent, "route", fake_route)
    monkeypatch.setattr(orchestrator_module.RoleMakerAgent, "generate_manifest", fake_manifest)
    monkeypatch.setattr(orchestrator_module.AgentFactory, "create_team", staticmethod(lambda m, b, s: list(ghosts.values())))
    monkeypatch.setattr(orchestrator_module.memory, "search", _no_memory)
    return ghosts


@pytest.mark.asyncio
async def test_court_sends_back_weak_ghost_then_reaches_verdict(court):
    orch = Orchestrator(Blackboard())
    orch.soul_binder = _FakeSoulBinder()
    session = SessionState(session_id="s1", problem_statement="detect UPI fraud")

    result = await orch.solve_problem(session)

    assert result.status == SessionStatus.DONE, result.error
    assert result.verdict == "VERDICT" and result.summary == "SUMMARY"
    assert len(court["strong"].contexts) == 1  # accepted first time
    assert len(court["weak"].contexts) == 2  # sent back once
    assert court["weak"].contexts[1]["binder_guidance"] == "search UPI fraud stats"
    assert court["weak"].contexts[1]["missing_sources"] == ["news"]
    assert result.usage == {}  # fakes make no real API calls
    assert result.cases["weak"]["claim"] == "weak claim v2"


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


def test_parse_case_handles_prose():
    assert parse_case("just prose")["claim"] == "just prose"
    assert parse_case('```json\n{"claim": "x"}\n```')["confidence"] == 0.5
