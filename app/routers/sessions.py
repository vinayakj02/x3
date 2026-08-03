import sqlite3

from fastapi import APIRouter, Depends, HTTPException, status

from app.db import get_conn
from app.models import SessionCreate, SessionOut

router = APIRouter(prefix="/api/sessions", tags=["sessions"])

SESSIONS_WITH_COUNT = """
SELECT s.id, s.name, s.event, s.created_at,
       COUNT(v.id) AS solve_count
FROM sessions s
LEFT JOIN solves v ON v.session_id = s.id
"""


@router.get("", response_model=list[SessionOut])
def list_sessions(conn: sqlite3.Connection = Depends(get_conn)) -> list[dict]:
    rows = conn.execute(
        f"{SESSIONS_WITH_COUNT} GROUP BY s.id ORDER BY s.id"
    ).fetchall()
    return [dict(r) for r in rows]


@router.post("", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
def create_session(
    payload: SessionCreate, conn: sqlite3.Connection = Depends(get_conn)
) -> dict:
    cur = conn.execute(
        "INSERT INTO sessions (name, event) VALUES (?, ?)",
        (payload.name, payload.event),
    )
    conn.commit()
    row = conn.execute(
        f"{SESSIONS_WITH_COUNT} WHERE s.id = ? GROUP BY s.id",
        (cur.lastrowid,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=500, detail="failed to create session")
    return dict(row)


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(
    session_id: int, conn: sqlite3.Connection = Depends(get_conn)
) -> None:
    cur = conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
    conn.commit()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="session not found")
