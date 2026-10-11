import json

from pydantic import ValidationError

from app.config import settings
from app.models.manifest import AgentManifest
from app.services.gemma_client import GemmaClient
from app.utils.json_parser import JSONExtractionError, extract_json
from app.utils.logger import get_logger

logger = get_logger(__name__)

MANIFEST_ATTEMPTS = 3


class RoleMakerError(RuntimeError):
    pass

ROLE_MAKER_PROMPT = """You are the Role Maker for Necromancer, a platform that summons a custom council of AI ghosts
to analyse any business, idea or question.

Your job: given a problem statement (and optionally data about a dead startup),
design the optimal panel of AI expert "ghosts" who will each present a case
(claim, evidence, confidence, emotion) to the Soul Binder. The Soul Binder is fixed and
is NOT part of your panel. The team is NOT fixed —
you choose every role from scratch based on what this specific problem needs.

RULES:
0. Do NOT create a judge, soul binder, lead, hub, moderator or synthesizer ghost.
1. Summon as many ghosts as THIS problem truly needs (at least 1). There is no fixed
   catalogue of roles: a ghost can be ANY persona: a domain expert, a real customer type,
   a rival founder, a regulator, a supplier, a dead company's former CEO, a skeptic,
   an investor... whatever voice would surface the truth here. Each must have a distinct job.
2. Name each ghost and write its system_prompt from the problem itself, not from a template.
   Give each ghost 1-2 specific "research" searches (and the source types that fit:
   web, news, reddit, hackernews, wikipedia, finance, jobs, reviews, economy, google).
3. Assign tools to each agent ONLY from this registry: {available_tools}
   (search_memory and web_research are given to every ghost automatically).
4. Do NOT hallucinate private data about the startup. Only reason from what
   you were given, and label speculation as speculation in system_prompt text.

Respond with STRICT JSON only, no prose, no markdown fences, matching exactly:
{{
  "domain": "fintech_startup_revival" | "fintech_problem",
  "problem_summary": "...",
  "agents": [
    {{
      "id": "short_snake_case_id",
      "name": "Display Name",
      "system_prompt": "...",
      "tools": ["tool_name", ...],
      "temperature": 0.7,
      "priority": 1,
      "research": [{{"query": "the 1-2 web searches THIS ghost needs before arguing", "sources": ["web", "news"]}}]
    }}
  ],
  "shared_memory_keys": ["decisions", "failure_reasons", "pivot_ideas"]
}}
"""


class RoleMakerAgent:
    def __init__(self, gemma: GemmaClient | None = None):
        self.gemma = gemma or GemmaClient(model=settings.gemma_model_hub)

    async def generate_manifest(
        self, problem_statement: str, startup_data: dict | None = None, max_agents: int | None = None
    ) -> AgentManifest:
        from app.services.tools import TOOL_REGISTRY

        context = f"PROBLEM: {problem_statement}"
        if startup_data:
            context += f"\n\nDEAD STARTUP DATA:\n{json.dumps(startup_data, indent=2, default=str)}"

        system_prompt = ROLE_MAKER_PROMPT.format(available_tools=list(TOOL_REGISTRY.keys()), max_agents=max_agents or settings.max_agents)

        # No hardcoded backup team: if Gemma's manifest is unusable, tell it why and ask again.
        message = context
        for attempt in range(1, MANIFEST_ATTEMPTS + 1):
            response = await self.gemma.generate(system_prompt=system_prompt, user_message=message, temperature=0.6)
            try:
                manifest = AgentManifest.model_validate(extract_json(response["text"]))
                break
            except (JSONExtractionError, ValidationError) as exc:
                logger.warning("Role Maker manifest unusable (attempt %d): %s", attempt, exc)
                if attempt == MANIFEST_ATTEMPTS:
                    raise RoleMakerError(f"Role Maker failed to produce a valid team: {exc}") from exc
                message = f"{context}\n\nYour previous reply was invalid: {exc}\nReply again with STRICT JSON only."

        return self._enforce_limits(manifest, max_agents)

    def _enforce_limits(self, manifest: AgentManifest, max_agents: int | None = None) -> AgentManifest:
        from app.config import settings as cfg

        cap = max_agents or cfg.max_agents
        if len(manifest.agents) > cap:
            manifest.agents = manifest.agents[:cap]

        valid_ids = {a.id for a in manifest.agents}
        if manifest.hub_agent not in valid_ids:
            manifest.hub_agent = manifest.agents[0].id

        from app.services.tools import TOOL_REGISTRY

        for agent in manifest.agents:
            agent.tools = [t for t in agent.tools if t in TOOL_REGISTRY]

        return manifest
