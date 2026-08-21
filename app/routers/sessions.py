import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import AuthUser, get_current_user
from app.db import get_db
from app.db_models import SessionRecord, Solve
from app.models import SessionCreate, SessionOut, SessionPatch

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


def sessions_with_count(db: Session, where=None) -> list[tuple[SessionRecord, int]]:
    stmt = (
        select(SessionRecord, func.count(Solve.id).label("solve_count"))
        .outerjoin(Solve, Solve.session_id == SessionRecord.id)
        .group_by(SessionRecord.id)
        .order_by(SessionRecord.id)
    )
    if where is not None:
        stmt = stmt.where(where)
    return db.execute(stmt).all()


def to_session_out(session: SessionRecord, solve_count: int) -> SessionOut:
    return SessionOut(
        id=session.id,
        client_id=session.client_id or "",
        name=session.name,
        event=session.event,
        created_at=session.created_at,
        solve_count=solve_count,
    )


@router.get("", response_model=list[SessionOut])
def list_sessions(
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> list[SessionOut]:
    return [
        to_session_out(s, count)
        for s, count in sessions_with_count(db, SessionRecord.user_id == user["id"])
    ]


@router.post("", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
def create_session(
    payload: SessionCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> SessionOut:
    cid = payload.client_id or uuid.uuid4().hex
    rec = SessionRecord(
        name=payload.name, event=payload.event, user_id=user["id"], client_id=cid
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    row = sessions_with_count(db, SessionRecord.id == rec.id)
    if not row:
        raise HTTPException(status_code=500, detail="failed to create session")
    return to_session_out(*row[0])


@router.patch("/{client_id}", response_model=SessionOut)
def rename_session(
    client_id: str,
    payload: SessionPatch,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> SessionOut:
    rec = db.execute(
        select(SessionRecord).where(
            SessionRecord.client_id == client_id,
            SessionRecord.user_id == user["id"],
        )
    ).scalar_one_or_none()
    if rec is None:
        raise HTTPException(status_code=404, detail="session not found")
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="name cannot be empty")
    rec.name = name
    db.commit()
    row = sessions_with_count(db, SessionRecord.id == rec.id)
    if not row:
        raise HTTPException(status_code=500, detail="failed to update session")
    return to_session_out(*row[0])


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(
    client_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> None:
    rec = db.execute(
        select(SessionRecord).where(
            SessionRecord.client_id == client_id,
            SessionRecord.user_id == user["id"],
        )
    ).scalar_one_or_none()
    if rec is None:
        raise HTTPException(status_code=404, detail="session not found")
    db.delete(rec)
    db.commit()
