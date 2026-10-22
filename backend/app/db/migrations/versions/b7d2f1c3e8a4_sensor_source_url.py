"""Sensors can be pulled from a device endpoint (source_url)

When set, the device connector process connects to this URL (Server-Sent Events
stream or JSON endpoint), and feeds readings into the ingest pipeline.

Revision ID: b7d2f1c3e8a4
Revises: a1c4e7d2b9f0
Create Date: 2026-10-23
"""
from alembic import op
import sqlalchemy as sa

revision = "b7d2f1c3e8a4"
down_revision = "a1c4e7d2b9f0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("sensors", sa.Column("source_url", sa.String(length=2048), nullable=True))


def downgrade() -> None:
    op.drop_column("sensors", "source_url")
