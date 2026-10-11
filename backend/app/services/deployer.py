import re
from pathlib import Path

STATIC_DIR = Path(__file__).resolve().parent.parent / "static" / "zombie"
STATIC_DIR.mkdir(parents=True, exist_ok=True)

_SLUG_RE = re.compile(r"[^a-z0-9-]+")


def _safe_slug(slug: str) -> str:
    cleaned = _SLUG_RE.sub("-", slug.lower()).strip("-")
    return cleaned or "zombie"


async def deploy_zombie_site(html: str, slug: str) -> dict:
    """Write a generated landing page to disk and return its served path.

    Served via FastAPI's StaticFiles mount at /zombie in app.main.
    """
    safe_slug = _safe_slug(slug)
    path = STATIC_DIR / f"{safe_slug}.html"
    path.write_text(html, encoding="utf-8")

    return {"slug": safe_slug, "url": f"/zombie/{safe_slug}.html"}
