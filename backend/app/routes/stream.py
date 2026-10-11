import asyncio
import json

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.routes.problem import lookup, thread
from app.services import db, history
from app.state import blackboard, sessions

router = APIRouter(tags=["stream"])


@router.get("/api/session/{session_id}")
async def get_session(session_id: str) -> dict:
    snap = lookup(session_id)
    if snap is None:
        # Older runs saved before history files existed: the durable summary survives in SQLite.
        snap = await db.get_session(session_id)
        if snap is None:
            raise HTTPException(status_code=404, detail="Unknown session_id")
    return {**snap, "thread": thread(snap)}


@router.get("/api/session/{session_id}/events")
async def get_events(session_id: str) -> dict:
    """Every recorded event of a run, so a past case renders fully (charts, testimony) in one pass."""
    if session_id in sessions:
        return {"status": str(sessions[session_id].status), "events": blackboard.history(session_id)}
    saved = history.load(session_id)
    if saved is None:
        raise HTTPException(status_code=404, detail="Unknown session_id")
    status = saved["session"].get("status")
    if status not in ("done", "error"):
        status = "interrupted"  # saved mid-run, and this process no longer runs it
    return {"status": status, "events": saved["events"]}


@router.get("/api/stream/{session_id}")
async def stream(session_id: str, request: Request) -> StreamingResponse:
    if session_id not in sessions:
        saved = history.load(session_id)
        if saved is None:
            raise HTTPException(status_code=404, detail="Unknown session_id")

        async def replay():  # run from disk: send it all at once, then close
            for e in saved["events"]:
                yield f"event: {e['event']}\ndata: {json.dumps(e['data'], default=str)}\n\n"
            if saved["session"].get("status") not in ("done", "error"):
                yield 'event: status\ndata: "interrupted"\n\n'

        return StreamingResponse(replay(), media_type="text/event-stream")

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
