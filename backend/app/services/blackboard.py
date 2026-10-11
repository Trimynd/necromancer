import asyncio
from collections import defaultdict
from typing import Any

from app.models.blackboard import BlackboardEvent


class Blackboard:
    """Shared agent memory + SSE event bus, scoped per session.

    In-memory by default so the backend runs with zero extra infra. If this
    needs to scale across multiple processes later, swap the dict/queue
    storage here for Redis (hset/hgetall + pubsub) behind the same interface.
    """

    def __init__(self):
        self._store: dict[str, dict[str, Any]] = defaultdict(dict)
        self._subscribers: dict[str, list[asyncio.Queue]] = defaultdict(list)
        # Every event of a session, so a page that connects late (or reloads) replays the whole run.
        self._history: dict[str, list[BlackboardEvent]] = defaultdict(list)

    async def write(self, session_id: str, agent_id: str, key: str, value: Any) -> None:
        self._store[session_id][f"{agent_id}:{key}"] = value

    async def read_relevant(self, session_id: str, agent_id: str) -> dict[str, Any]:
        """Everything written to this session's board, except the agent's own entries."""
        return {
            k: v
            for k, v in self._store[session_id].items()
            if not k.startswith(f"{agent_id}:")
        }

    async def emit(self, session_id: str, event: str, data: Any) -> None:
        payload = BlackboardEvent(event=event, data=data)
        self._history[session_id].append(payload)
        for queue in self._subscribers[session_id]:
            queue.put_nowait(payload)

    def history(self, session_id: str) -> list[dict]:
        events = self._history.get(session_id, [])
        t0 = events[0].timestamp if events else None
        return [{"event": e.event, "data": e.data, "t": round((e.timestamp - t0).total_seconds(), 1)} for e in events]

    def subscribe(self, session_id: str) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue()
        for past in self._history[session_id]:
            queue.put_nowait(past)
        self._subscribers[session_id].append(queue)
        return queue

    def unsubscribe(self, session_id: str, queue: asyncio.Queue) -> None:
        subs = self._subscribers.get(session_id)
        if subs and queue in subs:
            subs.remove(queue)

    def clear_session(self, session_id: str) -> None:
        self._store.pop(session_id, None)
        self._subscribers.pop(session_id, None)
        self._history.pop(session_id, None)
