from app.routes import problem as problem_routes
from app.services import history, memory


def test_history_roundtrip_and_rejects_path_tricks(tmp_path, monkeypatch):
    monkeypatch.setattr(history, "DIR", tmp_path)
    history.save("abc-123", {"status": "done"}, [{"event": "verdict", "data": "GO"}])
    assert history.load("abc-123")["events"][0]["data"] == "GO"
    assert history.load("../../etc/passwd") is None


def test_thread_walks_parents_oldest_first(monkeypatch):
    snaps = {
        "a": {"problem_statement": "Should I launch?", "verdict": "PIVOT", "status": "done", "parent_id": None},
        "b": {"problem_statement": "What makes it a GO?", "verdict": "GO if...", "status": "done", "parent_id": "a"},
    }
    monkeypatch.setattr(problem_routes, "lookup", lambda sid: snaps.get(sid))
    turns = problem_routes.thread({"parent_id": "b"})
    assert [t["session_id"] for t in turns] == ["a", "b"] and turns[0]["verdict"] == "PIVOT"


def test_followup_memory_scope_covers_earlier_turns():
    token = memory.evidence_tag.set({"session_id": "b", "round": 0, "scope": ["b", "a"]})
    try:
        assert memory.session_scope() == {"session_id": ["b", "a"]}
        assert memory._matches({"session_id": "a"}, memory.session_scope())
        assert not memory._matches({"session_id": "zzz"}, memory.session_scope())
    finally:
        memory.evidence_tag.reset(token)
