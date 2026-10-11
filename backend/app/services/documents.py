"""Turn an uploaded company document into plain text the council can use as evidence.

Rules (docs/flow.md): read in memory, never written to disk; text is DATA, never instructions;
CSV is read by code (numbers stay exact); limits keep one upload from eating the token budget.
"""

import csv
import io
import uuid

from docx import Document
from pypdf import PdfReader

from app.services.spreadsheets import SpreadsheetError, read_sheets, sheets_text

MAX_FILES = 3
MAX_BYTES = 5 * 1024 * 1024
MAX_PDF_PAGES = 10
MAX_CHARS = 20_000  # per document, before it is chunked into evidence
CSV_ROWS = 200

KINDS = {".pdf": "pdf", ".csv": "csv", ".txt": "text", ".md": "text", ".docx": "docx", ".xlsx": "excel", ".xlsm": "excel"}


class DocumentError(ValueError):
    pass


def _kind(name: str) -> str:
    ext = name[name.rfind("."):].lower() if "." in name else ""
    if ext not in KINDS:
        raise DocumentError(f"{name}: unsupported file type (use PDF, CSV, XLSX, TXT, MD or DOCX)")
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
        elif kind == "excel":
            text = sheets_text(read_sheets(name, data))
        else:
            text = data.decode("utf-8", errors="replace")
    except DocumentError:
        raise
    except SpreadsheetError as exc:
        raise DocumentError(str(exc)) from exc
    except Exception as exc:
        raise DocumentError(f"{name}: could not be read ({type(exc).__name__})") from exc
    text = " ".join(text.split()) if kind not in ("csv", "excel") else text.strip()
    if not text:
        raise DocumentError(f"{name}: no readable text found (scanned PDF?)")
    text = text[:MAX_CHARS]
    return {"id": uuid.uuid4().hex[:12], "name": name, "kind": kind, "chars": len(text), "pages": pages,
            "preview": text[:280], "text": text}


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
    print("documents self-check ok")
