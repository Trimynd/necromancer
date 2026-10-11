from datetime import datetime, timezone
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field

from app.models.manifest import AgentManifest


class SessionStatus(StrEnum):
    PENDING = "pending"
    ROUTING = "routing"
    SCRAPING = "scraping"
    RESEARCHING = "researching"
    ROLE_MAKING = "role_making"
    IN_COURT = "in_court"
    SUMMARIZING = "summarizing"
    DONE = "done"
    ERROR = "error"


class SessionState(BaseModel):
    session_id: str
    status: SessionStatus = SessionStatus.PENDING
    input_url: str | None = None
    problem_statement: str | None = None
    depth: str = "deep"  # "fast" | "deep"
    strict: bool = False
    stage: str | None = None  # launch | grow | rescue | revive (the user's pick; None = let the court infer)
    # Multi-turn: a follow-up points at the case it continues; prior_context briefs its council.
    parent_id: str | None = None
    prior_context: dict[str, Any] | None = Field(default=None, exclude=True)
    # Uploaded company documents: metadata is public (UI), full text stays server-side only.
    documents: list[dict] = Field(default_factory=list)
    document_texts: list[dict] = Field(default_factory=list, exclude=True)
    startup_data: dict[str, Any] | None = None
    route: dict[str, Any] | None = None
    manifest: AgentManifest | None = None
    cases: dict[str, Any] | None = None
    verdict: str | None = None
    summary: str | None = None
    scores: dict[str, Any] | None = None
    plan: dict[str, Any] | None = None
    usage: dict[str, Any] | None = None
    error: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
