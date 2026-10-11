import os

# Must run before anything imports app.config, which reads env vars at module load.
os.environ.setdefault("GEMINI_API_KEY", "test-key")

import pytest


@pytest.fixture(autouse=True)
def _isolated_history(tmp_path, monkeypatch):
    """Tests must never write fake sessions into the real backend/data/sessions folder."""
    from app.services import history
    monkeypatch.setattr(history, "DIR", tmp_path / "sessions")
