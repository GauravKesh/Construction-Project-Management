from sqlalchemy import Column, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR, UUID
from sqlalchemy.orm import relationship
from app.db.postgres import Base
from app.db.models.base import UUIDMixin, TimestampMixin


class AuditLog(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "audit_logs"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    action = Column(String(64), nullable=False, index=True)
    entity_type = Column(String(64), nullable=False, index=True)
    entity_id = Column(String(128), nullable=True, index=True)
    details = Column(JSONB, default=dict, nullable=False)
    ip_address = Column(String(45), nullable=True)

    # Full text search tsvector column
    tsv_details = Column(TSVECTOR, nullable=True)

    user = relationship("User")

    __table_args__ = (
        Index("ix_audit_logs_tsv_details", "tsv_details", postgresql_using="gin"),
        Index("ix_audit_logs_created_at_desc", "created_at"),
    )
