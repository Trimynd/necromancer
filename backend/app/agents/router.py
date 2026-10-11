from pydantic import BaseModel, Field, ValidationError

from app.config import settings
from app.services.gemma_client import GemmaClient
from app.utils.json_parser import JSONExtractionError, extract_json
from app.utils.logger import get_logger

logger = get_logger(__name__)

ROUTER_PROMPT = """You triage questions for Necromancer, a multi-agent platform that analyses any business, idea or question.

Decide:
- topic: short label of what the question is about.
- complexity: "simple" if one model can answer it directly and well
  (definitions, small facts, chit-chat); "complex" if it needs several
  expert viewpoints, trade-offs, or a decision.
- needs_web: true if answering well needs fresh or external facts.
- search_queries: 1-3 short web search queries if needs_web, else [].

Respond with STRICT JSON only:
{"topic": "...", "complexity": "simple" | "complex", "needs_web": true | false, "search_queries": ["..."]}
"""


class Route(BaseModel):
    topic: str = "general"
    complexity: str = "complex"
    needs_web: bool = False
    search_queries: list[str] = Field(default_factory=list)


class RouterAgent:
    def __init__(self, gemma: GemmaClient | None = None):
        self.gemma = gemma or GemmaClient(model=settings.gemma_model_specialist)

    async def route(self, question: str) -> Route:
        response = await self.gemma.generate(system_prompt=ROUTER_PROMPT, user_message=question, temperature=0.2)
        try:
            route = Route.model_validate(extract_json(response["text"]))
        except (JSONExtractionError, ValidationError) as exc:
            # Unsure -> take the full court path; costs more but never under-answers.
            logger.warning("Router output unusable, defaulting to complex: %s", exc)
            return Route()
        route.search_queries = route.search_queries[:3]
        return route
