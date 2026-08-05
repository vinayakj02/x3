import os
import re
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from app.auth import purge_expired_tokens
from app.db import init_db
from app.routers import auth, sessions, solves, sync

STATIC_DIR = Path(__file__).parent / "static"

DEV_ONLY_RE = re.compile(r"<!-- DEV_ONLY_BEGIN -->.*?<!-- DEV_ONLY_END -->", re.DOTALL)

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
}

CONTENT_SECURITY_POLICY = (
    "default-src 'self'; "
    "script-src 'self' https://cdn.cubing.net; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "font-src 'self' https://fonts.gstatic.com; "
    "img-src 'self' data:; "
    "connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com; "
    "object-src 'none'; "
    "base-uri 'self'; "
    "form-action 'self'; "
    "frame-ancestors 'none'"
)


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


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    for name, value in SECURITY_HEADERS.items():
        response.headers.setdefault(name, value)
    if request.url.path.startswith("/api/"):
        response.headers.setdefault("Cache-Control", "no-store")
    if response.headers.get("content-type", "").startswith("text/html"):
        response.headers.setdefault("Content-Security-Policy", CONTENT_SECURITY_POLICY)
    return response


app.include_router(auth.router)
app.include_router(sessions.router)
app.include_router(solves.router)
app.include_router(sync.router)

app.add_api_route("/", lambda: HTMLResponse(render_index()), methods=["GET"], include_in_schema=False)
app.add_api_route("/index.html", lambda: HTMLResponse(render_index()), methods=["GET"], include_in_schema=False)

app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
