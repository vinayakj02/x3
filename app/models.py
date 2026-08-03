from typing import Literal, Optional

from pydantic import BaseModel, Field

Penalty = Literal["NONE", "PLUS_TWO", "DNF"]


class SessionCreate(BaseModel):
    name: str = Field(default="Session", min_length=1, max_length=64)
    event: str = Field(default="333", max_length=16)


class SessionOut(BaseModel):
    id: int
    name: str
    event: str
    created_at: str
    solve_count: int


class SolveCreate(BaseModel):
    session_id: int
    scramble: str
    time_ms: int = Field(gt=0)
    penalty: Penalty = "NONE"


class SolvePatch(BaseModel):
    penalty: Penalty


class SolveOut(BaseModel):
    id: int
    session_id: int
    scramble: str
    time_ms: int
    adjusted_ms: int
    penalty: Penalty
    solved_at: str


class AverageOut(BaseModel):
    ms: Optional[int] = None
    dnf: bool = False


class StatsOut(BaseModel):
    count: int
    dnf_count: int
    best_ms: Optional[int]
    worst_ms: Optional[int]
    mean_ms: Optional[float]
    current_ao5: AverageOut
    best_ao5: AverageOut
    current_ao12: AverageOut
    best_ao12: AverageOut
