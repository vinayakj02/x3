from typing import Optional

from app.models import AverageOut

PLUS_TWO_MS = 2000


def adjusted_ms(time_ms: int, penalty: str) -> int:
    if penalty == "PLUS_TWO":
        return time_ms + PLUS_TWO_MS
    return time_ms


def to_seconds_ms(ms: int) -> int:
    return ms


def average(solves: list[tuple[int, str]], n: int) -> AverageOut:
    if len(solves) < n:
        return AverageOut()
    window = solves[-n:]
    dnf_count = sum(1 for _, p in window if p == "DNF")
    if dnf_count >= 2:
        return AverageOut(dnf=True)
    values = sorted(adjusted_ms(t, p) for t, p in window if p != "DNF")
    trimmed = values[1:-1]
    if not trimmed:
        return AverageOut(dnf=True)
    return AverageOut(ms=round(sum(trimmed) / len(trimmed)))


def best_average(solves: list[tuple[int, str]], n: int) -> AverageOut:
    if len(solves) < n:
        return AverageOut()
    best: Optional[AverageOut] = None
    for i in range(len(solves) - n + 1):
        window = solves[i : i + n]
        avg = average(window, n)
        if avg.dnf:
            continue
        if best is None or (avg.ms is not None and best.ms is not None and avg.ms < best.ms):
            best = avg
    return best or AverageOut()


def compute_stats(solves: list[tuple[int, str]]) -> dict:
    values = [adjusted_ms(t, p) for t, p in solves if p != "DNF"]
    dnf_count = sum(1 for _, p in solves if p == "DNF")
    return {
        "count": len(solves),
        "dnf_count": dnf_count,
        "best_ms": min(values) if values else None,
        "worst_ms": max(values) if values else None,
        "mean_ms": round(sum(values) / len(values), 2) if values else None,
        "current_ao5": average(solves, 5),
        "best_ao5": best_average(solves, 5),
        "current_ao12": average(solves, 12),
        "best_ao12": best_average(solves, 12),
    }
