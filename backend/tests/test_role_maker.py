import json

import pytest

from app.agents.role_maker import RoleMakerAgent, RoleMakerError


def _manifest_json(hub_agent="ghost_ceo", extra_agent_count=0):
    agents = [
        {
            "id": "ghost_ceo",
            "name": "Ghost CEO",
            "system_prompt": "You are the ghost CEO.",
            "tools": [],
            "temperature": 0.7,
            "priority": 1,
        }
    ]
    for i in range(extra_agent_count):
        agents.append(
            {
                "id": f"extra_{i}",
                "name": f"Extra {i}",
                "system_prompt": "filler",
                "tools": ["not_a_real_tool"],
                "temperature": 0.5,
                "priority": 2,
            }
        )
    return json.dumps(
        {
            "domain": "fintech_problem",
            "problem_summary": "test problem",
            "agents": agents,
            "topology": "star",
            "hub_agent": hub_agent,
            "shared_memory_keys": ["decisions"],
        }
    )


class _FakeGemma:
    def __init__(self, text: str):
        self._text = text

    async def generate(self, **kwargs):
        return {"text": self._text, "function_calls": []}


@pytest.mark.asyncio
async def test_generate_manifest_parses_valid_json():
    role_maker = RoleMakerAgent(gemma=_FakeGemma(_manifest_json()))
    manifest = await role_maker.generate_manifest("test problem")
    assert manifest.hub_agent == "ghost_ceo"
    assert len(manifest.agents) == 1


@pytest.mark.asyncio
async def test_generate_manifest_strips_unknown_tools():
    role_maker = RoleMakerAgent(gemma=_FakeGemma(_manifest_json(extra_agent_count=1)))
    manifest = await role_maker.generate_manifest("test problem")
    extra = next(a for a in manifest.agents if a.id == "extra_0")
    assert extra.tools == []


@pytest.mark.asyncio
async def test_generate_manifest_fixes_invalid_hub_agent():
    role_maker = RoleMakerAgent(gemma=_FakeGemma(_manifest_json(hub_agent="nonexistent")))
    manifest = await role_maker.generate_manifest("test problem")
    assert manifest.hub_agent in {a.id for a in manifest.agents}


class _SequenceGemma:
    def __init__(self, *texts):
        self._texts = list(texts)
        self.messages = []

    async def generate(self, **kwargs):
        self.messages.append(kwargs["user_message"])
        return {"text": self._texts.pop(0), "function_calls": []}


@pytest.mark.asyncio
async def test_generate_manifest_retries_with_error_feedback():
    gemma = _SequenceGemma("not json at all", _manifest_json())
    manifest = await RoleMakerAgent(gemma=gemma).generate_manifest("test problem")
    assert manifest.agents[0].id == "ghost_ceo"
    assert "previous reply was invalid" in gemma.messages[1]


@pytest.mark.asyncio
async def test_generate_manifest_raises_instead_of_hardcoded_team():
    with pytest.raises(RoleMakerError):
        await RoleMakerAgent(gemma=_FakeGemma("not json at all")).generate_manifest("test problem")
