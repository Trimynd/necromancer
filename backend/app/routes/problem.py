import asyncio
import uuid
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, HttpUrl, model_validator

from app.agents.orchestrator import Orchestrator
from app.models.session import SessionState
from app.services import history
from app.services.data_diff import diff_stats
from app.services.documents import DocumentError
from app.services.google_sheets import read_sheet
from app.state import blackboard, documents, sessions

router = APIRouter(tags=["problem"])

Stage = Literal["launch", "grow", "rescue", "revive"]


class ProblemRequest(BaseModel):
    problem_statement: str = Field(default="", max_length=4000)
    # A link can come WITH a prompt: a dead startup's site, a competitor, an article...
    url: HttpUrl | None = None
    depth: Literal["fast", "deep"] = "deep"
    document_ids: list[str] = Field(default_factory=list, max_length=3)
    # Strict Soul Binder: sends back any case whose key claims rest on weak or single-source evidence.
    strict: bool = False
    stage: Stage | None = None

    @model_validator(mode="after")
    def _needs_something(self):
        if not self.problem_statement.strip() and self.url is None and not self.document_ids:
            raise ValueError("Give a question, a link, or a document")
        return self


class FollowupRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    depth: Literal["fast", "deep"] = "fast"
    strict: bool = False
    stage: Stage | None = None  # defaults to the parent case's stage


class ProblemResponse(BaseModel):
    session_id: str
    stream_url: str
    parent_id: str | None = None


def _start(session: SessionState) -> ProblemResponse:
    sessions[session.session_id] = session
    orchestrator = Orchestrator(blackboard)
    flow = orchestrator.revive_startup if session.input_url else orchestrator.solve_problem
    asyncio.create_task(flow(session))
    return ProblemResponse(session_id=session.session_id, stream_url=f"/api/stream/{session.session_id}",
                           parent_id=session.parent_id)


def _documents(ids: list[str]) -> tuple[list[dict], list[dict]]:
    missing = [d for d in ids if d not in documents]
    if missing:
        raise HTTPException(status_code=400, detail=f"Unknown document ids (re-upload them): {missing}")
    meta = [{k: v for k, v in documents[d].items() if k not in ("text", "preview")} for d in ids]
    return meta, [documents[d] for d in ids]


@router.post("/api/problem", response_model=ProblemResponse)
async def problem(req: ProblemRequest) -> ProblemResponse:
    meta, texts = _documents(req.document_ids)
    statement = req.problem_statement.strip() or ("Analyse the attached documents." if not req.url else "")
    return _start(SessionState(
        session_id=str(uuid.uuid4()), problem_statement=statement, input_url=str(req.url) if req.url else None,
        depth=req.depth, strict=req.strict, stage=req.stage, documents=meta, document_texts=texts,
    ))


def lookup(session_id: str) -> dict | None:
    """A session snapshot from memory (live) or disk (finished, survives restarts)."""
    live = sessions.get(session_id)
    if live is not None:
        return live.model_dump(mode="json")
    saved = history.load(session_id)
    if not saved:
        return None
    snap = saved["session"]
    if snap.get("status") not in ("done", "error"):  # not live in this process -> the run died mid-way
        snap = {**snap, "status": "interrupted"}
    return snap


def thread(session: dict) -> list[dict]:
    """Earlier turns of this conversation, oldest first."""
    out, parent = [], session.get("parent_id")
    while parent and len(out) < 20:
        p = lookup(parent)
        if p is None:
            break
        out.append({"session_id": parent, "question": p.get("problem_statement") or p.get("input_url"),
                    "verdict": p.get("verdict"), "status": p.get("status")})
        parent = p.get("parent_id")
    return list(reversed(out))


class RefreshRequest(BaseModel):
    depth: Literal["fast", "deep"] = "fast"
    strict: bool = False


@router.post("/api/session/{session_id}/refresh-data", response_model=ProblemResponse)
async def refresh_data(session_id: str, req: RefreshRequest) -> ProblemResponse:
    """Re-read every Google Sheet connected to this case (the owner edited it: version 2, 3...),
    compute what changed by code, and start a follow-up turn that re-judges with the new numbers."""
    parent = lookup(session_id)
    if parent is None:
        raise HTTPException(status_code=404, detail="Unknown session_id")
    sheets = [d for d in parent.get("documents") or [] if d.get("kind") == "sheet" and d.get("source")]
    if not sheets:
        raise HTTPException(status_code=400, detail="This case has no connected Google Sheet to refresh.")
    fresh, diffs = [], []
    for old in sheets:
        try:
            doc = await read_sheet(old["source"])
        except DocumentError as exc:
            raise HTTPException(status_code=400, detail=f"{old.get('name')}: {exc}") from exc
        doc["version"] = int(old.get("version") or 1) + 1
        documents[doc["id"]] = doc
        fresh.append(doc)
        d = diff_stats(old.get("stats") or {}, doc.get("stats") or {},
                       len((old.get("table") or {}).get("rows") or []), len((doc.get("table") or {}).get("rows") or []))
        diffs.append({"name": doc["name"], "version_before": doc["version"] - 1, "version_after": doc["version"], **d})
    if not any(d["changed"] for d in diffs):
        raise HTTPException(status_code=409, detail="Your sheet hasn't changed since the last analysis.")
    others = [d for d in parent.get("documents") or [] if d not in sheets]
    v = max(d["version_after"] for d in diffs)
    req_followup = FollowupRequest(
        question=f"My numbers were updated (version {v}). What changed, does it change the verdict, and what should I do now?",
        depth=req.depth, strict=req.strict)
    resp = await followup(session_id, req_followup, _override_docs=(others, fresh), _data_diff=diffs)
    return resp


@router.post("/api/session/{session_id}/followup", response_model=ProblemResponse)
async def followup(session_id: str, req: FollowupRequest, _override_docs=None, _data_diff=None) -> ProblemResponse:
    parent = lookup(session_id)
    if parent is None:
        raise HTTPException(status_code=404, detail="Unknown session_id")
    earlier = thread(parent) + [{"session_id": session_id, "question": parent.get("problem_statement"),
                                 "verdict": parent.get("verdict")}]
    prior = {
        "note": "Earlier turns of this conversation. Build on them; don't repeat them.",
        "turns": [{"question": t["question"], "verdict": (t.get("verdict") or "")[:800]} for t in earlier],
        "last_report_excerpt": (parent.get("summary") or "")[:2500],
        "session_ids": [t["session_id"] for t in earlier],
    }
    return _start(SessionState(
        session_id=str(uuid.uuid4()), problem_statement=req.question, depth=req.depth, strict=req.strict,
        stage=req.stage or parent.get("stage"), parent_id=session_id, prior_context=prior,
        documents=_public_docs(_override_docs) if _override_docs else parent.get("documents") or [],
        document_texts=_texts(_override_docs) if _override_docs else
        [documents[d["id"]] for d in parent.get("documents") or [] if d["id"] in documents],
        data_diff=_data_diff,
    ))


def _public_docs(override) -> list[dict]:
    others, fresh = override
    return list(others) + [{k: v for k, v in d.items() if k not in ("text", "preview")} for d in fresh]


def _texts(override) -> list[dict]:
    others, fresh = override
    return [documents[d["id"]] for d in others if d["id"] in documents] + list(fresh)
