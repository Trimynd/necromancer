from app.config import settings
from app.agents.base_agent import BaseAgent
from app.models.manifest import AgentManifest
from app.services.blackboard import Blackboard
from app.services.gemma_client import GemmaClient


class AgentFactory:
    """Spawns one BaseAgent per role in the manifest. The hub agent (does
    synthesis/reflection across the whole team) gets the larger model;
    specialists get the cheaper/faster one.
    """

    @staticmethod
    def create_team(manifest: AgentManifest, blackboard: Blackboard, session_id: str) -> list[BaseAgent]:
        hub_gemma = GemmaClient(model=settings.gemma_model_hub)
        specialist_gemma = GemmaClient(model=settings.gemma_model_specialist)

        return [
            BaseAgent(
                config=agent_config,
                blackboard=blackboard,
                session_id=session_id,
                gemma=hub_gemma if agent_config.id == manifest.hub_agent else specialist_gemma,
            )
            for agent_config in manifest.agents
        ]
