from fastapi import APIRouter, HTTPException, UploadFile

from app.services.documents import MAX_FILES, DocumentError, extract
from app.state import documents

router = APIRouter(tags=["documents"])


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
        out.append({k: doc[k] for k in ("id", "name", "kind", "chars", "pages", "preview")})
    return {"documents": out}
