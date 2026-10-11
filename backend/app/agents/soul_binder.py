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
{strict}Grade search_quality 0.0-1.0 (relevance, diversity, freshness of sources).

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


STRICT_RULE = """STRICT MODE (the user asked for maximum rigour): send back any case whose key claim
rests on a single source, on a source older than 2 years when fresher data matters, or on
speculation presented as fact, even if the argument is otherwise good.
"""

SCORE_TASK = """QUESTION: {question}

CASES (with your rulings):
{cases}

THE OWNER'S SITUATION: {stage}

Score the situation from the evidence only, and explain it to a small-business owner in India
who is NOT an analyst: short sentences, everyday words, Rs amounts where useful, no jargon
(never say "unit economics", "TAM", "pivot" etc. without saying what it means).
Respond with STRICT JSON only:
{{"label": "the verdict label, e.g. GO / PIVOT / NO-GO (or for a running business STRONG / EXPOSED / AT RISK,
            for a struggling one RECOVERABLE / RESTRUCTURE / WIND DOWN, for a dead one REVIVE / REVIVE WITH PIVOT / STAY DEAD)",
  "dimensions": {{"Market demand": 0-10, "Competition": 0-10, "Unit economics": 0-10,
                  "Regulation & risk": 0-10, "Execution": 0-10}},
  "plain": {{"verdict_in_plain_words": "1-2 sentences: the answer, as you'd say it to a friend",
             "what_this_means": "2-4 sentences: what the owner should do now, concretely",
             "confidence_in_plain_words": "1 sentence: how sure the council is and why",
             "dimension_notes": {{"Market demand": "one plain sentence", "Competition": "...", "Unit economics": "...",
                                  "Regulation & risk": "...", "Execution": "..."}}}}}}
Higher is always better for the business (e.g. low competition = high score)."""

PLAN_TASK = """QUESTION: {question}

THE OWNER'S SITUATION: {stage}

CASES (with your rulings):
{cases}

Turn the council's findings into a practical 90-day plan (13 weeks) for this owner. Plain words,
concrete actions with numbers (customers, Rs, dates), each task doable by a small team. Start with
the cheapest test of the riskiest assumption. Fit the situation: a new idea = test, then build, then launch;
a running business = protect, then grow; a struggling one = stop the bleeding, fix the cause, stabilise;
a dead one = learn why it died, re-test demand, relaunch small.
Respond with STRICT JSON only:
{{"horizon_days": 90, "goal": "one sentence: where they should be on day 90",
  "first_step_this_week": "the single most important thing to do in the next 7 days",
  "phases": [{{"name": "short phase name", "start_week": 1, "end_week": 4}}],
  "tasks": [{{"id": "t1", "title": "action, max 10 words", "phase": "a phase name above", "start_week": 1,
              "end_week": 2, "owner": "who does it (Founder / Ops / Marketing ...)", "why": "one plain sentence",
              "success_metric": "how they'll know it worked", "depends_on": []}}],
  "review": {{"strengths": ["2-4 things working for them"], "risks": ["2-4 things that could hurt them"],
              "stop_doing": ["1-3 things to stop"]}}}}
3 phases, 6-10 tasks, weeks between 1 and 13, end_week >= start_week.
No abbreviations or business jargon (write "cost of one meal", not COGS; "first simple version of the app", not MVP)."""

STAGE_HINTS = {
    "launch": "a new idea that is not built yet",
    "grow": "a running business that wants to grow",
    "rescue": "a running business that is declining",
    "revive": "a company that already shut down",
}


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

    async def score(self, question: str, cases: dict[str, dict], stage: str | None = None) -> dict:
        """Per-dimension ratings + plain-language explanation; the 0-100 overall is computed in code (flow.md)."""
        raw = extract_json(await self._ask(
            SCORE_TASK.format(question=question, cases=_fmt(cases), stage=_stage(stage)), temperature=0.1, think=False))
        dims = {str(k): max(0.0, min(10.0, float(v))) for k, v in (raw.get("dimensions") or {}).items()
                if isinstance(v, (int, float))}
        overall = round(sum(dims.values()) / len(dims) * 10) if dims else None
        plain = raw.get("plain") if isinstance(raw.get("plain"), dict) else {}
        return {"label": str(raw.get("label", "")), "dimensions": dims, "overall": overall, "plain": plain}

    async def plan(self, question: str, cases: dict[str, dict], stage: str | None = None) -> dict:
        """A 90-day action plan (Gantt-ready). Week numbers are clamped in code so the chart never breaks."""
        raw = extract_json(await self._ask(
            PLAN_TASK.format(question=question, cases=_fmt(cases), stage=_stage(stage)), temperature=0.3, think=False))
        return _clean_plan(raw)

    async def rule(
        self, question: str, cases: dict[str, dict], window: list[dict] | None = None, think: bool = True,
        strict: bool = False,
    ) -> dict[str, Ruling]:
        text = await self._ask(
            RULING_TASK.format(question=question, cases=_fmt(cases), window=_fmt_window(window or []),
                               strict=STRICT_RULE if strict else ""),
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


def _stage(stage: str | None) -> str:
    return STAGE_HINTS.get(stage or "", "not stated; infer it from the question")


def _week(v, default: int) -> int:
    try:
        return max(1, min(13, int(v)))
    except (TypeError, ValueError):
        return default


def _clean_plan(raw: dict) -> dict:
    tasks = []
    for i, t in enumerate(raw.get("tasks") or []):
        if not isinstance(t, dict) or not t.get("title"):
            continue
        start = _week(t.get("start_week"), 1)
        tasks.append({**t, "id": str(t.get("id") or f"t{i + 1}"), "start_week": start,
                      "end_week": max(start, _week(t.get("end_week"), start)),
                      "depends_on": [str(d) for d in t.get("depends_on") or []]})
    phases = []
    for p in raw.get("phases") or []:
        if isinstance(p, dict) and p.get("name"):
            start = _week(p.get("start_week"), 1)
            phases.append({"name": str(p["name"]), "start_week": start, "end_week": max(start, _week(p.get("end_week"), 13))})
    review = raw.get("review") if isinstance(raw.get("review"), dict) else {}
    return {"horizon_days": 90, "goal": str(raw.get("goal", "")),
            "first_step_this_week": str(raw.get("first_step_this_week", "")),
            "phases": phases, "tasks": tasks,
            "review": {k: [str(x) for x in review.get(k) or []] for k in ("strengths", "risks", "stop_doing")}}


def _fmt(cases: dict[str, dict]) -> str:
    return json.dumps(cases, indent=2, default=str)


def _fmt_window(window: list[dict]) -> str:
    # Trim each chunk: the Soul Binder needs the gist + provenance, not full pages.
    return "\n".join(
        f"- [{e.get('source_type')}] (by {e.get('agent_id') or 'research'}) {e.get('title', '')}: "
        f"{(e.get('text') or '')[:300]} <{e.get('source')}>"
        for e in window
    ) or "(no new evidence this round)"
