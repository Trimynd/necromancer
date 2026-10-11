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


def test_plan_weeks_are_clamped_for_the_gantt():
    from app.agents.soul_binder import _clean_plan
    p = _clean_plan({"tasks": [{"title": "a", "start_week": 0, "end_week": 40}, {"title": "b", "start_week": "x"},
                               {"no_title": True}], "phases": [{"name": "Test", "start_week": 5, "end_week": 2}]})
    assert [(t["start_week"], t["end_week"]) for t in p["tasks"]] == [(1, 13), (1, 1)]
    assert p["phases"][0] == {"name": "Test", "start_week": 5, "end_week": 5}
    assert set(p["review"]) == {"strengths", "risks", "stop_doing"}


def test_run_saved_mid_way_reopens_as_interrupted():
    from fastapi.testclient import TestClient
    from app.main import app
    history.save("dead-run-1", {"status": "in_court", "problem_statement": "q", "parent_id": None},
                 [{"event": "status", "data": "routing", "t": 0.0}])
    c = TestClient(app)
    assert c.get("/api/session/dead-run-1").json()["status"] == "interrupted"
    assert c.get("/api/session/dead-run-1/events").json()["status"] == "interrupted"
    assert 'data: "interrupted"' in c.get("/api/stream/dead-run-1").text
