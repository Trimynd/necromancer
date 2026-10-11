import asyncio
from typing import Any, Awaitable, Callable

from app.services.deployer import deploy_zombie_site
from app.services.fintech.fraud_sim import fraud_sim
from app.services.fintech.kyc_validator import kyc_check
from app.services.fintech.rbi_lookup import rbi_lookup
from app.services.memory import search_memory
from app.services.research import web_research
from app.services.scraper import scrape
from app.utils.logger import get_logger

logger = get_logger(__name__)

TOOL_TIMEOUT = 45  # seconds; a hung scrape must not freeze the whole court

ToolHandler = Callable[..., Awaitable[dict]]

TOOL_HANDLERS: dict[str, ToolHandler] = {
    "web_research": web_research,
    "search_memory": search_memory,
    "scrape_wayback": lambda url, limit=5: scrape(url, limit),
    "rbi_lookup": rbi_lookup,
    "kyc_check": kyc_check,
    "fraud_sim": fraud_sim,
    "deploy_zombie_site": deploy_zombie_site,
}


class ToolExecutor:
    async def execute(self, call: dict[str, Any]) -> dict:
        name = call.get("name")
        args = call.get("args", {}) or {}
        handler = TOOL_HANDLERS.get(name)

        if handler is None:
            logger.warning("Unknown tool call: %s", name)
            return {"error": f"Unknown tool '{name}'"}

        try:
            return await asyncio.wait_for(handler(**args), TOOL_TIMEOUT)
        except asyncio.TimeoutError:
            logger.warning("Tool %s timed out after %ss", name, TOOL_TIMEOUT)
            return {"error": f"Tool '{name}' timed out"}
        except TypeError as exc:
            logger.warning("Bad arguments for tool %s: %s", name, exc)
            return {"error": f"Invalid arguments for '{name}': {exc}"}
        except Exception as exc:
            logger.error("Tool '%s' raised: %s", name, exc)
            return {"error": f"Tool '{name}' failed: {exc}"}
