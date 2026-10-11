import asyncio
import re
from contextvars import ContextVar
from typing import Any

from google import genai
from google.genai import errors
from google.genai import types

from app.config import settings
from app.utils.logger import get_logger

logger = get_logger(__name__)


class GemmaAPIError(RuntimeError):
    pass


MAX_ATTEMPTS = 4

# Orchestrator sets a fresh dict per session; every call adds its token counts to it.
usage_counter: ContextVar[dict | None] = ContextVar("usage_counter", default=None)


def _count_usage(model: str, response: Any) -> None:
    counter, u = usage_counter.get(), getattr(response, "usage_metadata", None)
    if counter is None or u is None:
        return
    m = counter.setdefault(model, {"calls": 0, "input": 0, "output": 0, "thinking": 0})
    m["calls"] += 1
    m["input"] += u.prompt_token_count or 0
    m["output"] += u.candidates_token_count or 0
    m["thinking"] += u.thoughts_token_count or 0
_RETRY_RE = re.compile(r"retry in ([\d.]+)s", re.IGNORECASE)


def _retry_delay(exc: Exception, attempt: int = 1) -> float:
    """Free tier is 30 req/min per model; Google's 429 says how long to wait.
    Anything else retryable (5xx) gets a short pause."""
    match = _RETRY_RE.search(str(exc))
    if match:
        return float(match.group(1)) + 1
    return 30.0 if getattr(exc, "code", None) == 429 else 5.0 * 2 ** (attempt - 1)  # 5, 10, 20s


def _build_tool(schema: dict) -> types.Tool:
    return types.Tool(
        function_declarations=[
            types.FunctionDeclaration(
                name=schema["name"],
                description=schema.get("description", ""),
                parameters=schema.get("parameters"),
            )
        ]
    )


def _extract_function_calls(response: Any) -> list[dict]:
    calls = getattr(response, "function_calls", None)
    if calls:
        return [{"name": fc.name, "args": dict(fc.args or {})} for fc in calls]

    # Fallback: walk candidates/parts directly (older/newer SDK shapes differ).
    calls = []
    for candidate in getattr(response, "candidates", None) or []:
        content = getattr(candidate, "content", None)
        for part in getattr(content, "parts", None) or []:
            fc = getattr(part, "function_call", None)
            if fc is not None:
                calls.append({"name": fc.name, "args": dict(fc.args or {})})
    return calls


_clients: list[genai.Client] = []
_key_index = 0  # shared across all GemmaClients: rotate once, everyone moves off the exhausted key


def _client_pool() -> list[genai.Client]:
    if not _clients:
        _clients.extend(genai.Client(api_key=k) for k in settings.gemini_api_keys)
    return _clients


class GemmaClient:
    """Thin async wrapper around the Gemini API for calling Gemma models."""

    def __init__(self, model: str | None = None):
        if not settings.gemini_api_key:
            raise GemmaAPIError(
                "GEMINI_API_KEY is not set. Copy backend/.env.example to backend/.env "
                "and fill it in."
            )
        _client_pool()
        self.model = model or settings.gemma_model_specialist

    async def generate(
        self,
        system_prompt: str,
        user_message: str,
        tools: list[dict] | None = None,
        temperature: float = 0.7,
        max_output_tokens: int = 4096,
        think: bool = False,
        tool_mode: str = "AUTO",
    ) -> dict:
        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=temperature,
            max_output_tokens=max_output_tokens,
            # Hidden thinking ~doubles latency; only the Soul Binder's rulings need it.
            # Gemma 4 accepts only "minimal" / "high"; unset (default) measured ~2x slower than "high".
            thinking_config=types.ThinkingConfig(thinking_level="high" if think else "minimal"),
        )

        if tools:
            config.tools = [_build_tool(t) for t in tools]
            config.tool_config = types.ToolConfig(
                function_calling_config=types.FunctionCallingConfig(mode=tool_mode)
            )

        global _key_index
        pool = _client_pool()
        rotations_left = len(pool) - 1
        attempt = 0
        while True:
            attempt += 1
            client = pool[_key_index % len(pool)]
            try:
                response = await client.aio.models.generate_content(
                    model=self.model,
                    contents=user_message,
                    config=config,
                )
                _count_usage(self.model, response)
                break
            except errors.APIError as exc:
                if exc.code == 429 and rotations_left > 0:
                    # Another account's quota is free: switch key and retry immediately, no sleep.
                    rotations_left -= 1
                    if pool[_key_index % len(pool)] is client:
                        _key_index += 1
                    logger.warning("429 on key #%d, rotating to key #%d", pool.index(client) + 1, _key_index % len(pool) + 1)
                    continue
                if (exc.code == 429 or exc.code >= 500) and attempt < MAX_ATTEMPTS + len(pool) - 1:
                    delay = _retry_delay(exc, attempt)
                    logger.warning("%s on %s, retrying in %.0fs (attempt %d)", exc.code, self.model, delay, attempt)
                    await asyncio.sleep(delay)
                    continue
                logger.error("Gemma API call failed: %s", exc)
                raise GemmaAPIError(str(exc)) from exc
            except Exception as exc:  # network errors etc.
                logger.error("Gemma API call failed: %s", exc)
                raise GemmaAPIError(str(exc)) from exc

        return {
            "text": response.text or "",
            "function_calls": _extract_function_calls(response),
        }
