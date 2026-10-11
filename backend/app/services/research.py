"""On-demand multi-source web research: fetch several free public sources for
a query, vectorize everything into memory (tagged by source type), and
return the best evidence plus a per-source count so agents can say
"this came from N different sources".
"""

import asyncio
import xml.etree.ElementTree as ET

import httpx
import trafilatura
import yfinance as yf
from bs4 import BeautifulSoup
from ddgs import DDGS

from app.services import memory
from app.utils.logger import get_logger

logger = get_logger(__name__)

WIKI_API = "https://en.wikipedia.org/w/api.php"
HN_ALGOLIA_URL = "https://hn.algolia.com/api/v1/search"
GNEWS_RSS = "https://news.google.com/rss/search"
_HEADERS = {"User-Agent": "NecromancerResearch/0.1 (https://github.com/Trimynd/necromancer)"}

SOURCES = ["web", "news", "reddit", "hackernews", "wikipedia", "finance", "jobs", "reviews"]
DEFAULT_SOURCES = ["web", "news", "reddit", "hackernews", "wikipedia"]  # finance/jobs/reviews are opt-in
PAGES_TO_READ = 3  # full-page fetches for top web results; snippets for the rest


def _text(html: str, limit: int = 4000) -> str:
    return " ".join(BeautifulSoup(html, "html.parser").get_text(" ", strip=True).split())[:limit]


async def _ddg(query: str, source_type: str, n: int = 8) -> list[dict]:
    try:
        hits = await asyncio.to_thread(lambda: DDGS().text(query, max_results=n))
    except Exception as exc:
        logger.warning("DuckDuckGo failed for %r: %s", query, exc)
        return []
    return [{"text": f"{h['title']}. {h['body']}", "title": h["title"], "source": h["href"], "source_type": source_type}
            for h in hits]


async def _web(client: httpx.AsyncClient, query: str) -> list[dict]:
    docs = await _ddg(query, "web")

    async def read(doc: dict) -> None:
        try:
            resp = await client.get(doc["source"])
            if resp.status_code == 200 and "html" in resp.headers.get("content-type", ""):
                # trafilatura keeps the article body and drops nav/ads/footers; BS4 dump as fallback
                body = await asyncio.to_thread(trafilatura.extract, resp.text) or ""
                if len(body) > 300:  # shorter = JS/cookie wall ("Enable JavaScript..."); keep the snippet
                    doc["text"] = f"{doc['text']} {body[:6000]}"
        except Exception:
            pass  # keep the snippet

    await asyncio.gather(*(read(d) for d in docs[:PAGES_TO_READ]))
    return docs


async def _reddit(client: httpx.AsyncClient, query: str) -> list[dict]:
    # Reddit's JSON API 403s anonymous clients; search it through DuckDuckGo instead.
    return await _ddg(f"{query} site:reddit.com", "reddit", n=6)


async def _news(client: httpx.AsyncClient, query: str) -> list[dict]:
    try:
        resp = await client.get(GNEWS_RSS, params={"q": query, "hl": "en-IN", "gl": "IN", "ceid": "IN:en"})
        resp.raise_for_status()
        items = ET.fromstring(resp.text).iter("item")
    except Exception as exc:
        logger.warning("Google News failed for %r: %s", query, exc)
        return []
    docs = []
    for item in list(items)[:10]:
        title = item.findtext("title", "")
        docs.append({"text": f"{title}. {_text(item.findtext('description', ''), 500)}", "title": title,
                     "source": item.findtext("link", ""), "source_type": "news",
                     "published": item.findtext("pubDate", "")})
    return docs


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
        {"text": p.get("extract", ""), "title": p["title"], "source_type": "wikipedia",
         "source": f"https://en.wikipedia.org/wiki/{p['title'].replace(' ', '_')}"}
        for p in pages if p.get("extract")
    ]


async def _hackernews(client: httpx.AsyncClient, query: str) -> list[dict]:
    try:
        resp = await client.get(HN_ALGOLIA_URL, params={"query": query, "tags": "story", "hitsPerPage": 8})
        resp.raise_for_status()
        hits = resp.json().get("hits", [])
    except Exception as exc:
        logger.warning("HN search failed for %r: %s", query, exc)
        return []
    return [
        {"text": f"{h.get('title')} ({h.get('points')} points, {h.get('num_comments')} comments) {h.get('story_text') or ''}",
         "title": h.get("title") or "", "source_type": "hackernews", "published": h.get("created_at", ""),
         "source": f"https://news.ycombinator.com/item?id={h.get('objectID')}"}
        for h in hits if h.get("title")
    ]


async def _jobs(client: httpx.AsyncClient, query: str) -> list[dict]:
    # Hiring velocity / skill demand signal. Job boards block scrapers, search engines don't.
    return await _ddg(f"{query} jobs site:naukri.com OR site:linkedin.com/jobs OR site:indeed.com", "jobs", n=6)


async def _reviews(client: httpx.AsyncClient, query: str) -> list[dict]:
    # Customer sentiment from review sites.
    return await _ddg(f"{query} reviews site:trustpilot.com OR site:g2.com OR site:mouthshut.com OR site:play.google.com",
                      "reviews", n=6)


def _finance_sync(query: str) -> list[dict]:
    quotes = yf.Search(query, max_results=2).quotes
    docs = []
    for q in quotes:
        info = yf.Ticker(q["symbol"]).info
        fields = ("longName", "sector", "industry", "country", "marketCap", "totalRevenue", "revenueGrowth",
                  "grossMargins", "profitMargins", "ebitda", "totalCash", "totalDebt", "fullTimeEmployees")
        facts = "; ".join(f"{k}={info[k]}" for k in fields if info.get(k) is not None)
        summary = (info.get("longBusinessSummary") or "")[:1500]
        docs.append({"text": f"{q['symbol']} ({q.get('shortname', '')}) financials: {facts}. {summary}",
                     "title": f"{q['symbol']} financials", "source_type": "finance",
                     "source": f"https://finance.yahoo.com/quote/{q['symbol']}"})
    return docs


async def _finance(client: httpx.AsyncClient, query: str) -> list[dict]:
    # Public-company numbers (Yahoo Finance). Only useful when the query names a listed company.
    try:
        return await asyncio.to_thread(_finance_sync, query)
    except Exception as exc:
        logger.warning("Yahoo Finance failed for %r: %s", query, exc)
        return []


_FETCHERS = {"web": _web, "news": _news, "reddit": _reddit, "hackernews": _hackernews, "wikipedia": _wikipedia,
             "finance": _finance, "jobs": _jobs, "reviews": _reviews}


async def _bounded(coro, name: str, timeout: float = 20) -> list[dict]:
    try:
        return await asyncio.wait_for(coro, timeout)
    except asyncio.TimeoutError:
        logger.warning("Source %s timed out", name)
        return []


async def web_research(query: str, sources: list[str] | None = None) -> dict:
    """Tool handler: multi-source scrape -> vectorize -> top evidence + per-source counts."""
    chosen = [s for s in (sources or DEFAULT_SOURCES) if s in _FETCHERS] or DEFAULT_SOURCES
    async with httpx.AsyncClient(timeout=10.0, headers=_HEADERS, follow_redirects=True) as client:
        results = await asyncio.gather(*(_bounded(_FETCHERS[s](client, query), s) for s in chosen))

    per_source = {s: len(docs) for s, docs in zip(chosen, results)}
    stored = await memory.add([d for docs in results for d in docs])
    evidence = await memory.search(query, k=8, where={"source_type": chosen})
    return {"query": query, "per_source": per_source, "chunks_stored": stored, "evidence": evidence}
