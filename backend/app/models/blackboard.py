from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field


class BlackboardEvent(BaseModel):
    """One event emitted to the SSE stream for a session."""

    event: str
    data: Any
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
