from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.db import init_db
from app.routers import auth, sessions, solves, sync

STATIC_DIR = Path(__file__).parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Cubetimer", lifespan=lifespan)

app.include_router(auth.router)
app.include_router(sessions.router)
app.include_router(solves.router)
app.include_router(sync.router)

app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
