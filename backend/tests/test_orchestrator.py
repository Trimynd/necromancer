import pytest

from app.agents import orchestrator as orchestrator_module
from app.agents.orchestrator import Orchestrator
from app.models.manifest import AgentConfig, AgentManifest
from app.models.session import SessionState, SessionStatus
from app.services.blackboard import Blackboard


class _FakeAgent:
    def __init__(self, agent_id: str):
        self.id = agent_id
        self.calls = 0

    async def run(self, task, context=None):
        self.calls += 1
        if self.id == "hub":
            return "synthesized decision READY_TO_PITCH" if self.calls > 1 else "final pitch: go for it"
        return f"{self.id} proposes something"


@pytest.mark.asyncio
async def test_solve_problem_reaches_done(monkeypatch):
    manifest = AgentManifest(
        domain="fintech_problem",
        problem_summary="test",
        agents=[
            AgentConfig(id="hub", name="Hub", system_prompt="x"),
            AgentConfig(id="peer", name="Peer", system_prompt="y"),
        ],
        topology="star",
        hub_agent="hub",
        shared_memory_keys=[],
    )

    async def fake_generate_manifest(self, problem_statement, startup_data=None):
        return manifest

    def fake_create_team(manifest, blackboard, session_id):
        return [_FakeAgent("hub"), _FakeAgent("peer")]

    monkeypatch.setattr(orchestrator_module.RoleMakerAgent, "generate_manifest", fake_generate_manifest)
    monkeypatch.setattr(orchestrator_module.AgentFactory, "create_team", staticmethod(fake_create_team))

    blackboard = Blackboard()
    session = SessionState(session_id="s1", problem_statement="solve fraud detection")

    result = await Orchestrator(blackboard).solve_problem(session)

    assert result.status == SessionStatus.DONE
    assert result.pitch is not None
    assert result.manifest == manifest
