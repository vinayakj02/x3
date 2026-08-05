"""baseline: users, auth_tokens, auth_codes, sessions, solves

Squash of the pre-Alembic schema. Safe on both fresh databases (creates
everything) and databases created before Alembic (adds missing tables/columns
in place, preserving data).

Revision ID: 0001_initial
Revises:
Create Date: 2026-01-01
"""
import sqlalchemy as sa
from alembic import op

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _columns(table: str) -> set[str]:
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}


def _ensure_column(table: str, coldef: sa.Column) -> None:
    if coldef.name not in _columns(table):
        op.add_column(table, coldef)


def _now_default() -> sa.TextClause:
    return sa.text("(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))")


def upgrade() -> None:
    existing = _tables()

    if "users" not in existing:
        op.create_table(
            "users",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("google_sub", sa.String(), nullable=False, unique=True),
            sa.Column("email", sa.String(), nullable=True),
            sa.Column("name", sa.String(), nullable=True),
            sa.Column(
                "created_at", sa.String(), nullable=False, server_default=_now_default()
            ),
        )
    else:
        _ensure_column(
            "users", sa.Column("created_at", sa.String(), server_default=_now_default())
        )

    if "auth_tokens" not in existing:
        op.create_table(
            "auth_tokens",
            sa.Column("token", sa.String(), primary_key=True),
            sa.Column(
                "user_id",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "created_at", sa.String(), nullable=False, server_default=_now_default()
            ),
            sa.Column("expires_at", sa.String(), nullable=True),
        )
    else:
        _ensure_column("auth_tokens", sa.Column("expires_at", sa.String(), nullable=True))

    if "auth_codes" not in existing:
        op.create_table(
            "auth_codes",
            sa.Column("code", sa.String(), primary_key=True),
            sa.Column(
                "user_id",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("expires_at", sa.String(), nullable=False),
            sa.Column("used", sa.Integer(), nullable=False, server_default="0"),
        )

    if "sessions" not in existing:
        op.create_table(
            "sessions",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("event", sa.String(), nullable=False, server_default="333"),
            sa.Column("user_id", sa.Integer(), nullable=True),
            sa.Column("client_id", sa.String(), nullable=True),
            sa.Column(
                "created_at", sa.String(), nullable=False, server_default=_now_default()
            ),
        )
    else:
        _ensure_column("sessions", sa.Column("user_id", sa.Integer(), nullable=True))
        _ensure_column("sessions", sa.Column("client_id", sa.String(), nullable=True))

    if "solves" not in existing:
        op.create_table(
            "solves",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column(
                "session_id",
                sa.Integer(),
                sa.ForeignKey("sessions.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("scramble", sa.Text(), nullable=False),
            sa.Column("time_ms", sa.Integer(), nullable=False),
            sa.Column(
                "penalty",
                sa.String(),
                nullable=False,
                server_default="NONE",
            ),
            sa.Column("client_id", sa.String(), nullable=True),
            sa.Column("session_client_id", sa.String(), nullable=True),
            sa.Column(
                "solved_at", sa.String(), nullable=False, server_default=_now_default()
            ),
            sa.CheckConstraint(
                "penalty IN ('NONE', 'PLUS_TWO', 'DNF')", name="ck_solves_penalty"
            ),
        )
    else:
        _ensure_column("solves", sa.Column("client_id", sa.String(), nullable=True))
        _ensure_column(
            "solves", sa.Column("session_client_id", sa.String(), nullable=True)
        )

    op.create_index("idx_sessions_user", "sessions", ["user_id"], if_not_exists=True)
    op.create_index(
        "idx_sessions_client",
        "sessions",
        ["user_id", "client_id"],
        unique=True,
        if_not_exists=True,
    )
    op.create_index(
        "idx_solves_client", "solves", ["client_id"], unique=True, if_not_exists=True
    )
    op.create_index(
        "idx_solves_session", "solves", ["session_id"], if_not_exists=True
    )


def downgrade() -> None:
    op.drop_index("idx_solves_session", table_name="solves")
    op.drop_index("idx_solves_client", table_name="solves")
    op.drop_index("idx_sessions_client", table_name="sessions")
    op.drop_index("idx_sessions_user", table_name="sessions")
    op.drop_table("solves")
    op.drop_table("sessions")
    op.drop_table("auth_codes")
    op.drop_table("auth_tokens")
    op.drop_table("users")
