"""On-demand web research: fetch public sources for a query, vectorize them
into memory, return the best-matching evidence.
"""

import asyncio

import httpx

from app.services import memory
from app.utils.logger import get_logger

logger = get_logger(__name__)

WIKI_API = "https://en.wikipedia.org/w/api.php"
HN_ALGOLIA_URL = "https://hn.algolia.com/api/v1/search"
_HEADERS = {"User-Agent": "NecromancerResearch/0.1 (https://github.com/Trimynd/necromancer)"}


async def _wikipedia(client: httpx.AsyncClient, query: str) -> list[dict]:
    try:
        resp = await client.get(WIKI_API, params={
            "action": "query", "format": "json", "generator": "search", "gsrsearch": query,
            "gsrlimit": 5, "prop": "extracts", "exintro": 1, "explaintext": 1, "exlimit": 5,
        })
        resp.raise_for_status()
        pages = resp.json().get("query", {}).get("pages", {}).values()
    except Exception as exc:
        logger.warning("Wikipedia search failed for %r: %s", query, exc)
        return []
    return [
        {"text": p.get("extract", ""), "title": p["title"],
         "source": f"https://en.wikipedia.org/wiki/{p['title'].replace(' ', '_')}"}
        for p in pages if p.get("extract")
    ]


async def _hacker_news(client: httpx.AsyncClient, query: str) -> list[dict]:
    try:
        resp = await client.get(HN_ALGOLIA_URL, params={"query": query, "tags": "story", "hitsPerPage": 8})
        resp.raise_for_status()
        hits = resp.json().get("hits", [])
    except Exception as exc:
        logger.warning("HN search failed for %r: %s", query, exc)
        return []
    return [
        {"text": f"{h.get('title')} ({h.get('points')} points, {h.get('num_comments')} comments) {h.get('story_text') or ''}",
         "title": h.get("title") or "", "source": f"https://news.ycombinator.com/item?id={h.get('objectID')}"}
        for h in hits if h.get("title")
    ]


# ponytail: Wikipedia + HN only; add a real search API (Brave/Tavily) when coverage matters.
async def web_research(query: str) -> dict:
    """Tool handler: scrape -> vectorize -> return top evidence for the query."""
    async with httpx.AsyncClient(timeout=10.0, headers=_HEADERS) as client:
        wiki, hn = await asyncio.gather(_wikipedia(client, query), _hacker_news(client, query))
    stored = await memory.add(wiki + hn)
    return {"query": query, "chunks_stored": stored, "evidence": await memory.search(query, k=6)}
