"""Google Sheet connector: read a shared sheet's numbers as CSV, no OAuth needed.

Works for sheets shared as "Anyone with the link can view" (Google serves those as CSV through
the /export endpoint). Private sheets would need a Google OAuth app; that's out of scope here.
"""

import re

import httpx

from app.services.documents import DocumentError, extract

_ID = re.compile(r"/spreadsheets/d/([a-zA-Z0-9_-]{20,})")
_GID = re.compile(r"[#&?]gid=(\d+)")
_TITLE = re.compile(r"<title>(.*?)\s*-\s*Google (?:Sheets|Drive)</title>", re.S)
NOT_PUBLIC = ("This sheet isn't public. In Google Sheets: Share → General access → "
              "Anyone with the link → Viewer, then try again.")


def parse_url(url: str) -> tuple[str, str]:
    match = _ID.search(url or "")
    if not match:
        raise DocumentError("That doesn't look like a Google Sheets link (it should contain /spreadsheets/d/...).")
    gid = _GID.search(url)
    return match.group(1), gid.group(1) if gid else "0"


async def read_sheet(url: str) -> dict:
    sheet_id, gid = parse_url(url)
    export = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid={gid}"
    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
        resp = await client.get(export)
        # Private sheets redirect to a Google sign-in page (HTML) instead of CSV.
        if resp.status_code in (401, 403, 404) or "text/csv" not in resp.headers.get("content-type", ""):
            raise DocumentError(NOT_PUBLIC)
        title = "Google Sheet"
        try:
            page = await client.get(f"https://docs.google.com/spreadsheets/d/{sheet_id}/edit")
            found = _TITLE.search(page.text)
            title = found.group(1).strip() if found else title
        except httpx.HTTPError:
            pass
    doc = extract(f"{title}.csv", resp.content)
    return {**doc, "name": title, "kind": "sheet", "source": f"https://docs.google.com/spreadsheets/d/{sheet_id}"}


if __name__ == "__main__":
    assert parse_url("https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit#gid=42") == (
        "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789", "42")
    try:
        parse_url("https://example.com/sheet")
        raise AssertionError("should fail")
    except DocumentError:
        pass
    print("google_sheets self-check ok")
