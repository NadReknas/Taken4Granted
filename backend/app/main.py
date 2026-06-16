from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from app.config import settings
from app.database import init_db
from app.routers import grants, users

app = FastAPI(
    title="Taken4Granted",
    description="Grant research and application tool for individuals",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(grants.router)
app.include_router(users.router)


@app.on_event("startup")
def on_startup():
    init_db()


@app.get("/api/health")
async def health():
    return {"status": "ok", "app": "Taken4Granted"}


# Serve frontend static files
# Check multiple possible locations for the built frontend
_candidates = [
    Path(__file__).resolve().parent.parent / "frontend" / "dist",  # Docker: /app/frontend/dist
    Path(__file__).resolve().parent.parent.parent / "frontend" / "dist",  # Local dev
]
for _candidate in _candidates:
    if _candidate.exists():
        app.mount("/", StaticFiles(directory=str(_candidate), html=True), name="frontend")
        break
