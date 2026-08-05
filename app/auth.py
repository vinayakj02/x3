import hashlib
import os
import secrets
import time
from urllib.parse import quote

import httpx
from fastapi import Header, HTTPException, Request
from sqlalchemy import delete, or_, select, update

from app.db import SessionLocal
from app.db_models import AuthCode, AuthToken, User

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
GOOGLE_PEOPLE_URL = "https://people.googleapis.com/v1/people/me"
GOOGLE_SCOPE = "openid email profile"

STATE_COOKIE = "x3_oauth_state"

TOKEN_TTL_DAYS = 60
CODE_TTL_SECONDS = 120


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _iso_in(seconds: int) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + seconds))


def _hash_token(raw: str) -> str:
    """Store only a digest of the token; the raw value lives only in the browser."""
    return hashlib.sha256(raw.encode()).hexdigest()


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
    value = os.environ.get("BASE_URL")
    if value:
        return value.rstrip("/")
    if os.environ.get("X3_DEV") == "1":
        return str(request.base_url).rstrip("/")
    raise HTTPException(status_code=500, detail="BASE_URL is not configured")


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
    async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as client:
        token_res = await client.post(GOOGLE_TOKEN_URL, data=payload)
        token_res.raise_for_status()
        access_token = token_res.json()["access_token"]
        info_res = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        info_res.raise_for_status()
        info = info_res.json()
        if not info.get("picture"):
            await _attach_google_picture(client, access_token, info)
        return info


async def _attach_google_picture(client: httpx.AsyncClient, access_token: str, info: dict) -> None:
    """userinfo dropped the picture field in 2023; fall back to the People API."""
    try:
        people_res = await client.get(
            GOOGLE_PEOPLE_URL,
            params={"personFields": "photos"},
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if people_res.status_code != 200:
            return
        photos = people_res.json().get("photos") or []
        url = photos[0].get("url") if photos else None
        if url:
            info["picture"] = url
    except Exception:
        pass


def upsert_user(info: dict) -> int:
    with SessionLocal() as db:
        user = db.execute(
            select(User).where(User.google_sub == info["sub"])
        ).scalar_one_or_none()
        if user is None:
            user = User(
                google_sub=info["sub"],
                email=info.get("email"),
                name=info.get("name"),
                picture=info.get("picture"),
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        else:
            user.email = info.get("email")
            user.name = info.get("name")
            user.picture = info.get("picture")
            db.commit()
        return user.id


def create_token(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    with SessionLocal() as db:
        db.add(
            AuthToken(
                token=_hash_token(token),
                user_id=user_id,
                expires_at=_iso_in(TOKEN_TTL_DAYS * 86400),
            )
        )
        db.commit()
    return token


def create_exchange_code(user_id: int) -> str:
    code = secrets.token_urlsafe(32)
    with SessionLocal() as db:
        db.add(
            AuthCode(
                code=code,
                user_id=user_id,
                expires_at=_iso_in(CODE_TTL_SECONDS),
            )
        )
        db.commit()
    return code


def redeem_exchange_code(code: str) -> str | None:
    with SessionLocal() as db:
        now = _now_iso()
        claimed = db.execute(
            update(AuthCode)
            .where(
                AuthCode.code == code,
                AuthCode.used == 0,
                AuthCode.expires_at > now,
            )
            .values(used=1)
        )
        if claimed.rowcount == 0:
            return None
        rec = db.execute(
            select(AuthCode).where(AuthCode.code == code)
        ).scalar_one()
        token = secrets.token_urlsafe(32)
        db.add(
            AuthToken(
                token=_hash_token(token),
                user_id=rec.user_id,
                expires_at=_iso_in(TOKEN_TTL_DAYS * 86400),
            )
        )
        db.commit()
        return token


def purge_expired_tokens() -> None:
    with SessionLocal() as db:
        now = _now_iso()
        db.execute(
            delete(AuthToken).where(
                AuthToken.expires_at.is_not(None), AuthToken.expires_at <= now
            )
        )
        db.execute(delete(AuthCode).where(AuthCode.expires_at <= now))
        db.commit()


def revoke_token(token: str) -> None:
    with SessionLocal() as db:
        db.execute(delete(AuthToken).where(AuthToken.token == _hash_token(token)))
        db.commit()


def get_current_user(
    authorization: str | None = Header(default=None),
) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="not signed in")
    token = authorization.removeprefix("Bearer ").strip()
    with SessionLocal() as db:
        row = db.execute(
            select(User.id, User.email, User.name, User.picture)
            .join(AuthToken, AuthToken.user_id == User.id)
            .where(
                AuthToken.token == _hash_token(token),
                or_(
                    AuthToken.expires_at.is_(None),
                    AuthToken.expires_at > _now_iso(),
                ),
            )
        ).first()
    if row is None:
        raise HTTPException(status_code=401, detail="invalid token")
    return {
        "id": row.id,
        "email": row.email,
        "name": row.name,
        "picture": row.picture,
    }


AuthUser = dict
