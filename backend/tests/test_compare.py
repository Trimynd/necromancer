import io
import sys
from pathlib import Path

from fastapi.testclient import TestClient
from openpyxl import Workbook

from app.main import app
from app.services.spreadsheets import parse_number

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import make_sample_excels  # noqa: E402

client = TestClient(app)
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _xlsx(rows) -> bytes:
    wb = Workbook()
    for r in rows:
        wb.active.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _post(*named):
    return client.post("/api/compare", files=[("files", (n, d, XLSX)) for n, d in named])


def test_parse_number_handles_money_formats():
    assert parse_number("₹1,234 Cr") == 1234 and parse_number("(120)") == -120 and parse_number("12.5%") == 12.5
    assert parse_number("Q1 FY24") is None and parse_number(None) is None


def test_upload_xlsx_as_document():
    data = _xlsx([["Month", "Revenue"], ["Jan", 100], ["Feb", 80]])
    r = client.post("/api/documents", files={"files": ("sales.xlsx", data, XLSX)})
    assert r.status_code == 200, r.text
    assert r.json()["documents"][0]["kind"] == "xlsx"


def test_same_layout_changed_values_shows_cells_and_verdict_change():
    header = ["Period", "Revenue", "Expenses", "Net Profit"]
    base = _xlsx([header, ["Q1", 100, 90, 10], ["Q2", 110, 95, 15], ["Q3", 125, 100, 25]])
    worse = _xlsx([header, ["Q1", 100, 90, 10], ["Q2", 95, 110, -15], ["Q3", 90, 120, -30]])
    r = _post(("base.xlsx", base), ("worse.xlsx", worse))
    assert r.status_code == 200, r.text
    body = r.json()
    diff = body["diffs"]["0-1"]
    assert diff["cells"]["paired_by"] == "label"
    changed = {(c["row"], c["column"]) for c in diff["cells"]["changes"]}
    assert ("Q2", "Revenue") in changed and ("Q1", "Revenue") not in changed
    a, b = (w["verdict"] for w in body["workbooks"])
    assert b["overall"] < a["overall"] and diff["verdict"]["overall"]["delta"] < 0
    assert diff["verdict"]["drivers"] and all(w["document_id"] for w in body["workbooks"])


def test_sample_workbooks_compare(tmp_path):
    paths = {p.stem: p.read_bytes() for p in make_sample_excels.main(tmp_path)}
    r = _post(*((f"{k}.xlsx", paths[k]) for k in ("zomato_fy2023", "zomato_fy2024")))
    assert r.status_code == 200, r.text
    zomato = r.json()
    assert zomato["diffs"]["0-1"]["cells"]["paired_by"] == "position"  # Q1 FY23 vs Q1 FY24
    assert zomato["workbooks"][1]["verdict"]["overall"] > zomato["workbooks"][0]["verdict"]["overall"]
    assert zomato["workbooks"][0]["financials"]["series"]["revenue"][0] == 1414

    r = _post(*((f"{k}.xlsx", paths[k]) for k in ("nykaa_fy2025", "nykaa_fy2025_whatif")))
    nykaa = r.json()
    assert nykaa["workbooks"][1]["verdict"]["overall"] < nykaa["workbooks"][0]["verdict"]["overall"]


def test_compare_needs_two_to_six_spreadsheets():
    one = _xlsx([["Period", "Revenue"], ["Q1", 1]])
    assert _post(("a.xlsx", one)).status_code == 400
    assert _post(*((f"{i}.xlsx", one) for i in range(7))).status_code == 400
    r = client.post("/api/compare", files=[("files", ("a.pdf", b"%PDF", "application/pdf"))] * 2)
    assert r.status_code == 400


def test_excel_document_gets_table_stats_and_code_verdict(tmp_path):
    paths = {p.stem: p.read_bytes() for p in make_sample_excels.main(tmp_path)}
    from app.services.documents import extract
    d = extract("nykaa_fy2025.xlsx", paths["nykaa_fy2025"])
    assert d["kind"] == "xlsx" and len(d["table"]["rows"]) == 4
    assert d["stats"]["Revenue (₹ Cr)"]["last"] == 2062
    assert d["ledger"]["overall"] is not None
    assert d["text"].startswith("CODE HEALTH SCORE")  # the council reads the exact score + stats first


def test_update_data_swaps_a_file_and_diffs_cells_and_verdict(tmp_path, monkeypatch):
    from app.routes import problem as problem_routes
    from app.services import history
    from app.services.documents import extract

    monkeypatch.setattr(history, "DIR", tmp_path)
    paths = {p.stem: p.read_bytes() for p in make_sample_excels.main(tmp_path / "samples")}
    v1 = extract("nykaa_fy2025.xlsx", paths["nykaa_fy2025"])
    meta = {k: v for k, v in v1.items() if k not in ("text", "preview")}
    history.save("case-1", {"status": "done", "problem_statement": "q", "verdict": "GO", "documents": [meta]}, [])
    started = []
    monkeypatch.setattr(problem_routes, "_start", lambda s: started.append(s) or problem_routes.ProblemResponse(
        session_id=s.session_id, stream_url="", parent_id=s.parent_id))

    r = client.post("/api/session/case-1/update-data", data={"document_id": v1["id"], "depth": "fast"},
                    files={"file": ("nykaa_fy2025_whatif.xlsx", paths["nykaa_fy2025_whatif"], XLSX)})
    assert r.status_code == 200, r.text
    s = started[0]
    assert s.parent_id == "case-1" and s.documents[0]["name"] == "nykaa_fy2025_whatif.xlsx" and s.documents[0]["version"] == 2
    assert "nykaa_fy2025_whatif" in s.document_texts[0]["text"] or s.document_texts[0]["name"].startswith("nykaa")
    d = s.data_diff[0]
    changed = {(c["row"], c["column"]) for c in d["cells"]["changes"]}
    assert ("Q1 FY25", "Total Expenses (₹ Cr)") in changed and ("Q1 FY25", "Revenue (₹ Cr)") not in changed
    assert d["verdict"]["overall"]["delta"] < 0  # costs up 3% -> lower code verdict

    same = client.post("/api/session/case-1/update-data", data={"document_id": v1["id"]},
                       files={"file": ("again.xlsx", paths["nykaa_fy2025"], XLSX)})
    assert same.status_code == 409
    bad = client.post("/api/session/case-1/update-data", data={"document_id": "nope"},
                      files={"file": ("x.xlsx", paths["nykaa_fy2025"], XLSX)})
    assert bad.status_code == 400


def test_google_sheet_file_download(monkeypatch):
    from app.routes import documents as doc_routes

    data = _xlsx([["Month", "Revenue"], ["Jan", 1], ["Feb", 2]])

    async def fake(url):
        return "Shop / sales", data, "https://docs.google.com/spreadsheets/d/x"
    monkeypatch.setattr(doc_routes, "fetch_xlsx", fake)
    r = client.post("/api/connectors/google-sheet/file", json={"url": "https://docs.google.com/spreadsheets/d/x"})
    assert r.status_code == 200 and r.content == data
    assert "Shop%20sales.xlsx" in r.headers["content-disposition"]
