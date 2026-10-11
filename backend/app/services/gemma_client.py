import asyncio
import re
import time
from collections import deque
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
# Same idea, one row per call: shows exactly which step spends the tokens.
call_log: ContextVar[list | None] = ContextVar("call_log", default=None)


def _count_usage(model: str, response: Any, label: str = "", key: int = 0) -> None:
    counter, u = usage_counter.get(), getattr(response, "usage_metadata", None)
    if u is None:
        return
    if counter is not None:
        m = counter.setdefault(model, {"calls": 0, "input": 0, "output": 0, "thinking": 0})
        m["calls"] += 1
        m["input"] += u.prompt_token_count or 0
        m["output"] += u.candidates_token_count or 0
        m["thinking"] += u.thoughts_token_count or 0
    log = call_log.get()
    if log is not None:
        log.append({"step": label, "key": key + 1, "input": u.prompt_token_count or 0,
                    "output": (u.candidates_token_count or 0) + (u.thoughts_token_count or 0)})


def _label(system_prompt: str) -> str:
    return system_prompt.strip().split("\n")[0][:48]


def _quota_id(exc: Exception) -> str:
    match = re.search(r"quotaId'?:\s*'([^']+)", str(exc))
    return match.group(1) if match else "?"


# ---- per-key pacing: stay just under each key's free-tier limits instead of eating 429 penalties
_windows: list[deque] = []  # per key: (timestamp, estimated tokens) of calls in the last 60s


async def _acquire_key(start: int, est_tokens: int) -> int:
    """Pick the first key (round-robin from `start`) with headroom; if none, wait for one."""
    n = len(_clients)
    if settings.key_tpm:
        est_tokens = min(est_tokens, settings.key_tpm)  # a huge call must still fit an empty window
    while len(_windows) < n:
        _windows.append(deque())
    while True:
        now = time.monotonic()
        for off in range(n):
            i = (start + off) % n
            w = _windows[i]
            while w and now - w[0][0] > 60:
                w.popleft()
            tokens = sum(t for _, t in w)
            # The paid key (always last in the pool) shares the 30 RPM cap but not the 16K TPM one.
            tpm = 0 if settings.use_paid and i == n - 1 else settings.key_tpm
            if len(w) < settings.key_rpm and (not tpm or tokens + est_tokens <= tpm):
                w.append((now, est_tokens))
                return i
        oldest = min(w[0][0] for w in _windows[:n] if w)
        await asyncio.sleep(max(0.5, 60 - (now - oldest)))
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


def _grounding_sources(response: Any) -> list[dict]:
    meta = getattr((getattr(response, "candidates", None) or [None])[0], "grounding_metadata", None)
    return [{"url": c.web.uri, "title": c.web.title} for c in (getattr(meta, "grounding_chunks", None) or []) if c.web]


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
        _clients.extend(genai.Client(api_key=k) for k in settings.active_api_keys)
    return _clients


class GemmaClient:
    """Thin async wrapper around the Gemini API for calling Gemma models."""

    def __init__(self, model: str | None = None):
        if not settings.active_api_keys:
            raise GemmaAPIError(
                "No API key: set gemini_key (free) in backend/.env, or gemini_unlimited plus "
                "unlimited=true for the paid key."
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
        google_search: bool = False,
    ) -> dict:
        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=temperature,
            max_output_tokens=max_output_tokens,
            # Hidden thinking ~doubles latency; only the Soul Binder's rulings need it.
            # Gemma 4 accepts only "minimal" / "high"; unset (default) measured ~2x slower than "high".
            thinking_config=types.ThinkingConfig(thinking_level="high" if think else "minimal"),
        )

        if google_search:
            # Gemma 4 supports Google's own search as a built-in tool (grounding).
            config.tools = [types.Tool(google_search=types.GoogleSearch())]
        elif tools:
            config.tools = [_build_tool(t) for t in tools]
            config.tool_config = types.ToolConfig(
                function_calling_config=types.FunctionCallingConfig(mode=tool_mode)
            )

        global _key_index
        pool = _client_pool()
        rotations_left = len(pool) - 1
        # Round-robin: every call starts on the next key, so N keys = N x the per-minute quota.
        start = _key_index
        _key_index += 1
        est = (len(system_prompt) + len(user_message)) // 4  # the free-tier TPM quota counts INPUT tokens only
        attempt = 0
        while True:
            attempt += 1
            idx = await _acquire_key(start, est)
            client = pool[idx]
            try:
                response = await client.aio.models.generate_content(
                    model=self.model,
                    contents=user_message,
                    config=config,
                )
                _count_usage(self.model, response, _label(system_prompt), idx)
                break
            except errors.APIError as exc:
                if exc.code == 429 and rotations_left > 0:
                    # Another account's quota is free: switch key and retry immediately, no sleep.
                    rotations_left -= 1
                    start = idx + 1
                    logger.warning("429 on key #%d (%s), rotating to key #%d",
                                   idx + 1, _quota_id(exc), start % len(pool) + 1)
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
            "sources": _grounding_sources(response),
            "function_calls": _extract_function_calls(response),
        }


    async def stream(self, system_prompt: str, user_message: str, temperature: float = 0.3,
                     max_output_tokens: int = 8192, think: bool = False):
        """Yield text chunks as Gemma writes them, so the UI shows the report live.
        Key rotation applies until the first chunk arrives; after that we're committed."""
        global _key_index
        config = types.GenerateContentConfig(
            system_instruction=system_prompt, temperature=temperature, max_output_tokens=max_output_tokens,
            thinking_config=types.ThinkingConfig(thinking_level="high" if think else "minimal"),
        )
        pool = _client_pool()
        start = _key_index
        _key_index += 1
        est = (len(system_prompt) + len(user_message)) // 4  # the free-tier TPM quota counts INPUT tokens only
        tries = len(pool) + MAX_ATTEMPTS
        for attempt in range(tries):
            idx = await _acquire_key(start + attempt, est)
            client = pool[idx]
            last = None
            try:
                async for chunk in await client.aio.models.generate_content_stream(
                    model=self.model, contents=user_message, config=config
                ):
                    last = chunk
                    if chunk.text:
                        yield chunk.text
                if last is not None:
                    _count_usage(self.model, last, _label(system_prompt), idx)
                return
            except errors.APIError as exc:
                if last is None and (exc.code == 429 or exc.code >= 500) and attempt < tries - 1:
                    if attempt >= len(pool) - 1:  # every key tried: now actually wait
                        await asyncio.sleep(_retry_delay(exc, attempt))
                    logger.warning("%s on stream (key #%d, %s), retrying", exc.code, idx + 1, _quota_id(exc))
                    continue
                raise GemmaAPIError(str(exc)) from exc
