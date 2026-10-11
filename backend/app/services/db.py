"""Durable storage: companies, their connectors, and the financial/growth
records those connectors feed in. SQLite — no service, no password, no admin
rights needed. A local Postgres 18 install already sits on port 27972 for
when this needs real concurrent writers; see docs/db-and-connectors.md.
"""

import asyncio
import json
import sqlite3
import uuid
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path

from app.config import settings

BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent


def _resolve_db_path() -> Path:
    path = Path(settings.db_path)
    return path if path.is_absolute() else BACKEND_ROOT / path


DB_PATH = _resolve_db_path()

SCHEMA = """
CREATE TABLE IF NOT EXISTS companies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS connectors (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    type TEXT NOT NULL,
    label TEXT NOT NULL,
    status TEXT NOT NULL,
    config_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    last_synced_at TEXT
);

CREATE TABLE IF NOT EXISTS financial_records (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    connector_id TEXT REFERENCES connectors(id),
    period TEXT NOT NULL,
    revenue REAL,
    costs REAL,
    customers INTEGER,
    metrics_json TEXT NOT NULL DEFAULT '{}',
    source TEXT NOT NULL,
    recorded_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_financial_records_company_period
    ON financial_records(company_id, period);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    company_id TEXT REFERENCES companies(id),
    mode TEXT,
    status TEXT NOT NULL,
    question TEXT,
    verdict TEXT,
    summary TEXT,
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""


@lru_cache
def _conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    conn.commit()
    return conn


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _row(r: sqlite3.Row) -> dict:
    return dict(r)


# ---------- companies ----------

def _create_company_sync(name: str, url: str | None) -> dict:
    conn = _conn()
    company_id = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO companies (id, name, url, created_at) VALUES (?, ?, ?, ?)",
        (company_id, name, url, _now()),
    )
    conn.commit()
    return {"id": company_id, "name": name, "url": url, "created_at": _now()}


def _get_company_sync(company_id: str) -> dict | None:
    conn = _conn()
    row = conn.execute("SELECT * FROM companies WHERE id = ?", (company_id,)).fetchone()
    return _row(row) if row else None


async def create_company(name: str, url: str | None = None) -> dict:
    return await asyncio.to_thread(_create_company_sync, name, url)


async def get_company(company_id: str) -> dict | None:
    return await asyncio.to_thread(_get_company_sync, company_id)


# ---------- connectors ----------

# Only "manual" actually ingests data today. The rest are registered so the
# roadmap is visible in the API, not faked as working integrations.
CONNECTOR_TYPES = {
    "manual": "active",
    "bank_statement": "coming_soon",
    "upi": "coming_soon",
    "pos": "coming_soon",
    "tally": "coming_soon",
    "gst": "coming_soon",
    "google_business_profile": "coming_soon",
}


def _create_connector_sync(company_id: str, type_: str, label: str, config: dict) -> dict:
    conn = _conn()
    connector_id = str(uuid.uuid4())
    status = CONNECTOR_TYPES.get(type_, "unknown")
    conn.execute(
        "INSERT INTO connectors (id, company_id, type, label, status, config_json, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (connector_id, company_id, type_, label, status, json.dumps(config), _now()),
    )
    conn.commit()
    return {
        "id": connector_id, "company_id": company_id, "type": type_, "label": label,
        "status": status, "config": config, "created_at": _now(), "last_synced_at": None,
    }


def _list_connectors_sync(company_id: str) -> list[dict]:
    conn = _conn()
    rows = conn.execute(
        "SELECT * FROM connectors WHERE company_id = ? ORDER BY created_at", (company_id,)
    ).fetchall()
    results = []
    for r in rows:
        d = _row(r)
        d["config"] = json.loads(d.pop("config_json"))
        results.append(d)
    return results


async def create_connector(company_id: str, type_: str, label: str, config: dict | None = None) -> dict:
    return await asyncio.to_thread(_create_connector_sync, company_id, type_, label, config or {})


async def list_connectors(company_id: str) -> list[dict]:
    return await asyncio.to_thread(_list_connectors_sync, company_id)


# ---------- financial records ----------

def _add_financial_record_sync(
    company_id: str, connector_id: str | None, period: str,
    revenue: float | None, costs: float | None, customers: int | None,
    metrics: dict, source: str,
) -> dict:
    conn = _conn()
    record_id = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO financial_records "
        "(id, company_id, connector_id, period, revenue, costs, customers, metrics_json, source, recorded_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (record_id, company_id, connector_id, period, revenue, costs, customers, json.dumps(metrics), source, _now()),
    )
    conn.commit()
    if connector_id:
        conn.execute("UPDATE connectors SET last_synced_at = ? WHERE id = ?", (_now(), connector_id))
        conn.commit()
    return {
        "id": record_id, "company_id": company_id, "connector_id": connector_id, "period": period,
        "revenue": revenue, "costs": costs, "customers": customers, "metrics": metrics,
        "source": source, "recorded_at": _now(),
    }


def _list_financial_records_sync(company_id: str) -> list[dict]:
    conn = _conn()
    rows = conn.execute(
        "SELECT * FROM financial_records WHERE company_id = ? ORDER BY period", (company_id,)
    ).fetchall()
    results = []
    for r in rows:
        d = _row(r)
        d["metrics"] = json.loads(d.pop("metrics_json"))
        results.append(d)
    return results


async def add_financial_record(
    company_id: str, period: str, revenue: float | None = None, costs: float | None = None,
    customers: int | None = None, metrics: dict | None = None,
    connector_id: str | None = None, source: str = "manual",
) -> dict:
    return await asyncio.to_thread(
        _add_financial_record_sync, company_id, connector_id, period, revenue, costs, customers, metrics or {}, source
    )


async def list_financial_records(company_id: str) -> list[dict]:
    return await asyncio.to_thread(_list_financial_records_sync, company_id)


# ---------- sessions (durable history; live state stays in app.state.sessions) ----------

def _save_session_sync(
    session_id: str, status: str, question: str | None, verdict: str | None,
    summary: str | None, error: str | None, company_id: str | None, mode: str | None,
) -> None:
    conn = _conn()
    now = _now()
    existing = conn.execute("SELECT id, created_at FROM sessions WHERE id = ?", (session_id,)).fetchone()
    if existing:
        conn.execute(
            "UPDATE sessions SET status=?, question=?, verdict=?, summary=?, error=?, "
            "company_id=?, mode=?, updated_at=? WHERE id=?",
            (status, question, verdict, summary, error, company_id, mode, now, session_id),
        )
    else:
        conn.execute(
            "INSERT INTO sessions (id, company_id, mode, status, question, verdict, summary, error, "
            "created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (session_id, company_id, mode, status, question, verdict, summary, error, now, now),
        )
    conn.commit()


async def save_session(
    session_id: str, status: str, question: str | None = None, verdict: str | None = None,
    summary: str | None = None, error: str | None = None, company_id: str | None = None,
    mode: str | None = None,
) -> None:
    await asyncio.to_thread(
        _save_session_sync, session_id, status, question, verdict, summary, error, company_id, mode
    )


def _get_session_sync(session_id: str) -> dict | None:
    conn = _conn()
    row = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
    return _row(row) if row else None


async def get_session(session_id: str) -> dict | None:
    return await asyncio.to_thread(_get_session_sync, session_id)
