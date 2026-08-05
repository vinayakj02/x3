import os
import re
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from app.auth import purge_expired_tokens
from app.db import init_db
from app.routers import auth, sessions, solves, sync

STATIC_DIR = Path(__file__).parent / "static"

DEV_ONLY_RE = re.compile(r"<!-- DEV_ONLY_BEGIN -->.*?<!-- DEV_ONLY_END -->", re.DOTALL)


def render_index() -> str:
    html = (STATIC_DIR / "index.html").read_text(encoding="utf-8")
    if os.environ.get("X3_DEV") != "1":
        html = DEV_ONLY_RE.sub("", html)
    return html


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    purge_expired_tokens()
    yield


app = FastAPI(title="Cubetimer", lifespan=lifespan)

app.include_router(auth.router)
app.include_router(sessions.router)
app.include_router(solves.router)
app.include_router(sync.router)

app.add_api_route("/", lambda: HTMLResponse(render_index()), methods=["GET"], include_in_schema=False)
app.add_api_route("/index.html", lambda: HTMLResponse(render_index()), methods=["GET"], include_in_schema=False)

app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
