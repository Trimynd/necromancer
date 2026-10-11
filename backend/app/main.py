from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.routes import companies, health, problem, revive, stream
from app.services.deployer import STATIC_DIR

app = FastAPI(title="Necromancer API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(revive.router)
app.include_router(problem.router)
app.include_router(stream.router)
app.include_router(companies.router)

app.mount("/zombie", StaticFiles(directory=STATIC_DIR), name="zombie")
