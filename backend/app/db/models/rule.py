import enum
from sqlalchemy import Boolean, Column, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.db.postgres import Base
from app.db.models.base import UUIDMixin, TimestampMixin


class RuleOperator(str, enum.Enum):
    GT = ">"
    LT = "<"
    GTE = ">="
    LTE = "<="
    EQ = "=="
    NEQ = "!="
    BETWEEN = "between"
    OUTSIDE = "outside"


class AlertSeverity(str, enum.Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class Rule(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "rules"

    site_id = Column(UUID(as_uuid=True), ForeignKey("sites.id", ondelete="CASCADE"), nullable=True, index=True)
    zone_id = Column(UUID(as_uuid=True), ForeignKey("zones.id", ondelete="SET NULL"), nullable=True, index=True)
    sensor_type = Column(String(64), nullable=False, index=True)  # gas, temperature, vibration, etc.
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    operator = Column(String(32), nullable=False)  # >, <, >=, <=, ==, between, outside
    threshold_val1 = Column(Float, nullable=False)
    threshold_val2 = Column(Float, nullable=True)
    duration_seconds = Column(Integer, default=0, nullable=False)  # 0 means immediate trigger
    severity = Column(
        Enum(AlertSeverity, name="alert_severity_enum", values_callable=lambda x: [e.value for e in x]),
        default=AlertSeverity.WARNING,
        nullable=False,
    )
    is_enabled = Column(Boolean, default=True, nullable=False)
    cooldown_seconds = Column(Integer, default=300, nullable=False)  # 5 minutes dedup cooldown
    auto_create_incident = Column(Boolean, default=False, nullable=False)

    alerts = relationship("Alert", back_populates="rule")
