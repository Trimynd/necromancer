from app.models.manifest import AgentConfig
from app.services.blackboard import Blackboard
from app.services.gemma_client import GemmaClient
from app.services.tool_executor import ToolExecutor
from app.services.tools import TOOL_REGISTRY
from app.utils.logger import get_logger

logger = get_logger(__name__)


class BaseAgent:
    """A fully config-driven agent: role, prompt and tools all come from the
    Role Maker's manifest. There's no per-role subclass — the dynamic
    topology is the point, so hardcoding a GhostCEO/GhostCTO class per role
    would defeat it.
    """

    def __init__(self, config: AgentConfig, blackboard: Blackboard, session_id: str, gemma: GemmaClient | None = None):
        self.id = config.id
        self.name = config.name
        self.system_prompt = config.system_prompt
        self.tools = config.tools
        self.temperature = config.temperature
        self.blackboard = blackboard
        self.session_id = session_id
        self.gemma = gemma or GemmaClient()
        self.tool_executor = ToolExecutor()
        self.memory: list[dict] = []

    async def run(self, task: str, context: dict | None = None) -> str:
        """Observe -> Think/Act (tool calls) -> Reflect, writing results to the blackboard."""
        board_state = await self.blackboard.read_relevant(self.session_id, self.id)
        prompt = self._build_prompt(task, board_state, context)

        response = await self.gemma.generate(
            system_prompt=self.system_prompt,
            user_message=prompt,
            tools=self._tool_schemas(),
            temperature=self.temperature,
        )

        tool_results = []
        for call in response.get("function_calls", []):
            result = await self.tool_executor.execute(call)
            tool_results.append({"call": call, "result": result})
            await self.blackboard.write(self.session_id, self.id, f"tool:{call['name']}", result)

        final = await self._reflect(response["text"], tool_results) if tool_results else response["text"]

        self.memory.append({"task": task, "output": final})
        await self.blackboard.write(self.session_id, self.id, "output", final)
        await self.blackboard.emit(
            self.session_id, "agent_output", {"agent_id": self.id, "name": self.name, "output": final}
        )

        return final

    async def _reflect(self, text: str, tool_results: list[dict]) -> str:
        reflection_prompt = (
            f"You drafted this response:\n{text}\n\n"
            f"Tool results you gathered:\n{tool_results}\n\n"
            "Revise it into a final answer that actually uses the tool results. "
            "Drop any claim the tool results contradict. Reply with only the final answer."
        )
        resp = await self.gemma.generate(
            system_prompt=self.system_prompt,
            user_message=reflection_prompt,
            temperature=0.3,
        )
        return resp["text"]

    def _build_prompt(self, task: str, board_state: dict, context: dict | None) -> str:
        parts = [f"TASK: {task}"]
        if board_state:
            parts.append(f"TEAM CONTEXT (from other agents):\n{board_state}")
        if context:
            parts.append(f"CONTEXT:\n{context}")
        return "\n\n".join(parts)

    def _tool_schemas(self) -> list[dict]:
        return [TOOL_REGISTRY[t] for t in self.tools if t in TOOL_REGISTRY]
