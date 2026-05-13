"""initial schema

Revision ID: 540e54e3f17a
Revises:
Create Date: 2026-05-13

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "540e54e3f17a"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(), nullable=False, unique=True),
    )

    op.create_table(
        "subjects",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("exam_date", sa.Date(), nullable=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
    )

    op.create_table(
        "topics",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("subject_id", sa.Integer(), sa.ForeignKey("subjects.id"), nullable=False),
        sa.Column("often_on_exam", sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    op.create_table(
        "test_results",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("topic_id", sa.Integer(), sa.ForeignKey("topics.id"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("score", sa.Float(), nullable=False),
        sa.Column("flagged_by_user", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "timestamp",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    op.create_table(
        "topic_dependencies",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("from_topic_id", sa.Integer(), sa.ForeignKey("topics.id"), nullable=False),
        sa.Column("to_topic_id", sa.Integer(), sa.ForeignKey("topics.id"), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("topic_dependencies")
    op.drop_table("test_results")
    op.drop_table("topics")
    op.drop_table("subjects")
    op.drop_table("users")
