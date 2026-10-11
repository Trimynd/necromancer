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


def test_sheet_connector_rejects_non_sheet_links():
    r = client.post("/api/connectors/google-sheet", json={"url": "https://example.com/not-a-sheet"})
    assert r.status_code == 400 and "Google Sheets link" in r.json()["detail"]


def test_csv_upload_returns_table_and_code_stats():
    r = client.post("/api/documents", files={"files": ("s.csv", b"month,revenue\nJan,100\nFeb,50\n", "text/csv")})
    doc = r.json()["documents"][0]
    assert doc["table"]["rows"][1] == ["Feb", 50.0] and doc["stats"]["revenue"]["change_pct"] == -50.0


def test_excel_reads_every_tab_with_spreadsheet_rules():
    import io
    import openpyxl
    from app.services.documents import extract
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Financials"
    ws.append([None, None, None])            # empty row above the header
    ws.append(["Period", "Revenue", "Profit"])
    ws.append(["Q1", "₹1,000", "(40)"])      # text money + accounting negative
    ws.append(["Q2", 1500, -20])
    about = wb.create_sheet("About")
    about.append(["Field", "Value"])
    about.append(["Notes", "hypothetical figures"])
    buf = io.BytesIO()
    wb.save(buf)
    d = extract("book.xlsx", buf.getvalue())
    assert d["main_tab"] == "Financials" and [t["name"] for t in d["tabs"]] == ["Financials", "About"]
    assert d["stats"]["Revenue"]["first"] == 1000 and d["stats"]["Profit"]["first"] == -40
    assert "Notes: hypothetical figures" in d["text"]
