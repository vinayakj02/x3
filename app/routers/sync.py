from fastapi import APIRouter, Depends
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.auth import AuthUser, get_current_user
from app.db import get_db
from app.db_models import SessionRecord, Solve
from app.models import SyncIn, SyncOut
from app.routers.sessions import sessions_with_count, to_session_out
from app.routers.solves import to_out

router = APIRouter(prefix="/api/sync", tags=["sync"])


@router.post("", response_model=SyncOut)
def sync(
    payload: SyncIn,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> dict:
    uid = user["id"]

    def user_session_ids():
        return select(SessionRecord.id).where(SessionRecord.user_id == uid)

    for cid in payload.deleted_sessions:
        db.execute(
            delete(SessionRecord).where(
                SessionRecord.client_id == cid,
                SessionRecord.user_id == uid,
            )
        )

    for s in payload.sessions:
        rec = db.execute(
            select(SessionRecord).where(
                SessionRecord.client_id == s.client_id,
                SessionRecord.user_id == uid,
            )
        ).scalar_one_or_none()
        if rec is None:
            db.add(
                SessionRecord(
                    name=s.name,
                    event=s.event,
                    user_id=uid,
                    client_id=s.client_id,
                    created_at=s.created_at or None,
                )
            )
        else:
            rec.name = s.name
            rec.event = s.event

    for cid in payload.deleted_solves:
        db.execute(
            delete(Solve).where(
                Solve.client_id == cid,
                Solve.session_id.in_(user_session_ids()),
            )
        )

    session_ids = {}
    for v in payload.solves:
        if v.session_client_id not in session_ids:
            srec = db.execute(
                select(SessionRecord).where(
                    SessionRecord.client_id == v.session_client_id,
                    SessionRecord.user_id == uid,
                )
            ).scalar_one_or_none()
            if srec is None:
                continue
            session_ids[v.session_client_id] = srec.id
        sid = session_ids[v.session_client_id]

        rec = db.execute(
            select(Solve).where(
                Solve.client_id == v.client_id,
                Solve.session_id.in_(user_session_ids()),
            )
        ).scalar_one_or_none()
        if rec is not None:
            rec.scramble = v.scramble
            rec.time_ms = v.time_ms
            rec.penalty = v.penalty
            rec.solved_at = v.solved_at or None
            continue
        foreign = db.execute(
            select(Solve.id).where(Solve.client_id == v.client_id)
        ).scalar_one_or_none()
        if foreign is not None:
            continue
        db.add(
            Solve(
                session_id=sid,
                session_client_id=v.session_client_id,
                client_id=v.client_id,
                scramble=v.scramble,
                time_ms=v.time_ms,
                penalty=v.penalty,
                solved_at=v.solved_at or None,
            )
        )

    db.commit()

    sessions = sessions_with_count(db, SessionRecord.user_id == uid)
    solves = (
        db.execute(
            select(Solve)
            .where(Solve.session_id.in_(user_session_ids()))
            .order_by(Solve.id)
        )
        .scalars()
        .all()
    )
    return {
        "sessions": [to_session_out(s, count) for s, count in sessions],
        "solves": [to_out(s) for s in solves],
    }
