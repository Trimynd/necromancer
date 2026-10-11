"""Scratch check: is the key in backend/.env usable, which Gemma models work,
what does a call cost in tokens, and does tool calling work.

Run:  python test/check_key.py
"""

import asyncio
import os
import time
from pathlib import Path

from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv(Path(__file__).resolve().parent.parent / ".env")
KEY = os.getenv("GEMINI_API_KEY") or os.getenv("gemini_key")
assert KEY, "No GEMINI_API_KEY / gemini_key in backend/.env"

client = genai.Client(api_key=KEY)

TOOL = types.Tool(function_declarations=[types.FunctionDeclaration(
    name="rbi_lookup",
    description="Check if a fintech idea complies with RBI FREE-AI.",
    parameters={"type": "object", "properties": {"idea": {"type": "string"}}, "required": ["idea"]},
)])


def list_models() -> list[str]:
    names = [m.name.removeprefix("models/") for m in client.models.list()]
    print(f"Key OK - {len(names)} models visible")
    gemma = [n for n in names if "gemma" in n]
    print("Gemma models:", gemma or "none")
    return gemma


async def probe(model: str) -> None:
    t = time.perf_counter()
    try:
        r = await client.aio.models.generate_content(
            model=model, contents="Reply with exactly: ALIVE",
            config=types.GenerateContentConfig(max_output_tokens=1024),
        )
    except Exception as e:
        print(f"  {model:28} FAIL  {str(e)[:200]}")
        return
    u = r.usage_metadata
    print(f"  {model:28} OK  {time.perf_counter() - t:5.2f}s  "
          f"in={u.prompt_token_count} out={u.candidates_token_count} think={u.thoughts_token_count} finish={r.candidates[0].finish_reason}  -> {(r.text or '').strip()!r}")


async def probe_tools(model: str) -> None:
    try:
        r = await client.aio.models.generate_content(
            model=model, contents="Check compliance of: a UPI credit app with no consent screen.",
            config=types.GenerateContentConfig(tools=[TOOL]),
        )
        print(f"  {model}: function_calls={[(c.name, dict(c.args)) for c in (r.function_calls or [])]}")
    except Exception as e:
        print(f"  {model}: tool calling FAIL {str(e)[:200]}")


async def main() -> None:
    gemma = list_models()
    candidates = gemma

    print("\nPlain generation:")
    await asyncio.gather(*(probe(m) for m in candidates))

    print("\nTool calling (Role Maker / agents rely on this):")
    await asyncio.gather(*(probe_tools(m) for m in candidates))

    # Burst to see where rate limiting kicks in (429 = per-minute quota hit)
    model = candidates[0]
    print(f"\nBurst of 10 parallel calls on {model}:")
    await asyncio.gather(*(probe(model) for _ in range(10)))


if __name__ == "__main__":
    asyncio.run(main())
