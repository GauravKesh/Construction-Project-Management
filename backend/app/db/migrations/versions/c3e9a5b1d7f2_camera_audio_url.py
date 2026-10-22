"""Cameras can carry an audio stream for sound-level and acoustic-event analysis

Revision ID: c3e9a5b1d7f2
Revises: b7d2f1c3e8a4
Create Date: 2026-10-23
"""
from alembic import op
import sqlalchemy as sa

revision = "c3e9a5b1d7f2"
down_revision = "b7d2f1c3e8a4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("cameras", sa.Column("audio_url", sa.String(length=2048), nullable=True))


def downgrade() -> None:
    op.drop_column("cameras", "audio_url")
