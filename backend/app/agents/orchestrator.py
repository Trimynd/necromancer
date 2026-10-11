"""Court flow:

question -> Router (topic / simple|complex / needs_web)
         -> [web research -> BGE vectors in memory]
         -> simple:  one direct answer
         -> complex: Role Maker spawns ghosts -> each presents a case
                     -> Soul Binder rules (accept | retry with guidance), ghosts redo
                     -> Soul Binder verdict -> detailed summary
"""

import asyncio
from collections import Counter

from app.agents.soul_binder import SoulBinder
from app.agents.registry import AgentFactory
from app.agents.role_maker import RoleMakerAgent
from app.agents.router import Route, RouterAgent
from app.config import settings
from app.models.session import SessionState, SessionStatus
from app.services import db, memory
from app.services.blackboard import Blackboard
from app.services.gemma_client import GemmaClient, usage_counter
from app.services.research import web_research
from app.services.scraper import scrape
from app.utils.json_parser import JSONExtractionError, extract_json
from app.utils.logger import get_logger

logger = get_logger(__name__)

CASE_TASK = """Present your case to the Soul Binder on the QUESTION, from your role's expertise.
Research first with web_research (pick the sources that fit your role) and search_memory.
Back each key claim with 2+ independent source types where possible.
If the Soul Binder sent you back (see binder_guidance / needs_more / missing_sources in CONTEXT),
do exactly that research, then report in full detail what you searched and found.

Respond with STRICT JSON only:
{"claim": "your position in 1-3 sentences",
 "evidence": [{"fact": "...", "source": "url", "source_type": "web|news|reddit|hackernews|wikipedia|finance|jobs|reviews"}],
 "search_log": {"queries": ["..."], "sources_hit": {"news": 3, "web": 2}, "unknowns": ["what you still could not verify"]},
 "confidence": 0.0-1.0,
 "emotion": "your conviction/stance in a few words, e.g. 'cautiously optimistic'"}"""

SOURCE_TYPES = {"web", "news", "reddit", "hackernews", "wikipedia", "finance", "jobs", "reviews"}

DIRECT_PROMPT = "You are a precise fintech assistant. Answer directly and concisely. Use the evidence if given; cite sources."


def attach_research(case: dict, ghost) -> dict:
    """Overwrite the ghost's self-reported search log with what it actually searched."""
    log = getattr(ghost, "research_log", None)
    if log is None:
        return case
    hits: Counter = Counter()
    for r in log:
        hits.update(r.get("per_source") or {})
    case["search_log"] = {**(case.get("search_log") or {}),
                          "queries": [r["query"] for r in log if r.get("query")],
                          "sources_hit": dict(hits)}
    return case


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
    case.setdefault("search_log", {})
    # Computed, not trusted from the model: which kinds of sources the evidence really cites.
    case["source_types"] = sorted({
        str(e.get("source_type", "")).lower() for e in case["evidence"] if isinstance(e, dict)
    } & SOURCE_TYPES)
    return case


class Orchestrator:
    def __init__(self, blackboard: Blackboard):
        self.blackboard = blackboard
        self.router = RouterAgent()
        self.role_maker = RoleMakerAgent()
        self.soul_binder = SoulBinder()

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
        usage: dict = {}
        usage_counter.set(usage)
        memory.evidence_tag.set({"session_id": session.session_id, "round": 0})
        try:
            await flow
        except Exception as exc:
            logger.exception("Session %s failed", session.session_id)
            session.error = str(exc)
            await self.blackboard.emit(session.session_id, "error", str(exc))
            await self._status(session, SessionStatus.ERROR)
        session.usage = usage
        await self.blackboard.emit(session.session_id, "usage", usage)

        await db.save_session(
            session.session_id, status=session.status, question=session.problem_statement or session.input_url,
            verdict=session.verdict, summary=session.summary, error=session.error,
        )
        return session

    async def _run(self, session: SessionState, question: str, route: Route, extra_context: dict | None = None) -> None:
        sid = session.session_id
        session.route = route.model_dump()
        await self.blackboard.emit(sid, "route", session.route)

        # Role Maker doesn't need the evidence, so it runs alongside research.
        manifest_task = (
            asyncio.create_task(self.role_maker.generate_manifest(question, extra_context))
            if route.complexity != "simple" else None
        )

        if route.needs_web and route.search_queries:
            await self._status(session, SessionStatus.RESEARCHING)
            results = await asyncio.gather(*(web_research(q) for q in route.search_queries))
            await self.blackboard.emit(sid, "research", [
                {"query": r["query"], "chunks_stored": r["chunks_stored"], "per_source": r["per_source"]} for r in results
            ])

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
        manifest = await manifest_task
        session.manifest = manifest
        await self.blackboard.emit(sid, "manifest", manifest.model_dump())

        await self._status(session, SessionStatus.IN_COURT)
        ghosts = {g.id: g for g in AgentFactory.create_team(manifest, self.blackboard, sid)}
        outputs = await asyncio.gather(*(g.run(CASE_TASK, context) for g in ghosts.values()), return_exceptions=True)
        # A ghost that still fails after retries leaves the court instead of sinking the session.
        for gid, out in list(zip(ghosts, outputs)):
            if isinstance(out, Exception):
                logger.warning("Ghost %s dropped: %s", gid, out)
                await self.blackboard.emit(sid, "ghost_dropped", {"agent_id": gid, "error": str(out)})
                ghosts.pop(gid)
        if not ghosts:
            raise RuntimeError("Every ghost failed to present a case")
        cases = {gid: attach_research(parse_case(out), ghosts[gid])
                 for gid, out in zip(ghosts, (o for o in outputs if not isinstance(o, Exception)))}

        for attempt in range(settings.max_binder_retries + 1):
            # Rolling window: the Soul Binder sees only evidence scraped this round and last.
            window = await memory.rolling_window(question, sid, attempt)
            await self.blackboard.emit(sid, "window", {"round": attempt, "chunks": len(window),
                                                       "by_source": Counter(e["source_type"] for e in window)})
            rulings = await self.soul_binder.rule(question, cases, window)
            await self.blackboard.emit(sid, "rulings", {"attempt": attempt, "rulings": {k: r.model_dump() for k, r in rulings.items()}})
            for gid, r in rulings.items():
                cases[gid]["ruling"] = r.model_dump(exclude={"agent_id"})

            sent_back = [gid for gid, r in rulings.items() if r.decision == "retry"]
            if not sent_back or attempt == settings.max_binder_retries:
                break

            memory.evidence_tag.set({"session_id": sid, "round": attempt + 1})
            redo = await asyncio.gather(*(
                ghosts[gid].run(CASE_TASK, {
                    **context, "previous_case": cases[gid], "binder_guidance": rulings[gid].guidance,
                    "needs_more": rulings[gid].needs_more, "missing_sources": rulings[gid].missing_sources,
                })
                for gid in sent_back
            ), return_exceptions=True)
            for gid, out in zip(sent_back, redo):
                if not isinstance(out, Exception):  # failed redo keeps the previous case
                    cases[gid] = attach_research(parse_case(out), ghosts[gid])

        session.cases = cases
        verdict = await self.soul_binder.verdict(question, cases)
        session.verdict = verdict
        await self.blackboard.emit(sid, "verdict", verdict)

        await self._status(session, SessionStatus.SUMMARIZING)
        session.summary = await self.soul_binder.summarize(question, cases, verdict)
        await self.blackboard.emit(sid, "summary", session.summary)
        await self._status(session, SessionStatus.DONE)
