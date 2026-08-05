from typing import Literal, Optional

from pydantic import BaseModel, Field

Penalty = Literal["NONE", "PLUS_TWO", "DNF"]


class AuthExchange(BaseModel):
    code: str = Field(min_length=1, max_length=128)


class SessionCreate(BaseModel):
    name: str = Field(default="Session", min_length=1, max_length=64)
    event: str = Field(default="333", max_length=16)
    client_id: str = Field(default="", max_length=64)


class SessionOut(BaseModel):
    id: int
    client_id: str
    name: str
    event: str
    created_at: str
    solve_count: int


class SolveCreate(BaseModel):
    session_client_id: str = Field(max_length=64)
    client_id: str = Field(default="", max_length=64)
    scramble: str = Field(min_length=1, max_length=1024)
    time_ms: int = Field(gt=0)
    penalty: Penalty = "NONE"


class SolvePatch(BaseModel):
    penalty: Penalty


class SolveOut(BaseModel):
    id: int
    client_id: str
    session_id: int
    session_client_id: str
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


class SyncSession(BaseModel):
    client_id: str = Field(max_length=64)
    name: str = Field(max_length=64)
    event: str = Field(default="333", max_length=16)
    created_at: str = Field(default="", max_length=64)


class SyncSolve(BaseModel):
    client_id: str = Field(max_length=64)
    session_client_id: str = Field(max_length=64)
    scramble: str = Field(min_length=1, max_length=1024)
    time_ms: int = Field(gt=0)
    penalty: Penalty = "NONE"
    solved_at: str = Field(default="", max_length=64)


MAX_SYNC_SESSIONS = 5000
MAX_SYNC_SOLVES = 50000


class SyncIn(BaseModel):
    sessions: list[SyncSession] = Field(default_factory=list, max_length=MAX_SYNC_SESSIONS)
    solves: list[SyncSolve] = Field(default_factory=list, max_length=MAX_SYNC_SOLVES)
    deleted_sessions: list[str] = Field(default_factory=list, max_length=MAX_SYNC_SESSIONS)
    deleted_solves: list[str] = Field(default_factory=list, max_length=MAX_SYNC_SOLVES)


class SyncOut(BaseModel):
    sessions: list[SessionOut]
    solves: list[SolveOut]
