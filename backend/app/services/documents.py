"""Turn an uploaded company document into plain text the council can use as evidence.

Rules (docs/flow.md): read in memory, never written to disk; text is DATA, never instructions;
CSV is read by code (numbers stay exact); limits keep one upload from eating the token budget.
"""

import csv
import io
import uuid

from docx import Document
from pypdf import PdfReader

MAX_FILES = 3
MAX_BYTES = 5 * 1024 * 1024
MAX_PDF_PAGES = 10
MAX_CHARS = 20_000  # per document, before it is chunked into evidence
CSV_ROWS = 200

KINDS = {".pdf": "pdf", ".csv": "csv", ".txt": "text", ".md": "text", ".docx": "docx"}


class DocumentError(ValueError):
    pass


def _kind(name: str) -> str:
    ext = name[name.rfind("."):].lower() if "." in name else ""
    if ext not in KINDS:
        raise DocumentError(f"{name}: unsupported file type (use PDF, CSV, TXT, MD or DOCX)")
    return KINDS[ext]


def _pdf(data: bytes) -> tuple[str, int]:
    reader = PdfReader(io.BytesIO(data))
    pages = reader.pages[:MAX_PDF_PAGES]
    text = "\n".join(f"[page {i + 1}] {p.extract_text() or ''}" for i, p in enumerate(pages))
    return text, len(reader.pages)


def _csv(data: bytes) -> str:
    rows = list(csv.reader(io.StringIO(data.decode("utf-8-sig", errors="replace"))))
    if not rows:
        return ""
    header, body = rows[0], rows[1 : CSV_ROWS + 1]
    lines = [" | ".join(header)] + [" | ".join(r) for r in body]
    more = f"\n({len(rows) - 1 - len(body)} more rows not shown)" if len(rows) - 1 > len(body) else ""
    return f"Table with columns: {', '.join(header)}\n" + "\n".join(lines) + more


def _number(v: str) -> float | None:
    s = str(v).replace(",", "").replace("\u20b9", "").replace("Rs", "").replace("%", "").strip()
    try:
        return float(s)
    except ValueError:
        return None


def table_and_stats(text: str) -> tuple[dict, dict]:
    """Exact numbers by code (flow.md): per numeric column first/last/min/max/change/trend."""
    rows = list(csv.reader(io.StringIO(text)))
    if len(rows) < 2:
        return {"columns": rows[0] if rows else [], "rows": []}, {}
    header, body = rows[0], rows[1 : CSV_ROWS + 1]
    stats = {}
    for i, col in enumerate(header):
        vals = [_number(r[i]) for r in body if i < len(r)]
        nums = [v for v in vals if v is not None]
        if len(nums) < max(2, 0.6 * len(body)):
            continue
        first, last = nums[0], nums[-1]
        change = round((last - first) / abs(first) * 100, 1) if first else None
        trend = "flat" if change is None or abs(change) < 2 else ("up" if change > 0 else "down")
        # recent = the last 3 rows: catches a recovery that the first-vs-last trend hides
        base = nums[-3] if len(nums) >= 3 else first
        recent = round((last - base) / abs(base) * 100, 1) if base else None
        recent_trend = "flat" if recent is None or abs(recent) < 2 else ("up" if recent > 0 else "down")
        stats[col] = {"first": first, "last": last, "min": min(nums), "max": max(nums), "change_pct": change, "trend": trend,
                      "recent_change_pct": recent, "recent_trend": recent_trend}
    # rows can be ragged (e.g. an unquoted "Rs 1,000" splits into two cells): keep it to the header's width
    typed = [[(_number(c) if header[i] in stats and _number(c) is not None else c) for i, c in enumerate(r[: len(header)])]
             for r in body]
    return {"columns": header, "rows": typed}, stats


def _docx(data: bytes) -> str:
    doc = Document(io.BytesIO(data))
    parts = [p.text for p in doc.paragraphs if p.text.strip()]
    for table in doc.tables:
        parts += [" | ".join(c.text.strip() for c in row.cells) for row in table.rows]
    return "\n".join(parts)


def extract(name: str, data: bytes) -> dict:
    if len(data) > MAX_BYTES:
        raise DocumentError(f"{name}: larger than 5 MB")
    kind = _kind(name)
    pages = None
    try:
        if kind == "pdf":
            text, pages = _pdf(data)
        elif kind == "csv":
            text = _csv(data)
        elif kind == "docx":
            text = _docx(data)
        else:
            text = data.decode("utf-8", errors="replace")
    except DocumentError:
        raise
    except Exception as exc:
        raise DocumentError(f"{name}: could not be read ({type(exc).__name__})") from exc
    text = " ".join(text.split()) if kind != "csv" else text.strip()
    if not text:
        raise DocumentError(f"{name}: no readable text found (scanned PDF?)")
    text = text[:MAX_CHARS]
    doc = {"id": uuid.uuid4().hex[:12], "name": name, "kind": kind, "chars": len(text), "pages": pages,
           "preview": text[:280], "text": text}
    if kind == "csv":
        doc["table"], doc["stats"] = table_and_stats(data.decode("utf-8-sig", errors="replace"))
        doc["text"] = _stats_brief(doc["stats"]) + doc["text"]
    return doc


def _stats_brief(stats: dict) -> str:
    """Code-computed facts put first, so the council quotes exact numbers instead of eyeballing a table."""
    if not stats:
        return ""
    lines = [f"{c}: first {s['first']:g}, latest {s['last']:g}, min {s['min']:g}, max {s['max']:g}"
             + (f", change {s['change_pct']:+g}% ({s['trend']})" if s["change_pct"] is not None else "")
             + (f", last 3 rows {s['recent_change_pct']:+g}% ({s['recent_trend']})" if s.get("recent_change_pct") is not None else "")
             for c, s in stats.items()]
    return "COMPUTED BY CODE (exact): " + "; ".join(lines) + "\n"


if __name__ == "__main__":
    d = extract("sales.csv", b"month,revenue\nJan,100\nFeb,80\n")
    assert d["kind"] == "csv" and "Jan | 100" in d["text"], d
    t = extract("notes.md", b"# Our shop\nWe sell phones in Pune.")
    assert t["kind"] == "text" and "phones" in t["text"]
    for bad, msg in ((("x.exe", b"1"), "unsupported"), (("big.txt", b"a" * (MAX_BYTES + 1)), "5 MB")):
        try:
            extract(*bad)
            raise AssertionError("should have failed")
        except DocumentError as exc:
            assert msg in str(exc)
    tb, st = table_and_stats('month,revenue\nJan,"\u20b91,000"\nFeb,800\nMar,500\n')
    assert table_and_stats("month,revenue\nJan,1,000\nFeb,800\n")[0]["rows"][0] == ["Jan", 1.0]  # ragged row: no crash
    assert st["revenue"]["first"] == 1000 and st["revenue"]["trend"] == "down" and st["revenue"]["change_pct"] == -50
    assert tb["rows"][0] == ["Jan", 1000.0]
    print("documents self-check ok")
