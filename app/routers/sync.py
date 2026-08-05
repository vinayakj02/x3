import sqlite3

from fastapi import APIRouter, Depends

from app.auth import AuthUser, get_current_user
from app.db import get_conn
from app.models import SyncIn, SyncOut
from app.routers.solves import SOLVE_COLUMNS, to_out
from app.routers.sessions import SESSIONS_WITH_COUNT

router = APIRouter(prefix="/api/sync", tags=["sync"])


@router.post("", response_model=SyncOut)
def sync(
    payload: SyncIn,
    conn: sqlite3.Connection = Depends(get_conn),
    user: AuthUser = Depends(get_current_user),
) -> dict:
    uid = user["id"]

    for cid in payload.deleted_sessions:
        conn.execute(
            "DELETE FROM sessions WHERE client_id = ? AND user_id = ?", (cid, uid)
        )

    for s in payload.sessions:
        row = conn.execute(
            "SELECT id FROM sessions WHERE client_id = ? AND user_id = ?",
            (s.client_id, uid),
        ).fetchone()
        if row is None:
            conn.execute(
                "INSERT INTO sessions (name, event, user_id, client_id, created_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (s.name, s.event, uid, s.client_id, s.created_at or None),
            )
        else:
            conn.execute(
                "UPDATE sessions SET name = ?, event = ? WHERE id = ?",
                (s.name, s.event, row["id"]),
            )

    session_ids = {}
    for cid in payload.deleted_solves:
        conn.execute(
            """
            DELETE FROM solves
            WHERE client_id = ? AND session_id IN (SELECT id FROM sessions WHERE user_id = ?)
            """,
            (cid, uid),
        )

    for v in payload.solves:
        if v.session_client_id not in session_ids:
            srow = conn.execute(
                "SELECT id FROM sessions WHERE client_id = ? AND user_id = ?",
                (v.session_client_id, uid),
            ).fetchone()
            if srow is None:
                continue
            session_ids[v.session_client_id] = srow["id"]
        sid = session_ids[v.session_client_id]
        row = conn.execute(
            "SELECT id FROM solves WHERE client_id = ?", (v.client_id,)
        ).fetchone()
        if row is None:
            conn.execute(
                """
                INSERT INTO solves (session_id, session_client_id, client_id, scramble, time_ms, penalty, solved_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (sid, v.session_client_id, v.client_id, v.scramble, v.time_ms, v.penalty, v.solved_at or None),
            )
        else:
            conn.execute(
                """
                UPDATE solves SET scramble = ?, time_ms = ?, penalty = ?, solved_at = ? WHERE id = ?
                """,
                (v.scramble, v.time_ms, v.penalty, v.solved_at or None, row["id"]),
            )

    conn.commit()

    sessions = conn.execute(
        f"{SESSIONS_WITH_COUNT} WHERE s.user_id = ? GROUP BY s.id ORDER BY s.id",
        (uid,),
    ).fetchall()
    solves = conn.execute(
        f"{SOLVE_COLUMNS} WHERE session_id IN "
        "(SELECT id FROM sessions WHERE user_id = ?) ORDER BY id",
        (uid,),
    ).fetchall()
    return {
        "sessions": [dict(r) for r in sessions],
        "solves": [to_out(r) for r in solves],
    }
