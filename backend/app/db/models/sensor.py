from sqlalchemy import Column, DateTime, Float, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from app.db.postgres import Base
from app.db.models.base import UUIDMixin, TimestampMixin, SoftDeleteMixin


class Sensor(Base, UUIDMixin, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "sensors"

    site_id = Column(UUID(as_uuid=True), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False, index=True)
    zone_id = Column(UUID(as_uuid=True), ForeignKey("zones.id", ondelete="SET NULL"), nullable=True, index=True)
    sensor_code = Column(String(64), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    sensor_type = Column(String(64), nullable=False, index=True)  # temperature, gas, vibration, noise, etc.
    unit = Column(String(32), nullable=False)
    location_geojson = Column(JSONB, nullable=True)  # {"type": "Point", "coordinates": [lng, lat]}
    min_threshold = Column(Float, nullable=True)
    max_threshold = Column(Float, nullable=True)
    status = Column(String(32), default="active", nullable=False)  # active, inactive, maintenance, offline
    battery_level = Column(Float, nullable=True)
    last_seen_at = Column(DateTime(timezone=True), nullable=True)

    site = relationship("Site", back_populates="sensors")
    zone = relationship("Zone", back_populates="sensors")
    alerts = relationship("Alert", back_populates="sensor")

    __table_args__ = (
        Index("ix_sensors_site_type", "site_id", "sensor_type"),
    )
