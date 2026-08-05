import os
import tempfile

os.environ["CUBETIMER_DB"] = os.path.join(tempfile.mkdtemp(), "test.db")

import pytest
from fastapi.testclient import TestClient

from app.db import get_conn, init_db
from app.main import app


@pytest.fixture(scope="module")
def client():
    init_db()
    conn = get_conn()
    conn.execute(
        "INSERT OR IGNORE INTO users (google_sub, email, name) VALUES ('sub1', 'a@b.c', 'Alice')"
    )
    uid = conn.execute(
        "SELECT id FROM users WHERE google_sub = 'sub1'"
    ).fetchone()["id"]
    conn.execute(
        "INSERT OR IGNORE INTO auth_tokens (token, user_id) VALUES ('tok1', ?)", (uid,)
    )
    conn.commit()
    conn.close()
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


def test_sessions_require_auth(client):
    assert client.get("/api/sessions").status_code == 401


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
    conn = get_conn()
    conn.execute(
        "INSERT OR IGNORE INTO users (google_sub, email) VALUES ('sub2', 'b@b.c')"
    )
    uid2 = conn.execute(
        "SELECT id FROM users WHERE google_sub = 'sub2'"
    ).fetchone()["id"]
    conn.execute(
        "INSERT OR IGNORE INTO auth_tokens (token, user_id) VALUES ('tok2', ?)", (uid2,)
    )
    conn.commit()
    conn.close()

    h2 = {"Authorization": "Bearer tok2"}
    assert client.get("/api/sessions", headers=h2).json() == []
    assert client.get("/api/sessions/s1/solves", headers=h2).status_code == 404
