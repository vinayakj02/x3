import hmac

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse

from app.auth import (
    STATE_COOKIE,
    AuthUser,
    base_url,
    build_login_url,
    create_exchange_code,
    exchange_code,
    get_current_user,
    redeem_exchange_code,
    revoke_token,
    upsert_user,
)
from app.models import AuthExchange

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
        code_value = create_exchange_code(user_id)
    except Exception:
        return fail
    response = RedirectResponse(f"{base}/?code={code_value}", status_code=302)
    response.delete_cookie(STATE_COOKIE, path="/")
    return response


@router.post("/exchange")
def exchange(payload: AuthExchange) -> dict:
    token = redeem_exchange_code(payload.code)
    if token is None:
        raise HTTPException(status_code=401, detail="invalid or expired code")
    return {"token": token}


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
