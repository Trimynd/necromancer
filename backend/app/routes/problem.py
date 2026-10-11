import asyncio
import uuid

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.agents.orchestrator import Orchestrator
from app.models.session import SessionState
from app.state import blackboard, sessions

router = APIRouter(tags=["problem"])


class ProblemRequest(BaseModel):
    problem_statement: str = Field(min_length=1, max_length=4000)


class ProblemResponse(BaseModel):
    session_id: str
    stream_url: str


@router.post("/api/problem", response_model=ProblemResponse)
async def problem(req: ProblemRequest) -> ProblemResponse:
    session_id = str(uuid.uuid4())
    session = SessionState(session_id=session_id, problem_statement=req.problem_statement)
    sessions[session_id] = session

    orchestrator = Orchestrator(blackboard)
    asyncio.create_task(orchestrator.solve_problem(session))

    return ProblemResponse(session_id=session_id, stream_url=f"/api/stream/{session_id}")
