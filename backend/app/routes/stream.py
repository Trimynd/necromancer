import asyncio
import json

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.services import db
from app.state import blackboard, sessions

router = APIRouter(tags=["stream"])


@router.get("/api/session/{session_id}")
async def get_session(session_id: str) -> dict:
    session = sessions.get(session_id)
    if session is not None:
        return session.model_dump()

    # Not live in this process (e.g. restarted) — the durable summary survives in SQLite.
    saved = await db.get_session(session_id)
    if saved is None:
        raise HTTPException(status_code=404, detail="Unknown session_id")
    return saved


@router.get("/api/stream/{session_id}")
async def stream(session_id: str, request: Request) -> StreamingResponse:
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Unknown session_id")

    queue = blackboard.subscribe(session_id)

    async def event_generator():
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=15)
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
                    continue

                payload = json.dumps(event.data, default=str)
                yield f"event: {event.event}\ndata: {payload}\n\n"

                if event.event == "status" and event.data in ("done", "error"):
                    break
        finally:
            blackboard.unsubscribe(session_id, queue)

    return StreamingResponse(event_generator(), media_type="text/event-stream")
