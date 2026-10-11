import os

from dotenv import load_dotenv

load_dotenv()


class Settings:
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "")
    gemma_model_hub: str = os.getenv("GEMMA_MODEL_HUB", "gemma-3-27b-it")
    gemma_model_specialist: str = os.getenv("GEMMA_MODEL_SPECIALIST", "gemma-3-12b-it")

    cors_origins: list[str] = [
        origin.strip()
        for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
        if origin.strip()
    ]

    max_agents: int = int(os.getenv("MAX_AGENTS", "7"))
    max_orchestration_rounds: int = int(os.getenv("MAX_ORCHESTRATION_ROUNDS", "3"))

    host: str = os.getenv("HOST", "0.0.0.0")
    port: int = int(os.getenv("PORT", "8000"))


settings = Settings()
