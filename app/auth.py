import os
import secrets
from urllib.parse import quote

import httpx
from fastapi import Depends, Header, HTTPException, Request

from app.db import get_conn

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
GOOGLE_SCOPE = "openid email profile"

STATE_COOKIE = "x3_oauth_state"


def google_client_id() -> str:
    value = os.environ.get("GOOGLE_CLIENT_ID", "")
    if not value:
        raise HTTPException(status_code=500, detail="Google OAuth is not configured")
    return value


def google_client_secret() -> str:
    value = os.environ.get("GOOGLE_CLIENT_SECRET", "")
    if not value:
        raise HTTPException(status_code=500, detail="Google OAuth is not configured")
    return value


def base_url(request: Request) -> str:
    return os.environ.get("BASE_URL") or str(request.base_url).rstrip("/")


def redirect_uri(request: Request) -> str:
    return f"{base_url(request)}/api/auth/callback"


def build_login_url(request: Request) -> tuple[str, str]:
    state = secrets.token_urlsafe(16)
    params = {
        "client_id": google_client_id(),
        "redirect_uri": redirect_uri(request),
        "response_type": "code",
        "scope": GOOGLE_SCOPE,
        "state": state,
        "prompt": "select_account",
    }
    query = "&".join(f"{k}={quote(str(v))}" for k, v in params.items())
    return f"{GOOGLE_AUTH_URL}?{query}", state


async def exchange_code(code: str, request: Request) -> dict:
    payload = {
        "code": code,
        "client_id": google_client_id(),
        "client_secret": google_client_secret(),
        "redirect_uri": redirect_uri(request),
        "grant_type": "authorization_code",
    }
    async with httpx.AsyncClient() as client:
        token_res = await client.post(GOOGLE_TOKEN_URL, data=payload)
        token_res.raise_for_status()
        access_token = token_res.json()["access_token"]
        info_res = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        info_res.raise_for_status()
        return info_res.json()


def upsert_user(info: dict) -> int:
    conn = get_conn()
    try:
        row = conn.execute(
            "SELECT id FROM users WHERE google_sub = ?", (info["sub"],)
        ).fetchone()
        if row is None:
            cur = conn.execute(
                "INSERT INTO users (google_sub, email, name) VALUES (?, ?, ?)",
                (info["sub"], info.get("email"), info.get("name")),
            )
            user_id = cur.lastrowid
        else:
            user_id = row["id"]
            conn.execute(
                "UPDATE users SET email = ?, name = ? WHERE id = ?",
                (info.get("email"), info.get("name"), user_id),
            )
        conn.commit()
        return user_id
    finally:
        conn.close()


def create_token(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    conn = get_conn()
    try:
        conn.execute(
            "INSERT INTO auth_tokens (token, user_id) VALUES (?, ?)", (token, user_id)
        )
        conn.commit()
        return token
    finally:
        conn.close()


def revoke_token(token: str) -> None:
    conn = get_conn()
    try:
        conn.execute("DELETE FROM auth_tokens WHERE token = ?", (token,))
        conn.commit()
    finally:
        conn.close()


def get_current_user(
    authorization: str | None = Header(default=None),
) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="not signed in")
    token = authorization.removeprefix("Bearer ").strip()
    conn = get_conn()
    try:
        row = conn.execute(
            """
            SELECT u.id, u.email, u.name
            FROM auth_tokens t JOIN users u ON u.id = t.user_id
            WHERE t.token = ?
            """,
            (token,),
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        raise HTTPException(status_code=401, detail="invalid token")
    return dict(row)


AuthUser = dict
