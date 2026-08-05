from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    google_sub: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    email: Mapped[str | None] = mapped_column(String)
    name: Mapped[str | None] = mapped_column(String)
    picture: Mapped[str | None] = mapped_column(String)
    created_at: Mapped[str] = mapped_column(
        String,
        nullable=False,
        server_default=text("(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))"),
    )


class AuthToken(Base):
    __tablename__ = "auth_tokens"

    # stores sha256(token) — the raw value exists only in the client
    token: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[str] = mapped_column(
        String,
        nullable=False,
        server_default=text("(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))"),
    )
    expires_at: Mapped[str | None] = mapped_column(String)


class AuthCode(Base):
    __tablename__ = "auth_codes"

    code: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    expires_at: Mapped[str] = mapped_column(String, nullable=False)
    used: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")


class SessionRecord(Base):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    event: Mapped[str] = mapped_column(String, nullable=False, server_default="333")
    user_id: Mapped[int | None] = mapped_column(Integer)
    client_id: Mapped[str | None] = mapped_column(String)
    created_at: Mapped[str] = mapped_column(
        String,
        nullable=False,
        server_default=text("(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))"),
    )

    __table_args__ = (
        Index("idx_sessions_user", "user_id"),
        Index("idx_sessions_client", "user_id", "client_id", unique=True),
    )


class Solve(Base):
    __tablename__ = "solves"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False
    )
    scramble: Mapped[str] = mapped_column(Text, nullable=False)
    time_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    penalty: Mapped[str] = mapped_column(String, nullable=False, server_default="NONE")
    client_id: Mapped[str | None] = mapped_column(String)
    session_client_id: Mapped[str | None] = mapped_column(String)
    solved_at: Mapped[str] = mapped_column(
        String,
        nullable=False,
        server_default=text("(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))"),
    )

    __table_args__ = (
        CheckConstraint(
            "penalty IN ('NONE', 'PLUS_TWO', 'DNF')", name="ck_solves_penalty"
        ),
        Index("idx_solves_session", "session_id"),
        Index("idx_solves_client", "client_id", unique=True),
    )
