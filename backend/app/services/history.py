"""Finished runs on disk: every SSE event + the session snapshot, so a past case reopens with all its
charts and testimony instantly, even after a backend restart. One JSON file per session."""

import json
from pathlib import Path

DIR = Path(__file__).resolve().parent.parent.parent / "data" / "sessions"


def _path(session_id: str) -> Path:
    # session ids are uuids; refuse anything that could walk out of DIR
    if not session_id.replace("-", "").isalnum():
        raise ValueError("bad session id")
    return DIR / f"{session_id}.json"


def save(session_id: str, snapshot: dict, events: list[dict]) -> None:
    DIR.mkdir(parents=True, exist_ok=True)
    _path(session_id).write_text(json.dumps({"session": snapshot, "events": events}, default=str), encoding="utf-8")


def load(session_id: str) -> dict | None:
    try:
        p = _path(session_id)
    except ValueError:
        return None
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None
