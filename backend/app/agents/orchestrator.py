"""Court flow:

question -> Router (topic / simple|complex / needs_web)
         -> [web research -> BGE vectors in memory]
         -> simple:  one direct answer
         -> complex: Role Maker spawns ghosts -> each presents a case
                     -> Judge rules (accept | retry with guidance), ghosts redo
                     -> Judge verdict -> detailed summary
"""

import asyncio

from app.agents.judge import Judge
from app.agents.registry import AgentFactory
from app.agents.role_maker import RoleMakerAgent
from app.agents.router import Route, RouterAgent
from app.config import settings
from app.models.session import SessionState, SessionStatus
from app.services import memory
from app.services.blackboard import Blackboard
from app.services.gemma_client import GemmaClient
from app.services.research import web_research
from app.services.scraper import scrape
from app.utils.json_parser import JSONExtractionError, extract_json
from app.utils.logger import get_logger

logger = get_logger(__name__)

CASE_TASK = """Present your case to the Judge on the QUESTION, from your role's expertise.
Use your tools (search_memory, web_research, ...) to gather evidence first if needed.

Respond with STRICT JSON only:
{"claim": "your position in 1-3 sentences",
 "evidence": [{"fact": "...", "source": "url or tool name"}],
 "confidence": 0.0-1.0,
 "emotion": "your conviction/stance in a few words, e.g. 'cautiously optimistic'"}"""

DIRECT_PROMPT = "You are a precise fintech assistant. Answer directly and concisely. Use the evidence if given; cite sources."


def parse_case(text: str) -> dict:
    """Ghost output -> case dict. Prose that isn't JSON still counts as a (weak) claim."""
    try:
        case = extract_json(text)
    except JSONExtractionError:
        return {"claim": text.strip(), "evidence": [], "confidence": 0.3, "emotion": "unstructured"}
    case.setdefault("claim", "")
    case.setdefault("evidence", [])
    case.setdefault("confidence", 0.5)
    case.setdefault("emotion", "")
    return case


class Orchestrator:
    def __init__(self, blackboard: Blackboard):
        self.blackboard = blackboard
        self.router = RouterAgent()
        self.role_maker = RoleMakerAgent()
        self.judge = Judge()

    async def _status(self, session: SessionState, status: SessionStatus) -> None:
        session.status = status
        await self.blackboard.emit(session.session_id, "status", status)

    async def revive_startup(self, session: SessionState) -> SessionState:
        async def flow():
            await self._status(session, SessionStatus.SCRAPING)
            data = await scrape(session.input_url)
            session.startup_data = data
            await self.blackboard.emit(session.session_id, "startup_data", data)

            snap = data.get("latest_snapshot") or {}
            await memory.add(
                [{"text": f"{snap.get('title', '')} {snap.get('description', '')} {snap.get('excerpt', '')}",
                  "source": snap.get("snapshot_url", session.input_url), "title": snap.get("title", "")}]
                + [{"text": d["title"] or "", "source": d["hn_url"], "title": d["title"] or ""} for d in data["hn_discussions"]]
            )

            question = (
                f"Dead fintech startup: {session.input_url} ({data['inferred_name']}). "
                "What was it, why did it die, and should it be revived — if so, how?"
            )
            route = Route(topic="startup_revival", complexity="complex", needs_web=True,
                          search_queries=[data["inferred_name"]])
            await self._run(session, question, route, extra_context={"startup_data": data})

        return await self._guard(session, flow())

    async def solve_problem(self, session: SessionState) -> SessionState:
        async def flow():
            await self._status(session, SessionStatus.ROUTING)
            route = await self.router.route(session.problem_statement)
            await self._run(session, session.problem_statement, route)

        return await self._guard(session, flow())

    async def _guard(self, session: SessionState, flow) -> SessionState:
        try:
            await flow
        except Exception as exc:
            logger.exception("Session %s failed", session.session_id)
            session.error = str(exc)
            await self.blackboard.emit(session.session_id, "error", str(exc))
            await self._status(session, SessionStatus.ERROR)
        return session

    async def _run(self, session: SessionState, question: str, route: Route, extra_context: dict | None = None) -> None:
        sid = session.session_id
        session.route = route.model_dump()
        await self.blackboard.emit(sid, "route", session.route)

        if route.needs_web and route.search_queries:
            await self._status(session, SessionStatus.RESEARCHING)
            results = await asyncio.gather(*(web_research(q) for q in route.search_queries))
            await self.blackboard.emit(sid, "research", [{"query": r["query"], "chunks_stored": r["chunks_stored"]} for r in results])

        evidence = await memory.search(question, k=8)
        context = {"question": question, "evidence": evidence, **(extra_context or {})}

        if route.complexity == "simple":
            answer = (await GemmaClient().generate(
                system_prompt=DIRECT_PROMPT, user_message=f"{context}", temperature=0.3))["text"]
            session.verdict = session.summary = answer
            await self.blackboard.emit(sid, "verdict", answer)
            await self._status(session, SessionStatus.DONE)
            return

        await self._status(session, SessionStatus.ROLE_MAKING)
        manifest = await self.role_maker.generate_manifest(question, extra_context)
        session.manifest = manifest
        await self.blackboard.emit(sid, "manifest", manifest.model_dump())

        await self._status(session, SessionStatus.IN_COURT)
        ghosts = {g.id: g for g in AgentFactory.create_team(manifest, self.blackboard, sid)}
        outputs = await asyncio.gather(*(g.run(CASE_TASK, context) for g in ghosts.values()))
        cases = {gid: parse_case(out) for gid, out in zip(ghosts, outputs)}

        for attempt in range(settings.max_judge_retries + 1):
            rulings = await self.judge.rule(question, cases)
            await self.blackboard.emit(sid, "rulings", {"attempt": attempt, "rulings": {k: r.model_dump() for k, r in rulings.items()}})
            for gid, r in rulings.items():
                cases[gid]["ruling"] = r.model_dump(exclude={"agent_id"})

            sent_back = [gid for gid, r in rulings.items() if r.decision == "retry"]
            if not sent_back or attempt == settings.max_judge_retries:
                break

            redo = await asyncio.gather(*(
                ghosts[gid].run(CASE_TASK, {**context, "previous_case": cases[gid], "judge_guidance": rulings[gid].guidance})
                for gid in sent_back
            ))
            for gid, out in zip(sent_back, redo):
                cases[gid] = parse_case(out)

        session.cases = cases
        verdict = await self.judge.verdict(question, cases)
        session.verdict = verdict
        await self.blackboard.emit(sid, "verdict", verdict)

        await self._status(session, SessionStatus.SUMMARIZING)
        session.summary = await self.judge.summarize(question, cases, verdict)
        await self.blackboard.emit(sid, "summary", session.summary)
        await self._status(session, SessionStatus.DONE)
