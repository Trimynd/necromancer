import os
import re

from dotenv import load_dotenv

load_dotenv()


class Settings:
    # Several keys from DIFFERENT Google accounts = several free-tier quotas (same-project keys share one).
    gemini_api_keys: list[str] = list(dict.fromkeys(
        k.strip()
        for name, value in sorted(os.environ.items())
        # GEMINI_API_KEY, GEMINI_API_KEYS (comma list), gemini_key, gemini_key_2, gemini_key_3, ...
        if re.fullmatch(r"gemini_(api_)?keys?(_\d+)?", name, re.IGNORECASE)
        for k in value.split(",")
        if k.strip()
    ))
    # Paid key (billing on). Only used when unlimited=true. Measured: Gemma stays at 30 RPM even on
    # Paid Tier 2 (the paid gain is tokens/min), so the paid key is ADDED to the free keys rather than
    # replacing them: 4 keys = ~120 RPM. Anything but true/1/yes counts as false.
    paid_api_key: str = os.getenv("gemini_unlimited", "").strip()
    use_paid: bool = os.getenv("unlimited", "false").strip().lower() in ("1", "true", "yes") and bool(paid_api_key)

    # The keys calls actually go to.
    active_api_keys: list[str] = gemini_api_keys + [paid_api_key] if use_paid else gemini_api_keys
    gemini_api_key: str = active_api_keys[0] if active_api_keys else ""
    gemma_model_hub: str = os.getenv("GEMMA_MODEL_HUB", "gemma-4-31b-it")
    gemma_model_specialist: str = os.getenv("GEMMA_MODEL_SPECIALIST", "gemma-4-26b-a4b-it")

    cors_origins: list[str] = [
        origin.strip()
        for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173,http://127.0.0.1:5173").split(",")
        if origin.strip()
    ]

    embedding_model: str = os.getenv("EMBEDDING_MODEL", "BAAI/bge-base-en-v1.5")

    # SQLite now (zero setup); the local Postgres 18 install on port 27972 is
    # ready to go whenever this needs a real multi-writer DB — see docs/db-and-connectors.md.
    db_path: str = os.getenv("DB_PATH", "data/necromancer.db")

    # Quota safety ceiling only (not a design limit): the Role Maker decides the real count.
    max_agents: int = int(os.getenv("MAX_AGENTS", "8"))

    # Per-key pacing (free tier is per key; keys from different accounts don't share it).
    key_rpm: int = int(os.getenv("KEY_RPM", "28"))  # Gemma free tier = 30 req/min/model; keep headroom
    key_tpm: int = int(os.getenv("KEY_TPM", "15000"))  # AI Studio dashboard: Gemma 4 26B free tier = 16K TPM/key

    # "fast": small panel, no send-back round, tight ghost budget. "deep": the full court.
    default_depth: str = os.getenv("DEPTH", "deep")
    # 0 = no ghost time limit: every ghost finishes its case (dropping slow ghosts hurt results).
    # Single tool calls still have their own timeout so a hung scrape can't freeze a ghost.
    ghost_timeout_deep: float = float(os.getenv("GHOST_TIMEOUT_DEEP", "0"))
    ghost_timeout_fast: float = float(os.getenv("GHOST_TIMEOUT_FAST", "0"))
    # how many times the Soul Binder may send a ghost back to redo its case
    max_binder_retries: int = int(os.getenv("MAX_BINDER_RETRIES", "2"))

    host: str = os.getenv("HOST", "0.0.0.0")
    port: int = int(os.getenv("PORT", "8000"))


settings = Settings()
