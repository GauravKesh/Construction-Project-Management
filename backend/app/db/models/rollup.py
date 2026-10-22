from sqlalchemy import Column, DateTime, Float, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from app.db.postgres import Base
from app.db.models.base import UUIDMixin, TimestampMixin


class KpiRollup(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "kpi_rollups"

    site_id = Column(UUID(as_uuid=True), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False, index=True)
    bucket = Column(DateTime(timezone=True), nullable=False, index=True)
    resolution = Column(String(16), nullable=False)  # 1m, 5m, 1h, 1d
    sensor_readings_count = Column(Integer, default=0, nullable=False)
    sensor_uptime_pct = Column(Float, nullable=True)  # NULL = no sensors
    ppe_compliance_pct = Column(Float, nullable=True)  # NULL = no CV frames
    active_alerts_count = Column(Integer, default=0, nullable=False)
    incidents_count = Column(Integer, default=0, nullable=False)
    metrics = Column(JSONB, default=dict, nullable=False)

    __table_args__ = (
        Index("ix_kpi_rollups_site_res_bucket", "site_id", "resolution", "bucket", unique=True),
    )


class AlertCountTs(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "alert_counts_ts"

    site_id = Column(UUID(as_uuid=True), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False, index=True)
    bucket = Column(DateTime(timezone=True), nullable=False, index=True)
    resolution = Column(String(16), default="1h", nullable=False)  # 1h, 1d
    severity = Column(String(32), nullable=False)
    count = Column(Integer, default=0, nullable=False)

    __table_args__ = (
        Index("ix_alert_counts_unique", "site_id", "resolution", "severity", "bucket", unique=True),
    )


class PPEComplianceTs(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "ppe_compliance_ts"

    site_id = Column(UUID(as_uuid=True), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False, index=True)
    camera_id = Column(UUID(as_uuid=True), ForeignKey("cameras.id", ondelete="SET NULL"), nullable=True, index=True)
    bucket = Column(DateTime(timezone=True), nullable=False, index=True)
    resolution = Column(String(16), default="1h", nullable=False)
    total_detections = Column(Integer, default=0, nullable=False)
    compliant_detections = Column(Integer, default=0, nullable=False)
    compliance_rate = Column(Float, default=100.0, nullable=False)

    __table_args__ = (
        Index("ix_ppe_ts_site_cam_res_bucket", "site_id", "camera_id", "resolution", "bucket", unique=True),
    )


class ReportMetadata(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "report_metadata"

    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=True, index=True)
    site_id = Column(UUID(as_uuid=True), ForeignKey("sites.id", ondelete="CASCADE"), nullable=True, index=True)
    title = Column(String(255), nullable=False)
    report_type = Column(String(64), nullable=False)  # daily_summary, safety_audit, incident_log, ppe_compliance
    file_format = Column(String(16), nullable=False)  # pdf, csv, xlsx
    file_key = Column(String(1024), nullable=False)
    status = Column(String(32), default="completed", nullable=False)
    generated_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
