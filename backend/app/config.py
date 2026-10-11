import os

from dotenv import load_dotenv

load_dotenv()


class Settings:
    gemini_api_key: str = os.getenv("GEMINI_API_KEY") or os.getenv("gemini_key", "")
    gemma_model_hub: str = os.getenv("GEMMA_MODEL_HUB", "gemma-4-31b-it")
    gemma_model_specialist: str = os.getenv("GEMMA_MODEL_SPECIALIST", "gemma-4-26b-a4b-it")

    cors_origins: list[str] = [
        origin.strip()
        for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
        if origin.strip()
    ]

    embedding_model: str = os.getenv("EMBEDDING_MODEL", "BAAI/bge-base-en-v1.5")

    # SQLite now (zero setup); the local Postgres 18 install on port 27972 is
    # ready to go whenever this needs a real multi-writer DB — see docs/db-and-connectors.md.
    db_path: str = os.getenv("DB_PATH", "data/necromancer.db")

    max_agents: int = int(os.getenv("MAX_AGENTS", "5"))
    # how many times the Judge may send a ghost back to redo its case
    max_judge_retries: int = int(os.getenv("MAX_JUDGE_RETRIES", "2"))

    host: str = os.getenv("HOST", "0.0.0.0")
    port: int = int(os.getenv("PORT", "8000"))


settings = Settings()
