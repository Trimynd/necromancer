from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup

from app.utils.logger import get_logger

logger = get_logger(__name__)

WAYBACK_CDX_URL = "https://web.archive.org/cdx/search/cdx"
HN_ALGOLIA_URL = "https://hn.algolia.com/api/v1/search"

_TIMEOUT = httpx.Timeout(10.0)


def _domain_name(url: str) -> str:
    host = urlparse(url if "://" in url else f"http://{url}").netloc or url
    return host.removeprefix("www.").split(".")[0]


async def _fetch_snapshots(client: httpx.AsyncClient, url: str, limit: int) -> list[dict]:
    try:
        resp = await client.get(
            WAYBACK_CDX_URL,
            params={
                "url": url,
                "output": "json",
                "limit": str(limit),
                "filter": "statuscode:200",
                "collapse": "timestamp:6",
            },
        )
        resp.raise_for_status()
        rows = resp.json()
    except Exception as exc:
        logger.warning("Wayback CDX lookup failed for %s: %s", url, exc)
        return []

    if len(rows) < 2:
        return []

    header, *data = rows
    return [dict(zip(header, row)) for row in data]


async def _fetch_snapshot_text(client: httpx.AsyncClient, snapshot: dict) -> dict:
    timestamp = snapshot.get("timestamp")
    original = snapshot.get("original")
    snapshot_url = f"https://web.archive.org/web/{timestamp}/{original}"

    try:
        resp = await client.get(snapshot_url, follow_redirects=True)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        title = soup.title.string.strip() if soup.title and soup.title.string else ""
        meta_desc_tag = soup.find("meta", attrs={"name": "description"})
        description = meta_desc_tag["content"].strip() if meta_desc_tag and meta_desc_tag.get("content") else ""
        body_text = " ".join(soup.get_text(" ", strip=True).split())[:2000]
    except Exception as exc:
        logger.warning("Snapshot fetch failed for %s: %s", snapshot_url, exc)
        title, description, body_text = "", "", ""

    return {
        "snapshot_url": snapshot_url,
        "timestamp": timestamp,
        "title": title,
        "description": description,
        "excerpt": body_text,
    }


async def _fetch_hn_discussions(client: httpx.AsyncClient, name: str) -> list[dict]:
    try:
        resp = await client.get(HN_ALGOLIA_URL, params={"query": name, "tags": "story"})
        resp.raise_for_status()
        hits = resp.json().get("hits", [])
    except Exception as exc:
        logger.warning("HN Algolia lookup failed for %s: %s", name, exc)
        return []

    return [
        {
            "title": h.get("title"),
            "url": h.get("url"),
            "points": h.get("points"),
            "num_comments": h.get("num_comments"),
            "hn_url": f"https://news.ycombinator.com/item?id={h.get('objectID')}",
        }
        for h in hits[:5]
    ]


async def scrape(url: str, limit: int = 5) -> dict:
    """Best-effort gather of public signal about a (likely dead) startup URL.

    Every sub-fetch degrades to an empty result on failure instead of raising,
    since a missing Wayback snapshot shouldn't kill the whole revival flow.
    """
    name = _domain_name(url)

    async with httpx.AsyncClient(timeout=_TIMEOUT, headers={"User-Agent": "necromancer-research/0.1"}) as client:
        snapshots = await _fetch_snapshots(client, url, limit)
        latest_snapshot = await _fetch_snapshot_text(client, snapshots[-1]) if snapshots else None
        discussions = await _fetch_hn_discussions(client, name)

    return {
        "url": url,
        "inferred_name": name,
        "snapshot_count": len(snapshots),
        "snapshots": snapshots,
        "latest_snapshot": latest_snapshot,
        "hn_discussions": discussions,
    }
