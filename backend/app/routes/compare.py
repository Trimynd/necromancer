from fastapi import APIRouter, HTTPException, UploadFile

from app.services.documents import MAX_BYTES, DocumentError, extract
from app.services.spreadsheets import SpreadsheetError, analyze, compare
from app.state import documents

router = APIRouter(tags=["compare"])

MIN_FILES, MAX_FILES = 2, 6


@router.post("/api/compare")
async def compare_workbooks(files: list[UploadFile]) -> dict:
    """2-6 Excel/CSV workbooks, oldest first: a verdict for each (computed in code) and, for every
    earlier -> later pair, the changed cells and how they moved the verdict."""
    if not MIN_FILES <= len(files) <= MAX_FILES:
        raise HTTPException(status_code=400, detail=f"Upload {MIN_FILES}-{MAX_FILES} spreadsheets to compare")
    workbooks, document_ids = [], []
    for f in files:
        name, data = f.filename or "workbook.xlsx", await f.read()
        if len(data) > MAX_BYTES:
            raise HTTPException(status_code=400, detail=f"{name}: larger than 5 MB")
        try:
            workbooks.append(analyze(name, data))
            doc = extract(name, data)  # also usable as court evidence via /api/problem document_ids
        except (SpreadsheetError, DocumentError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        documents[doc["id"]] = doc
        document_ids.append(doc["id"])
    result = compare(workbooks)
    for w, doc_id in zip(result["workbooks"], document_ids):
        w["document_id"] = doc_id
    return result
