import asyncio

import pytest

from app.services.blackboard import Blackboard


@pytest.mark.asyncio
async def test_read_relevant_excludes_own_entries():
    bb = Blackboard()
    await bb.write("session-1", "agent_a", "output", "a's output")
    await bb.write("session-1", "agent_b", "output", "b's output")

    seen_by_a = await bb.read_relevant("session-1", "agent_a")

    assert "agent_a:output" not in seen_by_a
    assert seen_by_a["agent_b:output"] == "b's output"


@pytest.mark.asyncio
async def test_emit_reaches_subscriber():
    bb = Blackboard()
    queue = bb.subscribe("session-1")

    await bb.emit("session-1", "status", "running")

    event = await asyncio.wait_for(queue.get(), timeout=1)
    assert event.event == "status"
    assert event.data == "running"


@pytest.mark.asyncio
async def test_unsubscribe_stops_delivery():
    bb = Blackboard()
    queue = bb.subscribe("session-1")
    bb.unsubscribe("session-1", queue)

    await bb.emit("session-1", "status", "running")

    assert queue.empty()
