from typing import Any

from google import genai
from google.genai import types

from app.config import settings
from app.utils.logger import get_logger

logger = get_logger(__name__)


class GemmaAPIError(RuntimeError):
    pass


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


class GemmaClient:
    """Thin async wrapper around the Gemini API for calling Gemma models."""

    def __init__(self, model: str | None = None):
        if not settings.gemini_api_key:
            raise GemmaAPIError(
                "GEMINI_API_KEY is not set. Copy backend/.env.example to backend/.env "
                "and fill it in."
            )
        self._client = genai.Client(api_key=settings.gemini_api_key)
        self.model = model or settings.gemma_model_specialist

    async def generate(
        self,
        system_prompt: str,
        user_message: str,
        tools: list[dict] | None = None,
        temperature: float = 0.7,
        max_output_tokens: int = 4096,
    ) -> dict:
        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=temperature,
            max_output_tokens=max_output_tokens,
        )

        if tools:
            config.tools = [_build_tool(t) for t in tools]
            config.tool_config = types.ToolConfig(
                function_calling_config=types.FunctionCallingConfig(mode="AUTO")
            )

        try:
            response = await self._client.aio.models.generate_content(
                model=self.model,
                contents=user_message,
                config=config,
            )
        except Exception as exc:  # google-genai raises various API-specific errors
            logger.error("Gemma API call failed: %s", exc)
            raise GemmaAPIError(str(exc)) from exc

        return {
            "text": response.text or "",
            "function_calls": _extract_function_calls(response),
        }
