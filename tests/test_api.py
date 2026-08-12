import hashlib
import os
import tempfile
import time

os.environ["CUBETIMER_DB"] = os.path.join(tempfile.mkdtemp(), "test.db")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db import SessionLocal, init_db
from app.db_models import AuthCode, AuthToken, User
from app.main import app


def _hash(s):
    return hashlib.sha256(s.encode()).hexdigest()


@pytest.fixture(scope="module")
def client():
    init_db()
    with SessionLocal() as db:
        user = db.execute(
            select(User).where(User.google_sub == "sub1")
        ).scalar_one_or_none()
        if user is None:
            user = User(google_sub="sub1", email="a@b.c", name="Alice")
            db.add(user)
            db.flush()
        db.add(AuthToken(token=_hash("tok1"), user_id=user.id))
        db.commit()
    with TestClient(app) as c:
        yield c


def test_me_requires_auth(client):
    assert client.get("/api/auth/me").status_code == 401
    assert (
        client.get("/api/auth/me", headers={"Authorization": "Bearer bogus"}).status_code
        == 401
    )


def test_me_ok(client):
    r = client.get("/api/auth/me", headers={"Authorization": "Bearer tok1"})
    assert r.status_code == 200
    assert r.json()["email"] == "a@b.c"


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_sessions_require_auth(client):
    assert client.get("/api/sessions").status_code == 401


def test_security_headers_on_page(client):
    r = client.get("/")
    assert r.status_code == 200
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-frame-options"] == "DENY"
    assert r.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    csp = r.headers["content-security-policy"]
    assert "script-src 'self' https://cdn.cubing.net" in csp
    assert "object-src 'none'" in csp
    assert "frame-ancestors 'none'" in csp


def test_api_no_store(client):
    r = client.get("/api/auth/me")
    assert r.status_code == 401
    assert r.headers["cache-control"] == "no-store"


def test_state_cookie_secure_when_https(client, monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "test-id")
    monkeypatch.setenv("BASE_URL", "https://x3.example.com")
    r = client.get("/api/auth/login", follow_redirects=False)
    assert r.status_code == 302
    set_cookie = r.headers.get("set-cookie", "")
    assert "x3_oauth_state=" in set_cookie
    assert "Secure" in set_cookie


def test_state_cookie_not_secure_when_http(client, monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "test-id")
    monkeypatch.setenv("BASE_URL", "http://localhost:8080")
    r = client.get("/api/auth/login", follow_redirects=False)
    assert r.status_code == 302
    set_cookie = r.headers.get("set-cookie", "")
    assert "x3_oauth_state=" in set_cookie
    assert "Secure" not in set_cookie


def test_sync_upsert_is_idempotent(client):
    h = {"Authorization": "Bearer tok1"}
    payload = {
        "sessions": [
            {
                "client_id": "s1",
                "name": "Local",
                "event": "333",
                "created_at": "2026-01-01T00:00:00Z",
            }
        ],
        "solves": [
            {
                "client_id": "v1",
                "session_client_id": "s1",
                "scramble": "U R",
                "time_ms": 10000,
                "penalty": "NONE",
                "solved_at": "2026-01-01T00:00:01Z",
            }
        ],
        "deleted_sessions": [],
        "deleted_solves": [],
    }
    first = client.post("/api/sync", json=payload, headers=h)
    assert first.status_code == 200
    data = first.json()
    assert len(data["sessions"]) == 1
    assert data["sessions"][0]["client_id"] == "s1"
    assert len(data["solves"]) == 1
    assert data["solves"][0]["adjusted_ms"] == 10000

    second = client.post("/api/sync", json=payload, headers=h)
    assert second.status_code == 200
    assert len(second.json()["sessions"]) == 1
    assert len(second.json()["solves"]) == 1


def test_solve_crud_by_client_id(client):
    h = {"Authorization": "Bearer tok1"}
    created = client.post(
        "/api/solves",
        json={
            "session_client_id": "s1",
            "client_id": "v2",
            "scramble": "R U",
            "time_ms": 9000,
            "penalty": "NONE",
        },
        headers=h,
    )
    assert created.status_code == 201
    assert created.json()["client_id"] == "v2"

    listed = client.get("/api/sessions/s1/solves", headers=h)
    assert listed.status_code == 200
    assert len(listed.json()) == 2

    patched = client.patch(
        "/api/solves/v2", json={"penalty": "PLUS_TWO"}, headers=h
    )
    assert patched.status_code == 200
    assert patched.json()["adjusted_ms"] == 11000

    deleted = client.delete("/api/solves/v2", headers=h)
    assert deleted.status_code == 204
    assert len(client.get("/api/sessions/s1/solves", headers=h).json()) == 1


def test_user_scoping(client):
    with SessionLocal() as db:
        user = db.execute(
            select(User).where(User.google_sub == "sub2")
        ).scalar_one_or_none()
        if user is None:
            user = User(google_sub="sub2", email="b@b.c")
            db.add(user)
            db.flush()
        db.add(AuthToken(token=_hash("tok2"), user_id=user.id))
        db.commit()

    h2 = {"Authorization": "Bearer tok2"}
    assert client.get("/api/sessions", headers=h2).json() == []
    assert client.get("/api/sessions/s1/solves", headers=h2).status_code == 404


def _uid(sub):
    with SessionLocal() as db:
        return db.execute(
            select(User.id).where(User.google_sub == sub)
        ).scalar_one()


def _iso(offset_s):
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + offset_s))


def test_exchange_code_single_use(client):
    with SessionLocal() as db:
        db.add(AuthCode(code="c1", user_id=_uid("sub1"), expires_at=_iso(3600)))
        db.commit()

    r1 = client.post("/api/auth/exchange", json={"code": "c1"})
    assert r1.status_code == 200
    token = r1.json()["token"]
    assert token
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email"] == "a@b.c"

    r2 = client.post("/api/auth/exchange", json={"code": "c1"})
    assert r2.status_code == 401


def test_exchange_code_expired(client):
    with SessionLocal() as db:
        db.add(AuthCode(code="c2", user_id=_uid("sub1"), expires_at=_iso(-3600)))
        db.commit()

    assert client.post("/api/auth/exchange", json={"code": "c2"}).status_code == 401
    assert client.post("/api/auth/exchange", json={"code": "bogus"}).status_code == 401


def test_expired_token_rejected(client):
    with SessionLocal() as db:
        db.add(
            AuthToken(token=_hash("tok-exp"), user_id=_uid("sub1"), expires_at=_iso(-3600))
        )
        db.commit()

    assert (
        client.get("/api/auth/me", headers={"Authorization": "Bearer tok-exp"}).status_code
        == 401
    )


def test_token_stored_hashed(client):
    with SessionLocal() as db:
        db.add(AuthCode(code="c3", user_id=_uid("sub1"), expires_at=_iso(3600)))
        db.commit()
    r = client.post("/api/auth/exchange", json={"code": "c3"})
    assert r.status_code == 200
    raw = r.json()["token"]
    with SessionLocal() as db:
        found = db.execute(
            select(AuthToken).where(AuthToken.token == _hash(raw))
        ).scalar_one_or_none()
        stored = db.execute(
            select(AuthToken).where(AuthToken.token == raw)
        ).scalar_one_or_none()
    assert found is not None
    assert stored is None


def test_solve_rejects_oversized_scramble(client):
    h = {"Authorization": "Bearer tok1"}
    r = client.post(
        "/api/solves",
        json={
            "session_client_id": "nope",
            "client_id": "v3",
            "scramble": "U" * 5000,
            "time_ms": 9000,
            "penalty": "NONE",
        },
        headers=h,
    )
    assert r.status_code == 422


def test_sync_rejects_oversized_payload(client):
    h = {"Authorization": "Bearer tok1"}
    solves = [
        {
            "client_id": f"v{i}",
            "session_client_id": "s1",
            "scramble": "U",
            "time_ms": 1000,
            "penalty": "NONE",
        }
        for i in range(50001)
    ]
    r = client.post(
        "/api/sync",
        json={
            "sessions": [],
            "solves": solves,
            "deleted_sessions": [],
            "deleted_solves": [],
        },
        headers=h,
    )
    assert r.status_code == 422


def test_large_body_rejected(client):
    r = client.post(
        "/api/auth/exchange",
        content="x" * (10 * 1024 * 1024 + 1),
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code == 413


def test_base_url_required_outside_dev(client, monkeypatch):
    monkeypatch.delenv("BASE_URL", raising=False)
    monkeypatch.delenv("X3_DEV", raising=False)
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "test-id")
    r = client.get("/api/auth/login")
    assert r.status_code == 500


def test_base_url_falls_back_in_dev(client, monkeypatch):
    monkeypatch.delenv("BASE_URL", raising=False)
    monkeypatch.setenv("X3_DEV", "1")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "test-id")
    r = client.get("/api/auth/login", follow_redirects=False)
    assert r.status_code == 302


def test_solve_create_idempotent_by_client_id(client):
    h = {"Authorization": "Bearer tok1"}
    payload = {
        "session_client_id": "s1",
        "client_id": "v-dup",
        "scramble": "U L",
        "time_ms": 7777,
        "penalty": "NONE",
    }
    first = client.post("/api/solves", json=payload, headers=h)
    assert first.status_code == 201
    second = client.post("/api/solves", json=payload, headers=h)
    assert second.status_code == 201
    assert second.json()["client_id"] == "v-dup"
    listed = client.get("/api/sessions/s1/solves", headers=h).json()
    assert len([s for s in listed if s["client_id"] == "v-dup"]) == 1


def test_solve_create_conflict_across_users(client):
    with SessionLocal() as db:
        user = db.execute(
            select(User).where(User.google_sub == "sub2")
        ).scalar_one_or_none()
        if user is None:
            user = User(google_sub="sub2", email="b@b.c")
            db.add(user)
            db.flush()
        db.add(AuthToken(token=_hash("tok2b"), user_id=user.id))
        db.commit()

    h2 = {"Authorization": "Bearer tok2b"}
    sess = client.post(
        "/api/sessions",
        json={"name": "S", "event": "333", "client_id": "s-u2"},
        headers=h2,
    )
    assert sess.status_code == 201
    r = client.post(
        "/api/solves",
        json={
            "session_client_id": "s-u2",
            "client_id": "v-dup",
            "scramble": "R",
            "time_ms": 5000,
            "penalty": "NONE",
        },
        headers=h2,
    )
    assert r.status_code == 409


def test_sync_keeps_distinct_same_name_sessions(client):
    h = {"Authorization": "Bearer tok1"}
    payload = {
        "sessions": [
            {
                "client_id": "s-other",
                "name": "Local",
                "event": "333",
                "created_at": "2026-01-02T00:00:00Z",
            }
        ],
        "solves": [
            {
                "client_id": "v-other",
                "session_client_id": "s-other",
                "scramble": "U R'",
                "time_ms": 12345,
                "penalty": "NONE",
                "solved_at": "2026-01-02T00:00:01Z",
            }
        ],
        "deleted_sessions": [],
        "deleted_solves": [],
    }
    r = client.post("/api/sync", json=payload, headers=h)
    assert r.status_code == 200
    names = [s["name"] for s in r.json()["sessions"]]
    assert names.count("Local") == 2
    assert len([v for v in r.json()["solves"] if v["client_id"] == "v-other"]) == 1


def test_solve_ops_on_deleted_session_404(client):
    h = {"Authorization": "Bearer tok1"}
    created = client.post(
        "/api/sessions",
        json={"name": "Doomed", "event": "333", "client_id": "s-doom"},
        headers=h,
    )
    assert created.status_code == 201
    solve = client.post(
        "/api/solves",
        json={
            "session_client_id": "s-doom",
            "client_id": "v-doom",
            "scramble": "F",
            "time_ms": 6000,
            "penalty": "NONE",
        },
        headers=h,
    )
    assert solve.status_code == 201
    assert client.delete("/api/sessions/s-doom", headers=h).status_code == 204

    assert (
        client.post(
            "/api/solves",
            json={
                "session_client_id": "s-doom",
                "client_id": "v-doom2",
                "scramble": "F",
                "time_ms": 6000,
                "penalty": "NONE",
            },
            headers=h,
        ).status_code
        == 404
    )
    assert client.patch("/api/solves/v-doom", json={"penalty": "PLUS_TWO"}, headers=h).status_code == 404
