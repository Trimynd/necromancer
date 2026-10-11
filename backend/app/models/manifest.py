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


class AgentManifest(BaseModel):
    domain: str
    problem_summary: str
    agents: list[AgentConfig]
    topology: Topology
    hub_agent: str
    shared_memory_keys: list[str] = Field(default_factory=list)
