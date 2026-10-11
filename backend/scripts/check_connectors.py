"""Live check of free data connectors (no signup, no billing). Phone-shop-in-Pune scenario.

Run:  python tests/check_connectors.py
Each check prints OK/FAIL, latency and a sample of what an agent would get.
"""

import asyncio
import re
import sys
import time

import httpx

# Wikimedia rejects UAs without a contact URL (403), so name the repo.
UA = {"User-Agent": "NecromancerResearch/0.1 (https://github.com/Trimynd/necromancer)"}
TIMEOUT = httpx.Timeout(20.0)


async def osm_local_competitors(c: httpx.AsyncClient) -> str:
    """OpenStreetMap: geocode an area, then list phone shops within 3 km (free Google Places substitute)."""
    geo = (await c.get("https://nominatim.openstreetmap.org/search",
                       params={"q": "Viman Nagar, Pune", "format": "json", "limit": 1})).json()
    lat, lon = geo[0]["lat"], geo[0]["lon"]
    # Shops are mapped as points or buildings (nwr); phone sellers are often tagged electronics.
    q = f'[out:json][timeout:25];nwr["shop"~"^(mobile_phone|electronics)$"](around:5000,{lat},{lon});out center 60;'
    els = (await c.post("https://overpass-api.de/api/interpreter", data={"data": q})).json()["elements"]
    names = [e["tags"].get("name", "(unnamed)") for e in els]
    return f"{len(els)} phone/electronics shops within 5 km of Viman Nagar: {', '.join(names[:6])}"


async def wikidata_company(c: httpx.AsyncClient) -> str:
    """Wikidata SPARQL: structured company facts (revenue, employees, founded)."""
    q = """SELECT ?label ?revenue ?employees ?inception WHERE {
      ?co rdfs:label "Reliance Retail"@en .
      OPTIONAL { ?co wdt:P2139 ?revenue } OPTIONAL { ?co wdt:P1128 ?employees } OPTIONAL { ?co wdt:P571 ?inception }
      ?co rdfs:label ?label FILTER(lang(?label)="en") } LIMIT 3"""
    rows = (await c.get("https://query.wikidata.org/sparql", params={"query": q, "format": "json"})).json()["results"]["bindings"]
    if not rows:
        return "no rows"
    r = rows[0]
    return " · ".join(f"{k}={r[k]['value'][:40]}" for k in ("label", "revenue", "employees", "inception") if k in r)


async def yahoo_stock(c: httpx.AsyncClient) -> str:
    """Yahoo Finance chart endpoint (unofficial, no key): listed competitor price history."""
    d = (await c.get("https://query1.finance.yahoo.com/v8/finance/chart/TRENT.NS",
                     params={"range": "6mo", "interval": "1mo"})).json()["chart"]["result"][0]
    closes = [round(x) for x in d["indicators"]["quote"][0]["close"] if x]
    return f"TRENT.NS ({d['meta'].get('currency')}) monthly closes, last 6 mo: {closes}"


async def alpha_vantage_demo(c: httpx.AsyncClient) -> str:
    """Alpha Vantage with the public 'demo' key (IBM only). A free personal key unlocks other tickers."""
    d = (await c.get("https://www.alphavantage.co/query", params={"function": "OVERVIEW", "symbol": "IBM", "apikey": "demo"})).json()
    if "Symbol" not in d:
        raise RuntimeError(str(d)[:150])
    return f"{d['Name']}: revenue TTM ${int(d['RevenueTTM'])/1e9:.1f}B · profit margin {d['ProfitMargin']} · sector {d['Sector']}"


async def sec_edgar(c: httpx.AsyncClient) -> str:
    """SEC EDGAR company facts (official, free): US-listed company financials."""
    # SEC wants "App/version (description)" and rejects the Wikimedia-style URL UA.
    d = (await c.get("https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json",
                     headers={"User-Agent": "NecromancerHackathon/0.1 (business research prototype)"})).json()
    rev = d["facts"]["us-gaap"].get("RevenueFromContractWithCustomerExcludingAssessedTax", {}).get("units", {}).get("USD", [])
    annual = [x for x in rev if x.get("form") == "10-K" and x.get("fp") == "FY"]
    last = annual[-1]
    return f"{d['entityName']}: FY{last['fy']} revenue ${last['val']/1e9:.1f}B (10-K filed {last['filed']})"


async def world_bank(c: httpx.AsyncClient) -> str:
    """World Bank API: India GDP growth, last 5 years."""
    d = (await c.get("https://api.worldbank.org/v2/country/IND/indicator/NY.GDP.MKTP.KD.ZG",
                     params={"format": "json", "per_page": 5})).json()[1]
    return "India GDP growth: " + ", ".join(f"{x['date']}={x['value']:.1f}%" for x in d if x["value"] is not None)


async def data_gov_in(c: httpx.AsyncClient) -> str:
    """data.gov.in with the public sample key from its docs (daily mandi commodity prices). Own free key for production."""
    d = (await c.get("https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070",
                     params={"api-key": "579b464db66ec23bdd000001cdd3946e44ce4aad7209ff7b23ac571b",
                             "format": "json", "limit": 3})).json()
    recs = d.get("records", [])
    if not recs:
        raise RuntimeError(str(d)[:150])
    r = recs[0]
    return f"{d.get('total')} records; e.g. {r.get('commodity')} in {r.get('market')}, {r.get('state')}: modal ₹{r.get('modal_price')}"


async def gdelt_news(c: httpx.AsyncClient) -> str:
    """GDELT news search (free, no key)."""
    d = (await c.get("https://api.gdeltproject.org/api/v2/doc/doc",
                     params={"query": '"smartphone" India retail', "mode": "artlist", "format": "json", "maxrecords": 5, "timespan": "1month"})).json()
    arts = d.get("articles", [])
    return f"{len(arts)} articles: " + " | ".join(a["title"][:70] for a in arts[:3])


async def google_news_rss(c: httpx.AsyncClient) -> str:
    """Google News RSS search (free, no key)."""
    xml = (await c.get("https://news.google.com/rss/search", params={"q": "mobile phone store Pune", "hl": "en-IN", "gl": "IN", "ceid": "IN:en"})).text
    titles = re.findall(r"<item><title>(.*?)</title>", xml)
    return f"{len(titles)} headlines: " + " | ".join(t[:70] for t in titles[:3])


async def hacker_news(c: httpx.AsyncClient) -> str:
    """HN Algolia (already used by research.py)."""
    hits = (await c.get("https://hn.algolia.com/api/v1/search", params={"query": "BNPL", "tags": "story", "hitsPerPage": 5})).json()["hits"]
    return f"{len(hits)} stories: " + " | ".join(h["title"][:60] for h in hits[:3])


async def wikipedia(c: httpx.AsyncClient) -> str:
    """Wikipedia search (already used by research.py)."""
    d = (await c.get("https://en.wikipedia.org/w/api.php",
                     params={"action": "query", "list": "search", "srsearch": "smartphone retail India", "format": "json", "srlimit": 5})).json()
    return "pages: " + " | ".join(p["title"] for p in d["query"]["search"])


CHECKS = [
    ("Local competitors (OpenStreetMap)", osm_local_competitors),
    ("Company facts (Wikidata)", wikidata_company),
    ("Stock prices (Yahoo, unofficial)", yahoo_stock),
    ("Financials (Alpha Vantage demo key)", alpha_vantage_demo),
    ("US filings (SEC EDGAR)", sec_edgar),
    ("Economy (World Bank)", world_bank),
    ("India open data (data.gov.in sample key)", data_gov_in),
    ("News (GDELT)", gdelt_news),
    ("News (Google News RSS)", google_news_rss),
    ("Discussions (Hacker News)", hacker_news),
    ("Encyclopedia (Wikipedia)", wikipedia),
]


async def run(c: httpx.AsyncClient, name: str, fn) -> bool:
    t = time.perf_counter()
    try:
        out = await fn(c)
        print(f"OK    {name:42} {time.perf_counter() - t:5.1f}s  {out}")
        return True
    except Exception as exc:  # report every failure, keep going
        print(f"FAIL  {name:42} {time.perf_counter() - t:5.1f}s  {type(exc).__name__}: {str(exc)[:160]}")
        return False


async def main() -> None:
    async with httpx.AsyncClient(timeout=TIMEOUT, headers=UA, follow_redirects=True) as c:
        results = await asyncio.gather(*(run(c, n, f) for n, f in CHECKS))
    print(f"\n{sum(results)}/{len(results)} connectors working")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    asyncio.run(main())
