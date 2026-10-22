"""Allow KPI rollup percentages to be NULL when there is no underlying data

Previously sensor_uptime_pct and ppe_compliance_pct defaulted to 100.0, so a
site with no cameras or no sensors was recorded as perfectly compliant/online.

Revision ID: a1c4e7d2b9f0
Revises: 6b28f9fe19f1
Create Date: 2026-10-22
"""
from alembic import op
import sqlalchemy as sa

revision = "a1c4e7d2b9f0"
down_revision = "6b28f9fe19f1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for column in ("sensor_uptime_pct", "ppe_compliance_pct"):
        op.alter_column("kpi_rollups", column, existing_type=sa.Float(), nullable=True, server_default=None)


def downgrade() -> None:
    for column in ("sensor_uptime_pct", "ppe_compliance_pct"):
        op.execute(f"UPDATE kpi_rollups SET {column} = 100.0 WHERE {column} IS NULL")
        op.alter_column("kpi_rollups", column, existing_type=sa.Float(), nullable=False)
