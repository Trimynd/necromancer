"""Long-term evidence memory: BGE embeddings (fastembed, ONNX on CPU) in a
FAISS index saved to disk, with chunk metadata in a JSON file next to it.
Shared across sessions, so every scrape makes later answers richer.

Every chunk is tagged with the session/round/agent that fetched it (via the
`evidence_tag` context var), which is what the Soul Binder's per-round rolling
window filters on.
"""

import asyncio
import hashlib
import json
import threading
from contextvars import ContextVar
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path

import faiss
import numpy as np
from fastembed import TextEmbedding

from app.config import settings

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
INDEX_PATH = DATA_DIR / "evidence.faiss"
META_PATH = DATA_DIR / "evidence_meta.json"

CHUNK_WORDS = 200
CHUNK_OVERLAP = 40

# Set by the orchestrator / agents; copied into every stored chunk's metadata.
evidence_tag: ContextVar[dict] = ContextVar("evidence_tag", default={})

_lock = threading.Lock()


@lru_cache
def _model() -> TextEmbedding:
    # First call downloads the model (~200MB) into fastembed's cache.
    return TextEmbedding(settings.embedding_model)


class _Store:
    def __init__(self):
        self.meta: list[dict] = json.loads(META_PATH.read_text("utf-8")) if META_PATH.exists() else []
        self.index = faiss.read_index(str(INDEX_PATH)) if INDEX_PATH.exists() else None
        self.ids = {m["id"] for m in self.meta}

    def save(self) -> None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        faiss.write_index(self.index, str(INDEX_PATH))
        META_PATH.write_text(json.dumps(self.meta), encoding="utf-8")


@lru_cache
def _store() -> _Store:
    return _Store()


def chunk(text: str) -> list[str]:
    words = text.split()
    if not words:
        return []
    step = CHUNK_WORDS - CHUNK_OVERLAP
    return [" ".join(words[i : i + CHUNK_WORDS]) for i in range(0, max(len(words) - CHUNK_OVERLAP, 1), step)]


def _embed(texts: list[str], query: bool = False) -> np.ndarray:
    model = _model()
    vecs = np.array(list(model.query_embed(texts[0]) if query else model.passage_embed(texts)), dtype="float32")
    faiss.normalize_L2(vecs)  # inner product on unit vectors == cosine
    return vecs


def _add_sync(docs: list[dict], tag: dict) -> int:
    store = _store()
    now = datetime.now(timezone.utc).isoformat()
    texts, metas = [], []
    for doc in docs:
        for piece in chunk(doc.get("text", "")):
            cid = hashlib.sha1(piece.encode()).hexdigest()
            if cid in store.ids or cid in {m["id"] for m in metas}:
                continue
            texts.append(piece)
            metas.append({
                "id": cid, "text": piece, "source": doc.get("source", ""), "title": doc.get("title", ""),
                "source_type": doc.get("source_type", "web"), "published": doc.get("published", ""),
                "stored_at": now, **tag,
            })
    if not texts:
        return 0

    vecs = _embed(texts)
    with _lock:
        if store.index is None:
            store.index = faiss.IndexFlatIP(vecs.shape[1])
        store.index.add(vecs)
        store.meta.extend(metas)
        store.ids.update(m["id"] for m in metas)
        store.save()
    return len(texts)


def _matches(meta: dict, where: dict | None) -> bool:
    if not where:
        return True
    for key, want in where.items():
        have = meta.get(key)
        if isinstance(want, (list, set, tuple)):
            if have not in want:
                return False
        elif have != want:
            return False
    return True


# ponytail: flat index + post-filter (over-fetch then filter); fine to ~100k chunks,
# switch to IndexIVFFlat / per-session indexes past that.
def _search_sync(query: str, k: int, where: dict | None) -> list[dict]:
    store = _store()
    if store.index is None or store.index.ntotal == 0:
        return []
    fetch = store.index.ntotal if where else min(k, store.index.ntotal)
    scores, idxs = store.index.search(_embed([query], query=True), fetch)
    hits = []
    for score, i in zip(scores[0], idxs[0]):
        if i < 0:
            continue
        meta = store.meta[i]
        if _matches(meta, where):
            hits.append({**{k_: meta.get(k_) for k_ in ("text", "source", "title", "source_type", "published", "agent_id", "round")},
                         "score": round(float(score), 3)})
            if len(hits) == k:
                break
    return hits


async def add(docs: list[dict]) -> int:
    """docs: [{"text", "source", "title", "source_type", "published"}]. Returns chunks stored."""
    return await asyncio.to_thread(_add_sync, docs, dict(evidence_tag.get()))


async def search(query: str, k: int = 6, where: dict | None = None) -> list[dict]:
    return await asyncio.to_thread(_search_sync, query, k, where)


async def rolling_window(query: str, session_id: str, round_num: int, k: int = 20) -> list[dict]:
    """Evidence fetched in this session during the current or previous round."""
    return await search(query, k, where={"session_id": session_id, "round": [round_num, round_num - 1]})


async def search_memory(query: str, k: int = 6) -> dict:
    """Tool handler: agents call this to pull evidence from memory."""
    return {"query": query, "evidence": await search(query, k)}


if __name__ == "__main__":
    assert chunk("   ") == []
    words = " ".join(f"w{i}" for i in range(450))
    pieces = chunk(words)
    assert pieces[0].split()[0] == "w0" and pieces[-1].split()[-1] == "w449", pieces
    assert all(len(p.split()) <= CHUNK_WORDS for p in pieces)
    assert _matches({"round": 1, "session_id": "s"}, {"session_id": "s", "round": [1, 0]})
    assert not _matches({"round": 3, "session_id": "s"}, {"session_id": "s", "round": [1, 0]})
    print("memory self-check ok")
