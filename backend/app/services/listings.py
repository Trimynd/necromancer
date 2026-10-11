"""Verify competitor listings with code, not the model.

The model wrote "n/a" for listed companies (Paytm, MobiKwik) because its evidence
never mentioned tickers. After the report is written we pull every company out of
the competitors table and ask Yahoo Finance directly.
"""

import asyncio
import re
import xml.etree.ElementTree as ET

import httpx

import yfinance as yf

from app.utils.logger import get_logger

logger = get_logger(__name__)


def competitor_names(report: str) -> list[str]:
    """First column of the markdown table under the 'Market & competitors' heading."""
    section = re.search(r"#+[^\n]*competitor[^\n]*\n(.*?)(?=\n#+ |\Z)", report, re.S | re.I)
    if not section:
        return []
    names = []
    for line in section.group(1).splitlines():
        cells = [c.strip(" *") for c in line.strip().strip("|").split("|")]
        if len(cells) < 2 or not cells[0] or set(cells[0]) <= set("-: ") or cells[0].lower() == "company":
            continue
        names.append(re.sub(r"\s*\(.*?\)", "", cells[0]).strip())
    return list(dict.fromkeys(n for n in names if n))


def _words(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", text.lower()))


def _lookup_sync(name: str) -> dict | None:
    """Strict on purpose: a wrong ticker is worse than "n/a".
    - full-name search: every one of the name's first two words must appear as a whole word
      in the listed company's name ("Green Soul Kitchens" must not match "Greenland").
    - brand fallback ("Paytm Postpaid" is a product): the ticker symbol itself must start
      with the brand (PAYTM.NS), so a parent like Amazon -> AMZN is not passed off as the BNPL."""
    want = list(_words(name.split()[0] + " " + " ".join(name.split()[1:2])))
    brand = re.sub(r"[^a-z0-9]", "", name.split()[0].lower())

    def pick(quotes, by_symbol: bool):
        for q in quotes:
            if q.get("quoteType") != "EQUITY":
                continue
            label = _words(f"{q.get('shortname', '')} {q.get('longname', '')}")
            if (q["symbol"].lower().startswith(brand) if by_symbol else all(w in label for w in want)):
                return q
        return None

    q = pick(yf.Search(name, max_results=5).quotes, by_symbol=False)
    if q is None and len(name.split()) > 1:
        q = pick(yf.Search(name.split()[0], max_results=5).quotes, by_symbol=True)
    if q is None:
        return None
    info = yf.Ticker(q["symbol"]).info
    return {"company": name, "ticker": q["symbol"], "exchange": q.get("exchange", ""),
            "market_cap": info.get("marketCap"), "currency": info.get("currency", ""),
            "revenue": info.get("totalRevenue")}


async def verify_listings(report: str, timeout: float = 25) -> list[dict]:
    async def one(name: str):
        try:
            return await asyncio.wait_for(asyncio.to_thread(_lookup_sync, name), timeout)
        except Exception as exc:
            logger.warning("Listing lookup failed for %s: %s", name, exc)
            return None

    return [r for r in await asyncio.gather(*(one(n) for n in competitor_names(report)[:12])) if r]


GNEWS_RSS = "https://news.google.com/rss/search"
# Headline words that mean a company stopped (or was forced to stop) operating.
_DEAD = re.compile(
    r"shut(s|ting)? down|shutdown|shuts shop|closes|closed down|winds? down|wind-down|ceases?|"
    r"bankrupt|insolven|liquidat|licen[cs]e (cancel|revok)|halts? (payment )?operations|"
    r"stops? operations|goes bust|collapse",
    re.I,
)


async def company_status(client: httpx.AsyncClient, name: str) -> dict | None:
    """Newest Google News headline that names the company AND says it stopped operating, else None.
    Strict on purpose: the headline must contain the company's full name."""
    try:
        resp = await client.get(GNEWS_RSS, params={
            "q": f'"{name}" shut down OR closed OR ceases OR bankrupt OR halts', "hl": "en-IN", "gl": "IN", "ceid": "IN:en"})
        items = list(ET.fromstring(resp.text).iter("item"))[:20]
    except Exception as exc:
        logger.warning("Status check failed for %s: %s", name, exc)
        return None
    for item in items:
        title = item.findtext("title", "").rsplit(" - ", 1)[0]  # drop " - Publisher"
        if _is_shutdown_headline(name, title):
            return {"headline": title, "date": (item.findtext("pubDate", "") or "")[5:16], "link": item.findtext("link", "")}
    return None


_NOT_A_STATUS = re.compile(r"clarif|denies|deny|rumou?r|fake|reopen|revive|returns|back in business", re.I)


def _is_shutdown_headline(name: str, title: str) -> bool:
    """The company itself must be the one stopping: '<Name> [to] shut down', 'RBI orders <Name> to halt',
    not 'Swiggy shut down its Snacc app' (a product) or 'Paytm clarifies shutdown report'."""
    if _NOT_A_STATUS.search(title):
        return False
    n = re.escape(name)
    stop = (r"(shut(s|ting)?\s+down|shuts\s+shop|closes|ceases?|winds?\s+down|halts?|stops?|"
            r"goes\s+bust|files?\s+for\s+(bankruptcy|insolvency)|collapses?)")
    # "shut down its app" / "some dark stores" / "15-min app" = part of the business, not the company
    no_object = r"(?!\s+((its|their|a|an|the|some|several|one|two|three|four|five|all\s+its)\b|\d))"
    near = rf"\b{n}\b(?:'s)?\s+(?:[\w-]+\s+){{0,3}}?(?:to\s+)?{stop}\b{no_object}"
    ordered = rf"\b(orders?|asks?|directs?|forces?)\s+(?:[\w-]+\s+){{0,3}}?{n}\b\s+to\s+{stop}\b"
    return bool(re.search(near, title, re.I) or re.search(ordered, title, re.I))


async def verify_companies(report: str, timeout: float = 25) -> list[dict]:
    """For each competitor in the report: Yahoo listing (if any) + alive/dead news signal."""
    names = competitor_names(report)[:12]

    async def listing(name: str):
        try:
            return await asyncio.wait_for(asyncio.to_thread(_lookup_sync, name), timeout)
        except Exception as exc:
            logger.warning("Listing lookup failed for %s: %s", name, exc)
            return None

    async with httpx.AsyncClient(timeout=10, follow_redirects=True,
                                 headers={"User-Agent": "NecromancerResearch/0.1 (https://github.com/Trimynd/necromancer)"}) as c:
        listings, statuses = await asyncio.gather(
            asyncio.gather(*(listing(n) for n in names)),
            asyncio.gather(*(company_status(c, n) for n in names)),
        )
    return [{"company": n, "listing": li, "status": st} for n, li, st in zip(names, listings, statuses) if li or st]


def _money(v, cur: str) -> str:
    if not v:
        return "n/a"
    for unit, div in (("T", 1e12), ("B", 1e9), ("M", 1e6)):
        if v >= div:
            return f"{v / div:.1f}{unit} {cur}"
    return f"{v} {cur}"


def companies_markdown(rows: list[dict]) -> str:
    if not rows:
        return ""
    lines = ["\n\n## Verified by code (Yahoo Finance listings + Google News status)",
             "| Company | Listed | Market cap | Revenue (TTM) | Status signal |", "|---|---|---|---|---|"]
    for r in rows:
        li, st = r["listing"], r["status"]
        listed = f"{li['ticker']} ({li['exchange']})" if li else "not listed"
        cap = _money(li["market_cap"], li["currency"]) if li else "n/a"
        rev = _money(li["revenue"], li["currency"]) if li else "n/a"
        status = f"⚠️ [{st['headline'][:90]}]({st['link']}) ({st['date']})" if st else "no shutdown news found"
        lines.append(f"| {r['company']} | {listed} | {cap} | {rev} | {status} |")
    return "\n".join(lines) + "\n"


def listings_markdown(rows: list[dict]) -> str:
    if not rows:
        return ""
    lines = ["\n\n## Verified listings (Yahoo Finance, checked by code)",
             "| Company | Ticker | Exchange | Market cap | Revenue (TTM) |", "|---|---|---|---|---|"]
    lines += [f"| {r['company']} | {r['ticker']} | {r['exchange']} | {_money(r['market_cap'], r['currency'])} | "
              f"{_money(r['revenue'], r['currency'])} |" for r in rows]
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    sample = """## 5. Market & competitors
| Company | Listed? (ticker) | What they do |
| :--- | :--- | :--- |
| **Paytm Postpaid** | n/a | BNPL |
| **MobiKwik** | n/a | wallet |
## 6. Risks"""
    assert competitor_names(sample) == ["Paytm Postpaid", "MobiKwik"], competitor_names(sample)
    assert _money(1_046_888_710_144, "INR") == "1.0T INR"
    assert _is_shutdown_headline("ZestMoney", "Fintech startup ZestMoney to shut down, to lay off remaining 130 employees")
    assert _is_shutdown_headline("Simpl", "RBI orders BNPL startup Simpl to halt payment operations")
    assert _is_shutdown_headline("Simpl", "RBI orders Simpl to halt payment operations")
    assert not _is_shutdown_headline("Swiggy", "Why Swiggy Shut Down Its 15-Minute Instant Delivery App Snacc In Just A Year")
    assert not _is_shutdown_headline("Paytm Postpaid", "Updated: Paytm clarifies on Paytm Postpaid shutdown report")
    assert not _is_shutdown_headline("Swiggy", "Swiggy shuts down 15-min food delivery app Snacc")
    assert not _is_shutdown_headline("Dunzo", "Exclusive: Dunzo to shut down some dark stores in NCR and Hyderabad")
    assert _is_shutdown_headline("Quibi", "Quibi Is Shutting Down Barely Six Months After Going Live")
    print("listings self-check ok")
