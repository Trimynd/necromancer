"""Does Google Search grounding work for this model via the API? Run: python check_search.py [model]"""
import sys

from google import genai
from google.genai import types

from app.config import settings

model = sys.argv[1] if len(sys.argv) > 1 else "gemma-4-31b-it"
client = genai.Client(api_key=settings.gemini_api_key)

resp = client.models.generate_content(
    model=model,
    contents="Name 3 Indian BNPL startups that shut down, with the year and the reason.",
    config=types.GenerateContentConfig(tools=[types.Tool(google_search=types.GoogleSearch())]),
)

print(resp.text)
meta = resp.candidates[0].grounding_metadata
chunks = (meta.grounding_chunks or []) if meta else []
print(f"\n{len(chunks)} sources:", *[c.web.uri for c in chunks if c.web], sep="\n")
print("\nSEARCH WORKS" if chunks else "\nNO GROUNDING: answer came from model memory")
