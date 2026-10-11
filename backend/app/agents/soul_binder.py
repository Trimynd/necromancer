import json
from typing import Literal

from pydantic import BaseModel, Field, ValidationError, field_validator

from app.config import settings
from app.services.gemma_client import GemmaClient
from app.utils.json_parser import JSONExtractionError, extract_json
from app.utils.logger import get_logger

logger = get_logger(__name__)

SOUL_BINDER_PROMPT = """You are the Soul Binder of the Necromancer's court: the presiding
authority who summons the expert ghosts, hears them, and binds their souls into
one verdict. Each ghost presents a case: a claim, evidence with sources, a confidence, the
emotion/conviction behind it, and a search log of how it researched.
You listen to all evidence, facts and emotions, weigh them fairly, and judge
the QUALITY OF THE RESEARCH as hard as the argument. Never invent facts no
ghost or evidence item presented. Label speculation as speculation."""

RULING_TASK = """QUESTION: {question}

CASES (source_types = distinct kinds of sources each ghost actually cited):
{cases}

ROLLING EVIDENCE WINDOW (what was scraped this round and last, best matches first):
{window}

Rule on every ghost's case, on its merits. Use your own judgement; there is no checklist.
- "accept" when the case is on-topic and its key claims are believable given the evidence.
  Independent sources make a claim stronger; note single-source claims in "reason",
  but they are not on their own a reason to send a strong case back.
- "retry" only when the case is off-topic, unsupported, contradicted by the evidence window,
  or its research clearly failed. Then say exactly what to search next and which source
  types would help (web, news, reddit, hackernews, wikipedia, finance, jobs, reviews, economy, google).
Grade search_quality 0.0-1.0 (relevance, diversity, freshness of sources).

Respond with STRICT JSON only:
{{"rulings": [{{"agent_id": "...", "decision": "accept" | "retry", "reason": "...",
  "search_quality": 0.0, "missing_sources": ["..."], "needs_more": "exact next search",
  "guidance": "what to fix in the argument"}}]}}"""

REPORT_TASK = """QUESTION: {question}

CASES (with your rulings):
{cases}

Bind the ghosts' offerings into ONE markdown report. Start with the verdict so it can be read first:

## 1. Verdict
GO / PIVOT / NO-GO (or the direct answer if it is not a go/no-go question), a 0-100 confidence,
which ghosts' offerings it rests on and why, which were weaker or single-sourced. Be decisive.
Keep separate events separate: never merge two causes into one story unless the evidence links them.
Say \"alleged\" for allegations that are not findings.
## 2. Question & context
## 3. Evidence presented (per ghost: claims, source types used, links)
## 4. Soul Binder rulings (accepted / sent back, search quality, what was missing)
## 5. Market & competitors
A markdown table | Company | Listed? (ticker) | What they do | Status / key number | Source link |
covering every company the evidence mentions (incumbents, rivals, failed peers). Never invent tickers or
numbers; write "n/a" when the evidence doesn't give one.
## 6. Risks & open questions (flag single-source claims)
## 7. Recommended next steps"""


class Ruling(BaseModel):
    agent_id: str
    decision: Literal["accept", "retry"]
    reason: str = ""
    search_quality: float = Field(default=0.5, ge=0, le=1)
    missing_sources: list[str] = Field(default_factory=list)
    needs_more: str = ""
    guidance: str = ""

    # Accepted cases come back with "needs_more": null etc.; that's "nothing to add", not malformed.
    @field_validator("reason", "needs_more", "guidance", mode="before")
    @classmethod
    def _none_to_empty(cls, v):
        return "" if v is None else v

    @field_validator("missing_sources", mode="before")
    @classmethod
    def _none_to_list(cls, v):
        return [] if v is None else v

    @field_validator("search_quality", mode="before")
    @classmethod
    def _none_to_default(cls, v):
        return 0.5 if v is None else v


class SoulBinder:
    def __init__(self, gemma: GemmaClient | None = None):
        self.gemma = gemma or GemmaClient(model=settings.gemma_model_hub)

    async def _ask(self, task: str, temperature: float = 0.3, think: bool = True) -> str:
        resp = await self.gemma.generate(
            system_prompt=SOUL_BINDER_PROMPT, user_message=task, temperature=temperature, think=think,
            max_output_tokens=8192,  # thinking tokens count against this; 4096 left empty replies
        )
        if think and not resp["text"].strip():
            logger.warning("Soul Binder thought itself out of tokens; retrying without thinking")
            return await self._ask(task, temperature, think=False)
        return resp["text"]

    async def rule(
        self, question: str, cases: dict[str, dict], window: list[dict] | None = None, think: bool = True
    ) -> dict[str, Ruling]:
        text = await self._ask(
            RULING_TASK.format(question=question, cases=_fmt(cases), window=_fmt_window(window or [])),
            temperature=0.2, think=think,
        )
        rulings: dict[str, Ruling] = {}
        try:
            for x in extract_json(text).get("rulings", []):
                try:
                    r = Ruling.model_validate(x)
                    rulings[r.agent_id] = r
                except ValidationError as exc:  # one bad ruling shouldn't void the rest
                    logger.warning("Skipping malformed ruling %s: %s", x, exc)
        except (JSONExtractionError, AttributeError) as exc:
            logger.warning("Soul Binder rulings unparseable, accepting all: %s", exc)
        # Any ghost the Soul Binder skipped is accepted rather than silently dropped.
        return {aid: rulings.get(aid, Ruling(agent_id=aid, decision="accept", reason="(no ruling given)")) for aid in cases}

    def report(self, question: str, cases: dict[str, dict]):
        """Stream the final report (verdict first). Minimal thinking: the hard reasoning
        already happened in the rulings, and thinking would delay the first visible word."""
        return self.gemma.stream(
            system_prompt=SOUL_BINDER_PROMPT, user_message=REPORT_TASK.format(question=question, cases=_fmt(cases)),
        )


def _fmt(cases: dict[str, dict]) -> str:
    return json.dumps(cases, indent=2, default=str)


def _fmt_window(window: list[dict]) -> str:
    # Trim each chunk: the Soul Binder needs the gist + provenance, not full pages.
    return "\n".join(
        f"- [{e.get('source_type')}] (by {e.get('agent_id') or 'research'}) {e.get('title', '')}: "
        f"{(e.get('text') or '')[:300]} <{e.get('source')}>"
        for e in window
    ) or "(no new evidence this round)"
