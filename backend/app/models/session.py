from datetime import datetime, timezone
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field

from app.models.manifest import AgentManifest


class SessionStatus(StrEnum):
    PENDING = "pending"
    SCRAPING = "scraping"
    ROLE_MAKING = "role_making"
    RUNNING = "running"
    DONE = "done"
    ERROR = "error"


class SessionState(BaseModel):
    session_id: str
    status: SessionStatus = SessionStatus.PENDING
    input_url: str | None = None
    problem_statement: str | None = None
    startup_data: dict[str, Any] | None = None
    manifest: AgentManifest | None = None
    pitch: str | None = None
    error: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
