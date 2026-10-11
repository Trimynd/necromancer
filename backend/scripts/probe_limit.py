"""Burst tiny calls until a 429, then print the quota details Google returns.

Run:  python test/probe_limit.py [model] [max_calls]
"""

import asyncio
import json
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
from google import genai
from google.genai import errors, types

load_dotenv(Path(__file__).resolve().parent.parent / ".env")
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY") or os.getenv("gemini_key"))

MODEL = sys.argv[1] if len(sys.argv) > 1 else "gemma-4-26b-a4b-it"
MAX_CALLS = int(sys.argv[2]) if len(sys.argv) > 2 else 40
CFG = types.GenerateContentConfig(max_output_tokens=256)


async def call(i: int):
    try:
        await client.aio.models.generate_content(model=MODEL, contents="Say hi", config=CFG)
        return None
    except errors.APIError as e:
        return e


async def main() -> None:
    t = time.perf_counter()
    ok = 0
    # waves of 10 so we stop soon after the first 429 instead of firing everything
    for start in range(0, MAX_CALLS, 10):
        results = await asyncio.gather(*(call(i) for i in range(start, start + 10)))
        failures = [e for e in results if e is not None]
        ok += len(results) - len(failures)
        print(f"{ok} ok after {time.perf_counter() - t:.1f}s")
        if failures:
            e = failures[0]
            print(f"\nFirst error: {e.code} {e.status}")
            print(json.dumps(e.details, indent=2)[:3000])
            return
    print(f"No 429 in {MAX_CALLS} calls within {time.perf_counter() - t:.1f}s")


if __name__ == "__main__":
    asyncio.run(main())
