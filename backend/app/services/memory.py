"""Long-term evidence memory: BGE embeddings (fastembed, ONNX on CPU) in a
persistent Chroma collection. Shared across sessions, so every scrape makes
later answers richer.
"""

import asyncio
import hashlib
from functools import lru_cache
from pathlib import Path

import chromadb
from fastembed import TextEmbedding

from app.config import settings

CHROMA_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "chroma"

CHUNK_WORDS = 200
CHUNK_OVERLAP = 40


@lru_cache
def _model() -> TextEmbedding:
    # First call downloads the model (~200MB) into fastembed's cache.
    return TextEmbedding(settings.embedding_model)


@lru_cache
def _collection():
    client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    return client.get_or_create_collection("evidence", metadata={"hnsw:space": "cosine"}, embedding_function=None)


def chunk(text: str) -> list[str]:
    words = text.split()
    if not words:
        return []
    step = CHUNK_WORDS - CHUNK_OVERLAP
    return [" ".join(words[i : i + CHUNK_WORDS]) for i in range(0, max(len(words) - CHUNK_OVERLAP, 1), step)]


def _add_sync(docs: list[dict]) -> int:
    texts, metas = [], []
    for doc in docs:
        for piece in chunk(doc.get("text", "")):
            texts.append(piece)
            metas.append({"source": doc.get("source", ""), "title": doc.get("title", "")})
    if not texts:
        return 0

    ids = [hashlib.sha1(t.encode()).hexdigest() for t in texts]  # same text -> same id -> no duplicates
    vectors = [v.tolist() for v in _model().passage_embed(texts)]
    _collection().upsert(ids=ids, embeddings=vectors, documents=texts, metadatas=metas)
    return len(texts)


def _search_sync(query: str, k: int) -> list[dict]:
    col = _collection()
    if col.count() == 0:
        return []
    vector = next(iter(_model().query_embed(query))).tolist()
    res = col.query(query_embeddings=[vector], n_results=min(k, col.count()))
    return [
        {"text": doc, "source": meta.get("source"), "title": meta.get("title"), "score": round(1 - dist, 3)}
        for doc, meta, dist in zip(res["documents"][0], res["metadatas"][0], res["distances"][0])
    ]


async def add(docs: list[dict]) -> int:
    """docs: [{"text", "source", "title"}]. Returns number of chunks stored."""
    return await asyncio.to_thread(_add_sync, docs)


async def search(query: str, k: int = 6) -> list[dict]:
    return await asyncio.to_thread(_search_sync, query, k)


async def search_memory(query: str, k: int = 6) -> dict:
    """Tool handler: agents call this to pull evidence from memory."""
    return {"query": query, "evidence": await search(query, k)}


if __name__ == "__main__":
    assert chunk("   ") == []
    words = " ".join(f"w{i}" for i in range(450))
    pieces = chunk(words)
    assert pieces[0].split()[0] == "w0" and pieces[-1].split()[-1] == "w449", pieces
    assert all(len(p.split()) <= CHUNK_WORDS for p in pieces)
    print("chunk ok:", len(pieces), "chunks")
