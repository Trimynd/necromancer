from typing import Literal
import asyncio
import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.agents.orchestrator import Orchestrator
from app.models.session import SessionState
from app.state import blackboard, documents, sessions

router = APIRouter(tags=["problem"])


class ProblemRequest(BaseModel):
    problem_statement: str = Field(min_length=1, max_length=4000)
    depth: Literal["fast", "deep"] = "deep"
    document_ids: list[str] = Field(default_factory=list, max_length=3)
    # Strict Soul Binder: sends back any case whose key claims rest on weak or single-source evidence.
    strict: bool = False


class ProblemResponse(BaseModel):
    session_id: str
    stream_url: str


@router.post("/api/problem", response_model=ProblemResponse)
async def problem(req: ProblemRequest) -> ProblemResponse:
    session_id = str(uuid.uuid4())
    missing = [d for d in req.document_ids if d not in documents]
    if missing:
        raise HTTPException(status_code=400, detail=f"Unknown document ids (re-upload them): {missing}")
    session = SessionState(
        session_id=session_id, problem_statement=req.problem_statement, depth=req.depth, strict=req.strict,
        documents=[{k: documents[d][k] for k in ("id", "name", "kind", "chars", "pages")} for d in req.document_ids],
        document_texts=[documents[d] for d in req.document_ids],
    )
    sessions[session_id] = session

    orchestrator = Orchestrator(blackboard)
    asyncio.create_task(orchestrator.solve_problem(session))

    return ProblemResponse(session_id=session_id, stream_url=f"/api/stream/{session_id}")
