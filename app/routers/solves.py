import uuid

import sqlite3

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import AuthUser, get_current_user
from app.db import get_conn
from app.models import SolveCreate, SolveOut, SolvePatch, StatsOut
from app.services.stats import adjusted_ms, compute_stats

router = APIRouter(prefix="/api", tags=["solves"])

SOLVE_COLUMNS = """
SELECT id, client_id, session_id, session_client_id, scramble, time_ms, penalty, solved_at
FROM solves
"""


def to_out(row: sqlite3.Row) -> dict:
    data = dict(row)
    data["adjusted_ms"] = adjusted_ms(data["time_ms"], data["penalty"])
    return data


def resolve_session(
    conn: sqlite3.Connection, user: AuthUser, client_id: str
) -> sqlite3.Row:
    row = conn.execute(
        "SELECT * FROM sessions WHERE client_id = ? AND user_id = ?",
        (client_id, user["id"]),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="session not found")
    return row


def resolve_solve_owner(
    conn: sqlite3.Connection, user: AuthUser, client_id: str
) -> sqlite3.Row:
    row = conn.execute(
        """
        SELECT s.* FROM solves s
        JOIN sessions ss ON ss.id = s.session_id
        WHERE s.client_id = ? AND ss.user_id = ?
        """,
        (client_id, user["id"]),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="solve not found")
    return row


@router.get("/sessions/{session_client_id}/solves", response_model=list[SolveOut])
def list_solves(
    session_client_id: str,
    conn: sqlite3.Connection = Depends(get_conn),
    user: AuthUser = Depends(get_current_user),
) -> list[dict]:
    resolve_session(conn, user, session_client_id)
    rows = conn.execute(
        f"{SOLVE_COLUMNS} WHERE session_client_id = ? ORDER BY id",
        (session_client_id,),
    ).fetchall()
    return [to_out(r) for r in rows]


@router.post("/solves", response_model=SolveOut, status_code=status.HTTP_201_CREATED)
def create_solve(
    payload: SolveCreate,
    conn: sqlite3.Connection = Depends(get_conn),
    user: AuthUser = Depends(get_current_user),
) -> dict:
    session = resolve_session(conn, user, payload.session_client_id)
    cid = payload.client_id or uuid.uuid4().hex
    cur = conn.execute(
        """
        INSERT INTO solves (session_id, session_client_id, client_id, scramble, time_ms, penalty)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            session["id"],
            payload.session_client_id,
            cid,
            payload.scramble,
            payload.time_ms,
            payload.penalty,
        ),
    )
    conn.commit()
    row = conn.execute(f"{SOLVE_COLUMNS} WHERE id = ?", (cur.lastrowid,)).fetchone()
    return to_out(row)


@router.patch("/solves/{client_id}", response_model=SolveOut)
def patch_solve(
    client_id: str,
    payload: SolvePatch,
    conn: sqlite3.Connection = Depends(get_conn),
    user: AuthUser = Depends(get_current_user),
) -> dict:
    resolve_solve_owner(conn, user, client_id)
    cur = conn.execute(
        "UPDATE solves SET penalty = ? WHERE client_id = ?", (payload.penalty, client_id)
    )
    conn.commit()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="solve not found")
    row = conn.execute(
        f"{SOLVE_COLUMNS} WHERE client_id = ? AND session_id IN "
        "(SELECT id FROM sessions WHERE user_id = ?)",
        (client_id, user["id"]),
    ).fetchone()
    return to_out(row)


@router.delete("/sessions/{session_client_id}/solves", status_code=status.HTTP_204_NO_CONTENT)
def clear_solves(
    session_client_id: str,
    conn: sqlite3.Connection = Depends(get_conn),
    user: AuthUser = Depends(get_current_user),
) -> None:
    resolve_session(conn, user, session_client_id)
    conn.execute(
        "DELETE FROM solves WHERE session_client_id = ?", (session_client_id,)
    )
    conn.commit()


@router.delete("/solves/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_solve(
    client_id: str,
    conn: sqlite3.Connection = Depends(get_conn),
    user: AuthUser = Depends(get_current_user),
) -> None:
    cur = conn.execute(
        """
        DELETE FROM solves
        WHERE client_id = ? AND session_id IN (SELECT id FROM sessions WHERE user_id = ?)
        """,
        (client_id, user["id"]),
    )
    conn.commit()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="solve not found")


@router.get("/sessions/{session_client_id}/stats", response_model=StatsOut)
def session_stats(
    session_client_id: str,
    conn: sqlite3.Connection = Depends(get_conn),
    user: AuthUser = Depends(get_current_user),
) -> dict:
    resolve_session(conn, user, session_client_id)
    rows = conn.execute(
        "SELECT time_ms, penalty FROM solves WHERE session_client_id = ? ORDER BY id",
        (session_client_id,),
    ).fetchall()
    solves = [(r["time_ms"], r["penalty"]) for r in rows]
    return compute_stats(solves)
