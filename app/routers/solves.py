import sqlite3

from fastapi import APIRouter, Depends, HTTPException, status

from app.db import get_conn
from app.models import SolveCreate, SolveOut, SolvePatch, StatsOut
from app.services.stats import adjusted_ms, compute_stats

router = APIRouter(prefix="/api", tags=["solves"])

SOLVE_COLUMNS = """
SELECT id, session_id, scramble, time_ms, penalty, solved_at
FROM solves
"""


def to_out(row: sqlite3.Row) -> dict:
    data = dict(row)
    data["adjusted_ms"] = adjusted_ms(data["time_ms"], data["penalty"])
    return data


def ensure_session(conn: sqlite3.Connection, session_id: int) -> None:
    row = conn.execute("SELECT 1 FROM sessions WHERE id = ?", (session_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="session not found")


@router.get("/sessions/{session_id}/solves", response_model=list[SolveOut])
def list_solves(
    session_id: int, conn: sqlite3.Connection = Depends(get_conn)
) -> list[dict]:
    ensure_session(conn, session_id)
    rows = conn.execute(
        f"{SOLVE_COLUMNS} WHERE session_id = ? ORDER BY id", (session_id,)
    ).fetchall()
    return [to_out(r) for r in rows]


@router.post("/solves", response_model=SolveOut, status_code=status.HTTP_201_CREATED)
def create_solve(
    payload: SolveCreate, conn: sqlite3.Connection = Depends(get_conn)
) -> dict:
    ensure_session(conn, payload.session_id)
    cur = conn.execute(
        "INSERT INTO solves (session_id, scramble, time_ms, penalty) VALUES (?, ?, ?, ?)",
        (payload.session_id, payload.scramble, payload.time_ms, payload.penalty),
    )
    conn.commit()
    row = conn.execute(f"{SOLVE_COLUMNS} WHERE id = ?", (cur.lastrowid,)).fetchone()
    return to_out(row)


@router.patch("/solves/{solve_id}", response_model=SolveOut)
def patch_solve(
    solve_id: int, payload: SolvePatch, conn: sqlite3.Connection = Depends(get_conn)
) -> dict:
    cur = conn.execute(
        "UPDATE solves SET penalty = ? WHERE id = ?", (payload.penalty, solve_id)
    )
    conn.commit()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="solve not found")
    row = conn.execute(f"{SOLVE_COLUMNS} WHERE id = ?", (solve_id,)).fetchone()
    return to_out(row)


@router.delete("/sessions/{session_id}/solves", status_code=status.HTTP_204_NO_CONTENT)
def clear_solves(
    session_id: int, conn: sqlite3.Connection = Depends(get_conn)
) -> None:
    ensure_session(conn, session_id)
    conn.execute("DELETE FROM solves WHERE session_id = ?", (session_id,))
    conn.commit()


@router.delete("/solves/{solve_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_solve(solve_id: int, conn: sqlite3.Connection = Depends(get_conn)) -> None:
    cur = conn.execute("DELETE FROM solves WHERE id = ?", (solve_id,))
    conn.commit()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="solve not found")


@router.get("/sessions/{session_id}/stats", response_model=StatsOut)
def session_stats(
    session_id: int, conn: sqlite3.Connection = Depends(get_conn)
) -> dict:
    ensure_session(conn, session_id)
    rows = conn.execute(
        "SELECT time_ms, penalty FROM solves WHERE session_id = ? ORDER BY id",
        (session_id,),
    ).fetchall()
    solves = [(r["time_ms"], r["penalty"]) for r in rows]
    return compute_stats(solves)
