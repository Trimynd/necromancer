import asyncio

from app.agents.registry import AgentFactory
from app.agents.role_maker import RoleMakerAgent
from app.config import settings
from app.models.session import SessionState, SessionStatus
from app.services.blackboard import Blackboard
from app.services.scraper import scrape
from app.utils.logger import get_logger

logger = get_logger(__name__)


class Orchestrator:
    def __init__(self, blackboard: Blackboard):
        self.blackboard = blackboard
        self.role_maker = RoleMakerAgent()

    async def revive_startup(self, session: SessionState) -> SessionState:
        session_id = session.session_id
        try:
            session.status = SessionStatus.SCRAPING
            await self.blackboard.emit(session_id, "status", session.status)
            startup_data = await scrape(session.input_url)
            session.startup_data = startup_data
            await self.blackboard.emit(session_id, "startup_data", startup_data)

            await self._run_role_making_and_team(
                session, problem_statement=f"Revive dead fintech startup: {session.input_url}", startup_data=startup_data
            )
        except Exception as exc:
            logger.exception("revive_startup failed for session %s", session_id)
            session.status = SessionStatus.ERROR
            session.error = str(exc)
            await self.blackboard.emit(session_id, "error", str(exc))

        return session

    async def solve_problem(self, session: SessionState) -> SessionState:
        session_id = session.session_id
        try:
            await self._run_role_making_and_team(session, problem_statement=session.problem_statement)
        except Exception as exc:
            logger.exception("solve_problem failed for session %s", session_id)
            session.status = SessionStatus.ERROR
            session.error = str(exc)
            await self.blackboard.emit(session_id, "error", str(exc))

        return session

    async def _run_role_making_and_team(self, session: SessionState, problem_statement: str, startup_data: dict | None = None) -> None:
        session_id = session.session_id

        session.status = SessionStatus.ROLE_MAKING
        await self.blackboard.emit(session_id, "status", session.status)
        manifest = await self.role_maker.generate_manifest(problem_statement, startup_data)
        session.manifest = manifest
        await self.blackboard.emit(session_id, "manifest", manifest.model_dump())

        session.status = SessionStatus.RUNNING
        await self.blackboard.emit(session_id, "status", session.status)
        agents = AgentFactory.create_team(manifest, self.blackboard, session_id)
        hub = next((a for a in agents if a.id == manifest.hub_agent), agents[0])

        context = startup_data or {"problem_statement": problem_statement}
        synthesis = ""
        for round_num in range(settings.max_orchestration_rounds):
            await self.blackboard.emit(session_id, "round", round_num)

            results = await asyncio.gather(
                *(agent.run("Analyze the problem and propose an action for the team.", context) for agent in agents)
            )

            synthesis = await hub.run(
                "Synthesize the team's proposals into one decision. If the team is ready to present "
                "a final pitch to the user, include the word READY_TO_PITCH in your answer.",
                {"team_outputs": dict(zip((a.id for a in agents), results)), "round": round_num},
            )

            if "READY_TO_PITCH" in synthesis:
                break

        pitch = await hub.run(
            "Deliver the final pitch to the user: what this team recommends, why, and the key risks.",
            {"synthesis": synthesis},
        )
        session.pitch = pitch
        session.status = SessionStatus.DONE
        await self.blackboard.emit(session_id, "pitch", pitch)
        await self.blackboard.emit(session_id, "status", session.status)
