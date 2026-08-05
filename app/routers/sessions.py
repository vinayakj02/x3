import uuid

import sqlite3

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import AuthUser, get_current_user
from app.db import get_conn
from app.models import SessionCreate, SessionOut

router = APIRouter(prefix="/api/sessions", tags=["sessions"])

SESSIONS_WITH_COUNT = """
SELECT s.id, s.client_id, s.name, s.event, s.created_at,
       COUNT(v.id) AS solve_count
FROM sessions s
LEFT JOIN solves v ON v.session_id = s.id
"""


@router.get("", response_model=list[SessionOut])
def list_sessions(
    conn: sqlite3.Connection = Depends(get_conn),
    user: AuthUser = Depends(get_current_user),
) -> list[dict]:
    rows = conn.execute(
        f"{SESSIONS_WITH_COUNT} WHERE s.user_id = ? GROUP BY s.id ORDER BY s.id",
        (user["id"],),
    ).fetchall()
    return [dict(r) for r in rows]


@router.post("", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
def create_session(
    payload: SessionCreate,
    conn: sqlite3.Connection = Depends(get_conn),
    user: AuthUser = Depends(get_current_user),
) -> dict:
    cid = payload.client_id or uuid.uuid4().hex
    cur = conn.execute(
        "INSERT INTO sessions (name, event, user_id, client_id) VALUES (?, ?, ?, ?)",
        (payload.name, payload.event, user["id"], cid),
    )
    conn.commit()
    row = conn.execute(
        f"{SESSIONS_WITH_COUNT} WHERE s.id = ? GROUP BY s.id",
        (cur.lastrowid,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=500, detail="failed to create session")
    return dict(row)


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(
    client_id: str,
    conn: sqlite3.Connection = Depends(get_conn),
    user: AuthUser = Depends(get_current_user),
) -> None:
    cur = conn.execute(
        "DELETE FROM sessions WHERE client_id = ? AND user_id = ?",
        (client_id, user["id"]),
    )
    conn.commit()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="session not found")
