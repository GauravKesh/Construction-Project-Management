from sqlalchemy import Column, DateTime, Index, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from app.db.postgres import Base
from app.db.models.base import UUIDMixin, TimestampMixin


class OutboxEvent(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "outbox_events"

    event_type = Column(String(64), nullable=False, index=True)
    aggregate_type = Column(String(64), nullable=False)
    aggregate_id = Column(String(128), nullable=False)
    payload = Column(JSONB, nullable=False)
    status = Column(String(32), default="pending", nullable=False, index=True)  # pending, published, failed
    retry_count = Column(Integer, default=0, nullable=False)
    published_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_outbox_status_created", "status", "created_at"),
    )
