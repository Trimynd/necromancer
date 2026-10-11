"""Process-local singletons shared across routes.

Single-process, in-memory state is enough for this backend right now — no
need for a DB or DI framework until there's an actual reason to scale past
one process.
"""

from app.models.session import SessionState
from app.services.blackboard import Blackboard

blackboard = Blackboard()
sessions: dict[str, SessionState] = {}
# Uploaded company documents (id -> extracted text + meta); memory only, never on disk.
documents: dict[str, dict] = {}
