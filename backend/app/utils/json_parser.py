import json
import re


class JSONExtractionError(ValueError):
    pass


_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL)


def extract_json(text: str) -> dict:
    """Pull the first JSON object out of an LLM response.

    Handles plain JSON, JSON wrapped in ```json fences, and JSON with
    leading/trailing prose around it.
    """
    fenced = _FENCE_RE.search(text)
    candidate = fenced.group(1) if fenced else text

    start = candidate.find("{")
    end = candidate.rfind("}")
    if start == -1 or end == -1 or end < start:
        raise JSONExtractionError(f"No JSON object found in: {text[:200]!r}")

    try:
        return json.loads(candidate[start : end + 1])
    except json.JSONDecodeError as exc:
        raise JSONExtractionError(f"Invalid JSON: {exc}") from exc
