import hmac

from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse

from app.auth import (
    STATE_COOKIE,
    AuthUser,
    base_url,
    build_login_url,
    create_token,
    exchange_code,
    get_current_user,
    revoke_token,
    upsert_user,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/login")
async def login(request: Request) -> RedirectResponse:
    url, state = build_login_url(request)
    response = RedirectResponse(url, status_code=302)
    response.set_cookie(
        STATE_COOKIE,
        state,
        httponly=True,
        samesite="lax",
        path="/",
        max_age=600,
    )
    return response


@router.get("/callback")
async def callback(
    request: Request, code: str | None = None, state: str | None = None
) -> RedirectResponse:
    base = base_url(request)
    expected = request.cookies.get(STATE_COOKIE)
    fail = RedirectResponse(f"{base}/?auth_error=1", status_code=302)
    if not code or not state or not expected or not hmac.compare_digest(state, expected):
        return fail
    try:
        info = await exchange_code(code, request)
        user_id = upsert_user(info)
        token = create_token(user_id)
    except Exception:
        return fail
    response = RedirectResponse(f"{base}/?auth={token}", status_code=302)
    response.delete_cookie(STATE_COOKIE, path="/")
    return response


@router.get("/me")
async def me(user: AuthUser = Depends(get_current_user)) -> dict:
    return user


@router.post("/logout", status_code=204)
async def logout(
    request: Request, user: AuthUser = Depends(get_current_user)
) -> None:
    authz = request.headers.get("authorization", "")
    if authz.startswith("Bearer "):
        revoke_token(authz.removeprefix("Bearer ").strip())
