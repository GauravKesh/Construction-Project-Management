import enum
from sqlalchemy import Column, DateTime, Enum, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR, UUID
from sqlalchemy.orm import relationship
from app.db.postgres import Base
from app.db.models.base import UUIDMixin, TimestampMixin
from app.db.models.rule import AlertSeverity


class AlertStatus(str, enum.Enum):
    ACTIVE = "active"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"


class Alert(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "alerts"

    site_id = Column(UUID(as_uuid=True), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False, index=True)
    zone_id = Column(UUID(as_uuid=True), ForeignKey("zones.id", ondelete="SET NULL"), nullable=True, index=True)
    rule_id = Column(UUID(as_uuid=True), ForeignKey("rules.id", ondelete="SET NULL"), nullable=True, index=True)
    sensor_id = Column(UUID(as_uuid=True), ForeignKey("sensors.id", ondelete="SET NULL"), nullable=True, index=True)
    camera_id = Column(UUID(as_uuid=True), ForeignKey("cameras.id", ondelete="SET NULL"), nullable=True, index=True)

    alert_type = Column(String(64), nullable=False)  # sensor_threshold, ppe_violation, anomaly, correlation
    severity = Column(
        Enum(AlertSeverity, name="alert_severity_enum", values_callable=lambda x: [e.value for e in x]),
        default=AlertSeverity.WARNING,
        nullable=False,
    )
    status = Column(
        Enum(AlertStatus, name="alert_status_enum", values_callable=lambda x: [e.value for e in x]),
        default=AlertStatus.ACTIVE,
        nullable=False,
        index=True,
    )
    message = Column(Text, nullable=False)
    reading_value = Column(Float, nullable=True)
    threshold_value = Column(Float, nullable=True)
    details = Column(JSONB, default=dict, nullable=False)

    acknowledged_at = Column(DateTime(timezone=True), nullable=True)
    acknowledged_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    resolved_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    escalation_level = Column(Integer, default=0, nullable=False)
    last_escalated_at = Column(DateTime(timezone=True), nullable=True)

    # Full text search tsvector column
    tsv_message = Column(TSVECTOR, nullable=True)

    site = relationship("Site", back_populates="alerts")
    rule = relationship("Rule", back_populates="alerts")
    sensor = relationship("Sensor", back_populates="alerts")
    camera = relationship("Camera", back_populates="alerts")
    incidents = relationship("Incident", back_populates="alert")

    __table_args__ = (
        Index("ix_alerts_site_status_created", "site_id", "status", "created_at"),
        Index("ix_alerts_tsv_message", "tsv_message", postgresql_using="gin"),
    )
