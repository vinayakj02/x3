"""add users.picture for Google avatar

Revision ID: 0003_add_user_picture
Revises: 0002_hash_auth_tokens
Create Date: 2026-01-03
"""
import sqlalchemy as sa
from alembic import op

revision = "0003_add_user_picture"
down_revision = "0002_hash_auth_tokens"
branch_labels = None
depends_on = None


def upgrade() -> None:
    cols = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("users")}
    if "picture" not in cols:
        op.add_column("users", sa.Column("picture", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "picture")
