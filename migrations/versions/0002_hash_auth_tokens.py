"""hash auth tokens at rest

Pre-0002 rows hold raw tokens; auth now stores only sha256(token), so any
pre-existing sessions are invalid. Drop them so everyone re-signs-in under the
new scheme.

Revision ID: 0002_hash_auth_tokens
Revises: 0001_initial
Create Date: 2026-01-02
"""
import sqlalchemy as sa
from alembic import op

revision = "0002_hash_auth_tokens"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DELETE FROM auth_tokens")


def downgrade() -> None:
    pass
