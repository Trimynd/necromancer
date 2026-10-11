from app.models.manifest import AgentConfig
from app.services import memory
from app.services.blackboard import Blackboard
from app.services.gemma_client import GemmaClient
from app.services.tool_executor import ToolExecutor
from app.services.tools import TOOL_REGISTRY
from app.utils.logger import get_logger

logger = get_logger(__name__)


def _compact(value, text_limit: int = 250):
    """Shrink scraped text before it goes back into a prompt: the free tier's
    tokens-per-minute quota, not request count, is what full pages blow through."""
    if isinstance(value, dict):
        return {k: (v[:text_limit] if k == "text" and isinstance(v, str) else _compact(v, text_limit))
                for k, v in value.items()}
    if isinstance(value, list):
        return [_compact(v, text_limit) for v in value]
    return value


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
        # What this agent really searched in its last run (not what it claims it searched).
        self.research_log: list[dict] = []

    async def run(self, task: str, context: dict | None = None, use_tools: bool = True) -> str:
        """Observe -> Think/Act (tool calls) -> Reflect, writing results to the blackboard."""
        memory.evidence_tag.set({**memory.evidence_tag.get(), "agent_id": self.id})
        # Other ghosts' final answers only, trimmed. Their raw tool results (whole scraped pages)
        # blew the free tier's tokens-per-minute quota on every key at once.
        board_state = {
            k: v[:600] if isinstance(v, str) else v
            for k, v in (await self.blackboard.read_relevant(self.session_id, self.id)).items()
            if k.endswith(":output")
        }
        prompt = self._build_prompt(task, board_state, context)

        tools = self._tool_schemas() if use_tools else []
        response = await self.gemma.generate(
            system_prompt=self.system_prompt,
            user_message=prompt,
            tools=tools,
            temperature=self.temperature,
            # With minimal thinking the model happily skips research; ANY forces >=1 tool call.
            tool_mode="ANY" if tools else "AUTO",
        )

        tool_results = []
        if use_tools:  # otherwise keep the log of the research the orchestrator ran for us
            self.research_log = []
        for call in response.get("function_calls", []):
            await self.blackboard.emit(self.session_id, "tool_call", {"agent_id": self.id, **call})
            result = await self.tool_executor.execute(call)
            tool_results.append({"call": call, "result": result})
            self.research_log.append({"tool": call["name"], "query": call["args"].get("query"),
                                      "per_source": result.get("per_source") if isinstance(result, dict) else None})
            await self.blackboard.write(self.session_id, self.id, f"tool:{call['name']}", result)

        final = (await self._reflect(task, context, response["text"], tool_results)
                 if tool_results else response["text"])

        self.memory.append({"task": task, "output": final})
        await self.blackboard.write(self.session_id, self.id, "output", final)
        await self.blackboard.emit(
            self.session_id, "agent_output", {"agent_id": self.id, "name": self.name, "output": final}
        )

        return final

    async def _reflect(self, task: str, context: dict | None, text: str, tool_results: list[dict]) -> str:
        # Don't resend the whole first prompt (shared evidence + team context): the tool results
        # are the fresh evidence. That duplicate was ~half of every ghost's input tokens.
        brief = {k: v for k, v in (context or {}).items() if k != "evidence"}
        reflection_prompt = (
            f"TASK: {task}\n\nCONTEXT:\n{brief}\n\n"
            f"You drafted this response:\n{text or '(only tool calls)'}\n\n"
            f"Tool results you gathered:\n{_compact(tool_results)}\n\n"
            "Now write the final answer to the TASK above, in exactly the format it asks for, "
            "using the tool results. Drop any claim the tool results contradict."
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
