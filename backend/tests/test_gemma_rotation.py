import pytest
from google.genai import errors

from app.services import gemma_client


class _Resp:
    text = "ok"
    function_calls = None
    usage_metadata = None


class _FakeClient:
    def __init__(self, fail_with_429: bool):
        self.calls = 0
        self.fail = fail_with_429
        self.aio = self
        self.models = self

    async def generate_content(self, **kwargs):
        self.calls += 1
        if self.fail:
            raise errors.APIError(429, {"error": {"message": "quota", "status": "RESOURCE_EXHAUSTED"}})
        return _Resp()


@pytest.mark.asyncio
async def test_429_rotates_to_next_key_without_sleeping(monkeypatch):
    exhausted, fresh = _FakeClient(True), _FakeClient(False)
    monkeypatch.setattr(gemma_client, "_clients", [exhausted, fresh])
    monkeypatch.setattr(gemma_client, "_key_index", 0)

    async def no_sleep(_):
        raise AssertionError("should rotate keys, not sleep")

    monkeypatch.setattr(gemma_client.asyncio, "sleep", no_sleep)

    result = await gemma_client.GemmaClient("m").generate("sys", "hi")

    assert result["text"] == "ok"
    assert exhausted.calls == 1 and fresh.calls == 1


@pytest.mark.asyncio
async def test_calls_round_robin_across_keys(monkeypatch):
    a, b = _FakeClient(False), _FakeClient(False)
    monkeypatch.setattr(gemma_client, "_clients", [a, b])
    monkeypatch.setattr(gemma_client, "_key_index", 0)
    client = gemma_client.GemmaClient("m")
    for _ in range(4):
        await client.generate("sys", "hi")
    assert a.calls == 2 and b.calls == 2


@pytest.mark.asyncio
async def test_pacer_skips_key_without_token_headroom(monkeypatch):
    monkeypatch.setattr(gemma_client, "_clients", [object(), object()])
    monkeypatch.setattr(gemma_client, "_windows", [])
    monkeypatch.setattr(gemma_client.settings, "key_rpm", 28)
    monkeypatch.setattr(gemma_client.settings, "key_tpm", 15000)
    assert await gemma_client._acquire_key(0, 12000) == 0
    # key 0 now has 12k in its window; another 12k only fits on key 1
    assert await gemma_client._acquire_key(0, 12000) == 1
