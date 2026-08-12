import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import AuthUser, get_current_user
from app.db import get_db
from app.db_models import SessionRecord, Solve
from app.models import SolveCreate, SolveOut, SolvePatch, StatsOut
from app.services.stats import adjusted_ms, compute_stats

router = APIRouter(prefix="/api", tags=["solves"])


def to_out(solve: Solve) -> dict:
    return {
        "id": solve.id,
        "client_id": solve.client_id or "",
        "session_id": solve.session_id,
        "session_client_id": solve.session_client_id or "",
        "scramble": solve.scramble,
        "time_ms": solve.time_ms,
        "adjusted_ms": adjusted_ms(solve.time_ms, solve.penalty),
        "penalty": solve.penalty,
        "solved_at": solve.solved_at,
    }


def resolve_session(
    db: Session, user: AuthUser, client_id: str
) -> SessionRecord:
    rec = db.execute(
        select(SessionRecord).where(
            SessionRecord.client_id == client_id,
            SessionRecord.user_id == user["id"],
        )
    ).scalar_one_or_none()
    if rec is None:
        raise HTTPException(status_code=404, detail="session not found")
    return rec


def resolve_solve_owner(
    db: Session, user: AuthUser, client_id: str
) -> Solve:
    rec = db.execute(
        select(Solve)
        .join(SessionRecord, SessionRecord.id == Solve.session_id)
        .where(
            Solve.client_id == client_id,
            SessionRecord.user_id == user["id"],
        )
    ).scalar_one_or_none()
    if rec is None:
        raise HTTPException(status_code=404, detail="solve not found")
    return rec


@router.get("/sessions/{session_client_id}/solves", response_model=list[SolveOut])
def list_solves(
    session_client_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> list[dict]:
    resolve_session(db, user, session_client_id)
    rows = db.execute(
        select(Solve)
        .where(Solve.session_client_id == session_client_id)
        .order_by(Solve.id)
    ).scalars().all()
    return [to_out(r) for r in rows]


@router.post("/solves", response_model=SolveOut, status_code=status.HTTP_201_CREATED)
def create_solve(
    payload: SolveCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> dict:
    if payload.client_id:
        existing = db.execute(
            select(Solve)
            .join(SessionRecord, SessionRecord.id == Solve.session_id)
            .where(
                Solve.client_id == payload.client_id,
                SessionRecord.user_id == user["id"],
            )
        ).scalar_one_or_none()
        if existing is not None:
            return to_out(existing)
    session = resolve_session(db, user, payload.session_client_id)
    cid = payload.client_id or uuid.uuid4().hex
    rec = Solve(
        session_id=session.id,
        session_client_id=payload.session_client_id,
        client_id=cid,
        scramble=payload.scramble,
        time_ms=payload.time_ms,
        penalty=payload.penalty,
    )
    try:
        db.add(rec)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="solve already exists")
    db.refresh(rec)
    return to_out(rec)


@router.patch("/solves/{client_id}", response_model=SolveOut)
def patch_solve(
    client_id: str,
    payload: SolvePatch,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> dict:
    rec = resolve_solve_owner(db, user, client_id)
    rec.penalty = payload.penalty
    db.commit()
    db.refresh(rec)
    return to_out(rec)


@router.delete("/sessions/{session_client_id}/solves", status_code=status.HTTP_204_NO_CONTENT)
def clear_solves(
    session_client_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> None:
    resolve_session(db, user, session_client_id)
    db.execute(delete(Solve).where(Solve.session_client_id == session_client_id))
    db.commit()


@router.delete("/solves/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_solve(
    client_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> None:
    rec = resolve_solve_owner(db, user, client_id)
    db.delete(rec)
    db.commit()


@router.get("/sessions/{session_client_id}/stats", response_model=StatsOut)
def session_stats(
    session_client_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> dict:
    resolve_session(db, user, session_client_id)
    rows = db.execute(
        select(Solve.time_ms, Solve.penalty)
        .where(Solve.session_client_id == session_client_id)
        .order_by(Solve.id)
    ).all()
    solves = [(r.time_ms, r.penalty) for r in rows]
    return compute_stats(solves)
