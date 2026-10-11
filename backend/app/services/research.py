"""On-demand multi-source web research: fetch several free public sources for
a query, vectorize everything into memory (tagged by source type), and
return the best evidence plus a per-source count so agents can say
"this came from N different sources".
"""

import asyncio
import re
from contextvars import ContextVar
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

SOURCES = ["web", "news", "reddit", "hackernews", "wikipedia", "finance", "jobs", "reviews", "economy", "google"]
# Set by the orchestrator; fast mode skips sources that cost a Gemma call (~25s).
research_mode: ContextVar[str] = ContextVar("research_mode", default="deep")
SLOW_SOURCES = {"google"}

DEFAULT_SOURCES = ["web", "news", "reddit", "hackernews", "wikipedia"]  # finance/jobs/reviews are opt-in
PAGES_TO_READ = 3  # full-page fetches for top web results; snippets for the rest


def _text(html: str, limit: int = 4000) -> str:
    return " ".join(BeautifulSoup(html, "html.parser").get_text(" ", strip=True).split())[:limit]


# DuckDuckGo throttles bursts ("No results found" for ~20 queries in a few seconds); cap concurrency.
_DDG_SLOTS = asyncio.Semaphore(4)


async def _ddg(query: str, source_type: str, n: int = 8) -> list[dict]:
    try:
        async with _DDG_SLOTS:
            hits = await asyncio.to_thread(lambda: DDGS().text(query, max_results=n))
    except Exception as exc:
        logger.warning("DuckDuckGo failed for %r: %s", query, exc)
        return []
    return [{"text": f"{h['title']}. {h['body']}", "title": h["title"], "source": h["href"], "source_type": source_type}
            for h in hits]


async def _read_page(client: httpx.AsyncClient, doc: dict) -> None:
    """Fetch the page itself and append its article text; keeps the snippet on any failure."""
    try:
        resp = await client.get(doc["source"])
        doc["source"] = str(resp.url)  # resolves redirects (e.g. Google grounding links) to the real URL
        if resp.status_code == 200 and "html" in resp.headers.get("content-type", ""):
            # trafilatura keeps the article body and drops nav/ads/footers
            body = await asyncio.to_thread(trafilatura.extract, resp.text) or ""
            if len(body) > 300:  # shorter = JS/cookie wall ("Enable JavaScript..."); keep the snippet
                doc["text"] = f"{doc['text']} {body[:3000]}"
    except Exception:
        pass


async def _web(client: httpx.AsyncClient, query: str) -> list[dict]:
    docs = await _ddg(query, "web")
    await asyncio.gather(*(_read_page(client, d) for d in docs[:PAGES_TO_READ]))
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


WORLD_BANK = "https://api.worldbank.org/v2/country/IND/indicator/{}"
_INDICATORS = {"NY.GDP.MKTP.KD.ZG": "GDP growth %", "FP.CPI.TOTL.ZG": "inflation %",
               "SP.POP.TOTL": "population", "NY.GDP.PCAP.CD": "GDP per capita USD"}


async def _economy(client: httpx.AsyncClient, query: str) -> list[dict]:
    """India macro context from the World Bank (free, no key). Same for every query: it's market backdrop."""
    async def one(code: str, label: str) -> str:
        try:
            rows = (await client.get(WORLD_BANK.format(code), params={"format": "json", "mrnev": 3})).json()[1]
            return f"{label}: " + ", ".join(f"{r['date']}={round(r['value'], 2)}" for r in rows if r["value"] is not None)
        except Exception as exc:
            logger.warning("World Bank %s failed: %s", code, exc)
            return ""
    lines = [l for l in await asyncio.gather(*(one(c, l) for c, l in _INDICATORS.items())) if l]
    return [{"text": "India macro indicators (World Bank): " + "; ".join(lines), "title": "India macro indicators",
             "source": "https://data.worldbank.org/country/india", "source_type": "economy"}] if lines else []


async def _google(client: httpx.AsyncClient, query: str) -> list[dict]:
    """Google Search via Gemma's built-in grounding: Google ranks, Gemma condenses, URLs kept.
    Costs one Gemma call (~20-30s), so it's opt-in rather than a default source."""
    from app.services.gemma_client import GemmaClient  # avoid import cycle at module load
    try:
        r = await GemmaClient().generate(
            system_prompt="Search Google and report the key facts, numbers and dates for the query, with no opinion.",
            user_message=query, google_search=True, temperature=0.2,
        )
    except Exception as exc:
        logger.warning("Google grounding failed for %r: %s", query, exc)
        return []
    sources = r.get("sources", [])
    docs = [{"text": r["text"], "title": f"Google: {query}", "source_type": "google",
             "source": sources[0]["url"] if sources else "https://www.google.com/search"}]
    docs += [{"text": f"{s['title']} (Google result for: {query})", "title": s["title"] or "",
              "source": s["url"], "source_type": "google"} for s in sources]
    # Google picked the pages; now read them directly (full text + real URL, not just titles).
    await asyncio.gather(*(_read_page(client, d) for d in docs[1 : 1 + PAGES_TO_READ + 1]))
    return docs


_FETCHERS = {"web": _web, "news": _news, "reddit": _reddit, "hackernews": _hackernews, "wikipedia": _wikipedia,
             "finance": _finance, "jobs": _jobs, "reviews": _reviews, "economy": _economy, "google": _google}


async def _bounded(coro, name: str, timeout: float = 45) -> list[dict]:
    try:
        return await asyncio.wait_for(coro, timeout)
    except asyncio.TimeoutError:
        logger.warning("Source %s timed out", name)
        return []


def rank_chunks(query: str, docs: list[dict], k: int = 8) -> list[dict]:
    """Fast lexical ranking of this scrape's chunks: share of query words a chunk contains,
    with a small bonus for repeats. Good enough to pick evidence; FAISS does semantic search later."""
    terms = {w for w in re.findall(r"[a-z0-9]+", query.lower()) if len(w) > 2}
    scored = []
    for d in docs:
        for piece in memory.chunk(d.get("text", "")):
            words = re.findall(r"[a-z0-9]+", piece.lower())
            hits = sum(1 for w in words if w in terms)
            coverage = len(terms & set(words)) / (len(terms) or 1)
            score = coverage + min(hits, 20) / 100
            scored.append((score, {"text": piece, "source": d.get("source", ""), "title": d.get("title", ""),
                                   "source_type": d.get("source_type", "web"), "score": round(score, 3)}))
    scored.sort(key=lambda x: -x[0])
    return [e for _, e in scored[:k]]


def clean_query(query: str, limit: int = 200) -> str:
    """Models sometimes loop ('Viman Nagar Viman Nagar ...'); drop repeated words and cap length."""
    seen, words = set(), []
    for w in query.split():
        if w.lower() not in seen:
            seen.add(w.lower())
            words.append(w)
    return " ".join(words)[:limit]


async def web_research(query: str, sources: list[str] | None = None) -> dict:
    """Tool handler: multi-source scrape -> vectorize -> top evidence + per-source counts."""
    query = clean_query(query)
    chosen = [s for s in (sources or DEFAULT_SOURCES) if s in _FETCHERS] or DEFAULT_SOURCES
    if research_mode.get() == "fast":
        chosen = [s for s in chosen if s not in SLOW_SOURCES] or DEFAULT_SOURCES
    async with httpx.AsyncClient(timeout=10.0, headers=_HEADERS, follow_redirects=True) as client:
        results = await asyncio.gather(*(_bounded(_FETCHERS[s](client, query), s) for s in chosen))

    per_source = {s: len(docs) for s, docs in zip(chosen, results)}
    docs = [d for found in results for d in found]
    # Answer from this scrape right away (keyword-ranked, milliseconds); BGE embedding + FAISS store
    # run in the background. Embedding inline cost ~28s per research when 11 ran at once.
    ranked = rank_chunks(query, docs, k=12)
    # Embed only what's worth keeping (top chunks), not every chunk of every page: BGE on CPU is
    # ~170ms/chunk and the Soul Binder waits for these before reading its rolling window.
    memory.add_in_background([{k: e[k] for k in ("text", "source", "title", "source_type")} for e in ranked])
    evidence = ranked[:8]
    stored = sum(len(memory.chunk(d.get("text", ""))) for d in docs)
    return {"query": query, "per_source": per_source, "chunks_stored": stored, "evidence": evidence}
