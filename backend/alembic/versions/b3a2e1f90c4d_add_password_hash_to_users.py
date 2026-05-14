"""add password_hash to users

Revision ID: b3a2e1f90c4d
Revises: 540e54e3f17a
Create Date: 2026-05-14

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b3a2e1f90c4d"
down_revision: Union[str, None] = "540e54e3f17a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("password_hash", sa.String(), nullable=False))


def downgrade() -> None:
    op.drop_column("users", "password_hash")
