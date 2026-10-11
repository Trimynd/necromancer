import json

from pydantic import ValidationError

from app.config import settings
from app.models.manifest import AgentManifest
from app.services.gemma_client import GemmaClient
from app.utils.json_parser import JSONExtractionError, extract_json
from app.utils.logger import get_logger

logger = get_logger(__name__)

ROLE_MAKER_PROMPT = """You are the Role Maker for Necromancer, an agentic fintech platform.

Your job: given a problem statement (and optionally data about a dead startup),
design the optimal team of AI agents to solve it. The team is NOT fixed —
you choose every role from scratch based on what this specific problem needs.

RULES:
1. Generate 3-7 agents. Fewer is better — only add an agent if it has a
   clearly distinct job no other agent on the team covers.
2. For fintech problems, consider (only include if relevant):
   regulatory compliance (RBI FREE-AI, KYC, AML), fraud/risk, UX, technical feasibility.
3. Assign tools to each agent ONLY from this registry: {available_tools}
   (search_memory and web_research are given to every ghost automatically).
4. Choose a topology: "star" (one hub agent synthesizes everyone else),
   "mesh" (all peers), or "hierarchical".
5. Exactly one agent's id must match "hub_agent".
6. Do NOT hallucinate private data about the startup. Only reason from what
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
  "topology": "star" | "mesh" | "hierarchical",
  "hub_agent": "id_of_one_agent_above",
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

        response = await self.gemma.generate(system_prompt=system_prompt, user_message=context, temperature=0.6)

        try:
            raw = extract_json(response["text"])
        except JSONExtractionError as exc:
            logger.error("Role Maker returned unparseable output: %s", exc)
            return self._fallback_manifest(problem_statement)

        try:
            manifest = AgentManifest.model_validate(raw)
        except ValidationError as exc:
            logger.error("Role Maker manifest failed validation: %s", exc)
            return self._fallback_manifest(problem_statement)

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

    def _fallback_manifest(self, problem_statement: str) -> AgentManifest:
        """A minimal hardcoded team used only if Gemma's output can't be parsed/validated."""
        return AgentManifest(
            domain="fintech_problem",
            problem_summary=problem_statement,
            agents=[
                {
                    "id": "ghost_ceo",
                    "name": "Ghost CEO",
                    "system_prompt": (
                        "You are the ghost of a startup's CEO. Analyze the problem, weigh tradeoffs, "
                        "and produce a clear recommendation. Label any speculation as speculation."
                    ),
                    "tools": [],
                    "temperature": 0.7,
                    "priority": 1,
                },
                {
                    "id": "compliance_officer",
                    "name": "Compliance Officer",
                    "system_prompt": (
                        "You are a fintech compliance officer. Check the proposal against RBI FREE-AI "
                        "principles and KYC/AML basics using your tools, and flag gaps."
                    ),
                    "tools": ["rbi_lookup", "kyc_check"],
                    "temperature": 0.4,
                    "priority": 2,
                },
            ],
            topology="star",
            hub_agent="ghost_ceo",
            shared_memory_keys=["decisions"],
        )
