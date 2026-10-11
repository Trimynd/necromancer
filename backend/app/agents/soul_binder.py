import json
from typing import Literal

from pydantic import BaseModel, ValidationError

from app.config import settings
from app.services.gemma_client import GemmaClient
from app.utils.json_parser import JSONExtractionError, extract_json
from app.utils.logger import get_logger

logger = get_logger(__name__)

JUDGE_PROMPT = """You are the Main Judge of a panchayat / courtroom of AI expert ghosts.
Each ghost presents a case: a claim, evidence with sources, a confidence, and
the emotion/conviction behind it. You listen to all evidence, facts and
emotions, weigh them fairly, and do not invent facts no ghost presented.
Label speculation as speculation."""

RULING_TASK = """QUESTION: {question}

CASES:
{cases}

Rule on every case. "accept" if it is relevant, on-topic and backed by
evidence. "retry" if it is off-topic, unsupported, or contradicted — and give
precise guidance on what to search for or fix.

Respond with STRICT JSON only:
{{"rulings": [{{"agent_id": "...", "decision": "accept" | "retry", "reason": "...", "guidance": "..."}}]}}"""

VERDICT_TASK = """QUESTION: {question}

CASES (with your rulings):
{cases}

Deliver the final verdict: the answer to the question, which ghosts' offerings
it rests on and why, which were weaker, and the key risks. Be decisive."""

SUMMARY_TASK = """QUESTION: {question}

CASES:
{cases}

VERDICT:
{verdict}

Write a detailed summary report in markdown with sections:
1. Question & context
2. Evidence presented (per ghost, with sources)
3. Court rulings (accepted / sent back and why)
4. Final verdict
5. Risks & open questions
6. Recommended next steps"""


class Ruling(BaseModel):
    agent_id: str
    decision: Literal["accept", "retry"]
    reason: str = ""
    guidance: str = ""


class Judge:
    def __init__(self, gemma: GemmaClient | None = None):
        self.gemma = gemma or GemmaClient(model=settings.gemma_model_hub)

    async def _ask(self, task: str, temperature: float = 0.3, think: bool = True) -> str:
        resp = await self.gemma.generate(
            system_prompt=JUDGE_PROMPT, user_message=task, temperature=temperature, think=think
        )
        return resp["text"]

    async def rule(self, question: str, cases: dict[str, dict]) -> dict[str, Ruling]:
        text = await self._ask(RULING_TASK.format(question=question, cases=_fmt(cases)), temperature=0.2)
        try:
            raw = extract_json(text).get("rulings", [])
            rulings = {r.agent_id: r for r in (Ruling.model_validate(x) for x in raw)}
        except (JSONExtractionError, ValidationError, AttributeError) as exc:
            logger.warning("Judge rulings unparseable, accepting all: %s", exc)
            rulings = {}
        # Any ghost the judge skipped is accepted rather than silently dropped.
        return {aid: rulings.get(aid, Ruling(agent_id=aid, decision="accept")) for aid in cases}

    async def verdict(self, question: str, cases: dict[str, dict]) -> str:
        return await self._ask(VERDICT_TASK.format(question=question, cases=_fmt(cases)))

    async def summarize(self, question: str, cases: dict[str, dict], verdict: str) -> str:
        return await self._ask(SUMMARY_TASK.format(question=question, cases=_fmt(cases), verdict=verdict), think=False)


def _fmt(cases: dict[str, dict]) -> str:
    return json.dumps(cases, indent=2, default=str)
