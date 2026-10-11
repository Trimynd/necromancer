from fastapi.testclient import TestClient

from app.main import app
from app.state import documents

client = TestClient(app)


def test_upload_csv_returns_id_and_keeps_text_in_memory():
    r = client.post("/api/documents", files={"files": ("sales.csv", b"month,revenue\nJan,100\nFeb,80\n", "text/csv")})
    assert r.status_code == 200, r.text
    doc = r.json()["documents"][0]
    assert doc["kind"] == "csv" and "text" not in doc  # full text never echoed back
    assert "Feb | 80" in documents[doc["id"]]["text"]


def test_upload_rejects_unsupported_type():
    r = client.post("/api/documents", files={"files": ("virus.exe", b"MZ", "application/octet-stream")})
    assert r.status_code == 400 and "unsupported" in r.json()["detail"]


def test_problem_rejects_unknown_document_id():
    r = client.post("/api/problem", json={"problem_statement": "my shop", "document_ids": ["nope"]})
    assert r.status_code == 400 and "Unknown document ids" in r.json()["detail"]
