"""Seed the database with example solve data.

Usage:
    python3 -m app.seed            # wipe and seed fresh demo data
    python3 -m app.seed --no-fresh # append more demo data
"""

import random
import sys
import uuid

from sqlalchemy import delete, func, select

from app.db import SessionLocal
from app.db_models import SessionRecord, Solve

FACES = ["U", "D", "L", "R", "F", "B"]
SUFFIXES = ["", "'", "2"]


def make_scramble(length=21) -> str:
    moves = []
    prev = ""
    while len(moves) < length:
        face = random.choice(FACES)
        if face == prev:
            continue
        moves.append(face + random.choice(SUFFIXES))
        prev = face
    return " ".join(moves)


def make_times(n: int, mean_s: float, sd_s: float, rng: random.Random) -> list[int]:
    times = []
    for _ in range(n):
        ms = rng.gauss(mean_s, sd_s) * 1000
        if rng.random() < 0.07:
            ms += rng.uniform(2500, 9000)
        times.append(max(9000, min(25000, round(ms))))
    return times


def insert_session(db, name: str, times: list[int], plus_two: int, dnf: int, rng: random.Random) -> int:
    cid = uuid.uuid4().hex
    session = SessionRecord(name=name, event="333", client_id=cid)
    db.add(session)
    db.flush()
    session_id = session.id

    indices = list(range(len(times)))
    rng.shuffle(indices)
    plus_two_idx = set(indices[:plus_two])
    dnf_idx = set(indices[plus_two : plus_two + dnf])

    for i, t in enumerate(times):
        if i in dnf_idx:
            penalty = "DNF"
        elif i in plus_two_idx:
            penalty = "PLUS_TWO"
        else:
            penalty = "NONE"
        db.add(
            Solve(
                session_id=session_id,
                session_client_id=cid,
                client_id=uuid.uuid4().hex,
                scramble=make_scramble(),
                time_ms=t,
                penalty=penalty,
            )
        )
    return session_id


def seed(fresh: bool = True) -> None:
    rng = random.Random(42)
    with SessionLocal() as db:
        if fresh:
            db.execute(delete(Solve))
            db.execute(delete(SessionRecord))

        insert_session(
            db,
            "Session 1",
            make_times(45, 14.0, 2.6, rng),
            plus_two=2,
            dnf=1,
            rng=rng,
        )
        insert_session(
            db,
            "Session 2",
            make_times(25, 14.0, 2.6, rng),
            plus_two=1,
            dnf=0,
            rng=rng,
        )
        db.commit()

    with SessionLocal() as db:
        totals = db.execute(
            select(SessionRecord.name, func.count(Solve.id).label("n"))
            .outerjoin(Solve, Solve.session_id == SessionRecord.id)
            .group_by(SessionRecord.id)
        ).all()
    for row in totals:
        print(f"  {row.name}: {row.n} solves")


if __name__ == "__main__":
    fresh = "--no-fresh" not in sys.argv
    seed(fresh=fresh)
