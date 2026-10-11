from fastapi import APIRouter, HTTPException, UploadFile
from pydantic import BaseModel

from app.services.documents import MAX_FILES, DocumentError, extract
from app.services.google_sheets import read_sheet
from app.state import documents

router = APIRouter(tags=["documents"])


def public(doc: dict) -> dict:
    """What the browser may see: everything except the full extracted text."""
    return {k: v for k, v in doc.items() if k != "text"}


@router.post("/api/documents")
async def upload_documents(files: list[UploadFile]) -> dict:
    """Read uploaded company documents into memory; pass the returned ids to /api/problem."""
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")
    if len(files) > MAX_FILES:
        raise HTTPException(status_code=400, detail=f"At most {MAX_FILES} files")
    out = []
    for f in files:
        try:
            doc = extract(f.filename or "document", await f.read())
        except DocumentError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        documents[doc["id"]] = doc  # ponytail: in-process dict, never on disk; lost on restart by design
        out.append(public(doc))
    return {"documents": out}


class SheetRequest(BaseModel):
    url: str


@router.post("/api/connectors/google-sheet")
async def connect_google_sheet(req: SheetRequest) -> dict:
    """Read a shared Google Sheet (Anyone with the link → Viewer) into evidence; same shape as /api/documents."""
    try:
        doc = await read_sheet(req.url)
    except DocumentError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    documents[doc["id"]] = doc
    return {"documents": [public(doc)]}
