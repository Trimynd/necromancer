# Necromancer backend

FastAPI backend for Necromancer. Agent topology is not hardcoded: the
**Role Maker** (`app/agents/role_maker.py`) reads the problem and generates
the team (`AgentManifest`); `AgentFactory` spawns a generic `BaseAgent` per
role; the `Orchestrator` runs rounds until the hub agent signals it's ready
to pitch.

## Setup

From the repo root (venv lives at `necromancer/.venv`, not inside `backend/`):

```bash
python -m venv .venv
./.venv/Scripts/pip install -r backend/requirements.txt   # Windows
# .venv/bin/pip install -r backend/requirements.txt        # macOS/Linux

cp backend/.env.example backend/.env   # then fill in GEMINI_API_KEY
```

## Run

```bash
cd backend
../.venv/Scripts/python -m uvicorn app.main:app --reload
```

## Test

```bash
cd backend
../.venv/Scripts/python -m pytest
```

## Endpoints

- `POST /api/revive {url}` — scrape a dead startup, spawn a team, run the
  resurrection, stream progress.
- `POST /api/problem {problem_statement}` — same flow without scraping.
- `GET /api/stream/{session_id}` — SSE: `status`, `startup_data`, `manifest`,
  `round`, `agent_output`, `pitch`, `error` events.
- `GET /api/session/{session_id}` — polling fallback if SSE drops.
- `GET /zombie/{slug}.html` — generated landing pages.

## Notes

- The blackboard is in-memory (per-process). Swap `app/services/blackboard.py`
  for Redis if this needs to scale past one process — the interface
  (`write`/`read_relevant`/`emit`/`subscribe`) is designed to move there
  without touching callers.
- `GEMMA_MODEL_HUB`/`GEMMA_MODEL_SPECIALIST` default to real `gemma-3-*`
  models; swap them once Gemma 4 ships.
