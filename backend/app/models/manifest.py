from typing import Literal

from pydantic import BaseModel, Field

Topology = Literal["star", "mesh", "hierarchical"]


class AgentConfig(BaseModel):
    id: str
    name: str
    system_prompt: str
    tools: list[str] = Field(default_factory=list)
    temperature: float = 0.7
    priority: int = 1
    # Searches the orchestrator runs for this ghost BEFORE it argues: [{"query": ..., "sources": [...]}]
    research: list[dict] = Field(default_factory=list)


class AgentManifest(BaseModel):
    domain: str
    problem_summary: str
    agents: list[AgentConfig]
    topology: Topology = "star"
    hub_agent: str = ""  # unused by the court flow; kept for older manifests
    shared_memory_keys: list[str] = Field(default_factory=list)
