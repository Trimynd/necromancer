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

ROLE_MAKER_PROMPT = """You are the Role Maker for Necromancer, an agentic fintech platform.

Your job: given a problem statement (and optionally data about a dead startup),
design the optimal panel of AI expert "ghosts" who will each present a case
(claim, evidence, confidence, emotion) to the Soul Binder. The Soul Binder is fixed and
is NOT part of your panel. The team is NOT fixed —
you choose every role from scratch based on what this specific problem needs.

RULES:
0. Do NOT create a judge, soul binder, lead, hub, moderator or synthesizer ghost.
1. Generate 2-{max_agents} agents. Fewer is better — only add an agent if it has a
   clearly distinct job no other agent on the team covers.
2. Derive every role from THIS problem. Consider (only if relevant): regulation/compliance,
   risk/fraud, market & competitors, unit economics, customers/UX, technical feasibility.
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
      "priority": 1
    }}
  ],
  "shared_memory_keys": ["decisions", "failure_reasons", "pivot_ideas"]
}}
"""


class RoleMakerAgent:
    def __init__(self, gemma: GemmaClient | None = None):
        self.gemma = gemma or GemmaClient(model=settings.gemma_model_hub)

    async def generate_manifest(self, problem_statement: str, startup_data: dict | None = None) -> AgentManifest:
        from app.services.tools import TOOL_REGISTRY

        context = f"PROBLEM: {problem_statement}"
        if startup_data:
            context += f"\n\nDEAD STARTUP DATA:\n{json.dumps(startup_data, indent=2, default=str)}"

        system_prompt = ROLE_MAKER_PROMPT.format(available_tools=list(TOOL_REGISTRY.keys()), max_agents=settings.max_agents)

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

        return self._enforce_limits(manifest)

    def _enforce_limits(self, manifest: AgentManifest) -> AgentManifest:
        from app.config import settings as cfg

        if len(manifest.agents) > cfg.max_agents:
            manifest.agents = manifest.agents[: cfg.max_agents]

        valid_ids = {a.id for a in manifest.agents}
        if manifest.hub_agent not in valid_ids:
            manifest.hub_agent = manifest.agents[0].id

        from app.services.tools import TOOL_REGISTRY

        for agent in manifest.agents:
            agent.tools = [t for t in agent.tools if t in TOOL_REGISTRY]

        return manifest
