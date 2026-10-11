from app.config import settings
from app.agents.base_agent import BaseAgent
from app.models.manifest import AgentManifest
from app.services.blackboard import Blackboard
from app.services.gemma_client import GemmaClient

BASE_TOOLS = ["search_memory", "web_research"]


class AgentFactory:
    """Spawns one ghost (BaseAgent) per role in the manifest, all on the fast
    MoE model. The Judge (separate, see judge.py) gets the big model.
    """

    @staticmethod
    def create_team(manifest: AgentManifest, blackboard: Blackboard, session_id: str) -> list[BaseAgent]:
        gemma = GemmaClient(model=settings.gemma_model_specialist)
        for agent_config in manifest.agents:
            agent_config.tools = list(dict.fromkeys(BASE_TOOLS + agent_config.tools))

        return [
            BaseAgent(config=agent_config, blackboard=blackboard, session_id=session_id, gemma=gemma)
            for agent_config in manifest.agents
        ]
