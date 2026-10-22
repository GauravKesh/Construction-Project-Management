import enum
from sqlalchemy import Column, DateTime, Enum, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import TSVECTOR, UUID
from sqlalchemy.orm import relationship
from app.db.postgres import Base
from app.db.models.base import UUIDMixin, TimestampMixin
from app.db.models.rule import AlertSeverity


class IncidentStatus(str, enum.Enum):
    OPEN = "open"
    ACKNOWLEDGED = "acknowledged"
    INVESTIGATING = "investigating"
    RESOLVED = "resolved"
    CLOSED = "closed"


class Incident(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "incidents"

    incident_number = Column(String(64), unique=True, nullable=False, index=True)
    site_id = Column(UUID(as_uuid=True), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False, index=True)
    zone_id = Column(UUID(as_uuid=True), ForeignKey("zones.id", ondelete="SET NULL"), nullable=True, index=True)
    alert_id = Column(UUID(as_uuid=True), ForeignKey("alerts.id", ondelete="SET NULL"), nullable=True, index=True)

    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    severity = Column(
        Enum(AlertSeverity, name="alert_severity_enum", values_callable=lambda x: [e.value for e in x]),
        default=AlertSeverity.WARNING,
        nullable=False,
    )
    status = Column(
        Enum(IncidentStatus, name="incident_status_enum", values_callable=lambda x: [e.value for e in x]),
        default=IncidentStatus.OPEN,
        nullable=False,
        index=True,
    )

    assigned_to = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    reported_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    resolved_at = Column(DateTime(timezone=True), nullable=True)
    closed_at = Column(DateTime(timezone=True), nullable=True)
    root_cause = Column(Text, nullable=True)
    resolution_notes = Column(Text, nullable=True)

    # Full text search tsvector column
    tsv_search = Column(TSVECTOR, nullable=True)

    site = relationship("Site", back_populates="incidents")
    zone = relationship("Zone")
    alert = relationship("Alert", back_populates="incidents")
    assigned_to_user = relationship("User", foreign_keys=[assigned_to], back_populates="assigned_incidents")
    reported_by_user = relationship("User", foreign_keys=[reported_by])
    updates = relationship("IncidentUpdate", back_populates="incident", cascade="all, delete-orphan", order_by="IncidentUpdate.created_at.desc()")
    attachments = relationship("IncidentAttachment", back_populates="incident", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_incidents_site_status_created", "site_id", "status", "created_at"),
        Index("ix_incidents_tsv_search", "tsv_search", postgresql_using="gin"),
    )


class IncidentUpdate(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "incident_updates"

    incident_id = Column(UUID(as_uuid=True), ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    status_from = Column(String(32), nullable=True)
    status_to = Column(String(32), nullable=True)
    comment = Column(Text, nullable=False)

    incident = relationship("Incident", back_populates="updates")
    user = relationship("User")


class IncidentAttachment(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "incident_attachments"

    incident_id = Column(UUID(as_uuid=True), ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False, index=True)
    file_name = Column(String(255), nullable=False)
    file_key = Column(String(1024), nullable=False)
    file_size = Column(Integer, nullable=False)
    content_type = Column(String(128), nullable=False)

    incident = relationship("Incident", back_populates="attachments")
