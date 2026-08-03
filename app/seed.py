"""Seed the database with example solve data.

Usage:
    python3 -m app.seed            # wipe and seed fresh demo data
    python3 -m app.seed --no-fresh # append more demo data
"""

import random
import sys

from app.db import get_conn

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


def insert_session(conn, name: str, times: list[int], plus_two: int, dnf: int, rng: random.Random) -> int:
    cur = conn.execute("INSERT INTO sessions (name, event) VALUES (?, ?)", (name, "333"))
    session_id = cur.lastrowid

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
        conn.execute(
            "INSERT INTO solves (session_id, scramble, time_ms, penalty) VALUES (?, ?, ?, ?)",
            (session_id, make_scramble(), t, penalty),
        )
    return session_id


def seed(fresh: bool = True) -> None:
    rng = random.Random(42)
    conn = get_conn()
    try:
        if fresh:
            conn.execute("DELETE FROM solves")
            conn.execute("DELETE FROM sessions")

        insert_session(
            conn,
            "Session 1",
            make_times(45, 14.0, 2.6, rng),
            plus_two=2,
            dnf=1,
            rng=rng,
        )
        insert_session(
            conn,
            "Session 2",
            make_times(25, 14.0, 2.6, rng),
            plus_two=1,
            dnf=0,
            rng=rng,
        )
        conn.commit()
    finally:
        conn.close()

    conn = get_conn()
    try:
        totals = conn.execute(
            "SELECT s.name, COUNT(v.id) AS n FROM sessions s LEFT JOIN solves v ON v.session_id = s.id GROUP BY s.id"
        ).fetchall()
    finally:
        conn.close()
    for row in totals:
        print(f"  {row['name']}: {row['n']} solves")


if __name__ == "__main__":
    fresh = "--no-fresh" not in sys.argv
    seed(fresh=fresh)
