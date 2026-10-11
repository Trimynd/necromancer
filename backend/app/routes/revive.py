import asyncio
import uuid

from fastapi import APIRouter
from pydantic import BaseModel, HttpUrl

from app.agents.orchestrator import Orchestrator
from app.models.session import SessionState
from app.state import blackboard, sessions

router = APIRouter(tags=["revive"])


class ReviveRequest(BaseModel):
    url: HttpUrl


class ReviveResponse(BaseModel):
    session_id: str
    stream_url: str


@router.post("/api/revive", response_model=ReviveResponse)
async def revive(req: ReviveRequest) -> ReviveResponse:
    session_id = str(uuid.uuid4())
    session = SessionState(session_id=session_id, input_url=str(req.url))
    sessions[session_id] = session

    orchestrator = Orchestrator(blackboard)
    asyncio.create_task(orchestrator.revive_startup(session))

    return ReviveResponse(session_id=session_id, stream_url=f"/api/stream/{session_id}")
