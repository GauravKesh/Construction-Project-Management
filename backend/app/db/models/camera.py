from sqlalchemy import Boolean, Column, DateTime, Integer, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from app.db.postgres import Base
from app.db.models.base import UUIDMixin, TimestampMixin, SoftDeleteMixin


class Camera(Base, UUIDMixin, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "cameras"

    site_id = Column(UUID(as_uuid=True), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False, index=True)
    zone_id = Column(UUID(as_uuid=True), ForeignKey("zones.id", ondelete="SET NULL"), nullable=True, index=True)
    camera_code = Column(String(64), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    stream_url = Column(String(1024), nullable=False)
    location_geojson = Column(JSONB, nullable=True)  # {"type": "Point", "coordinates": [lng, lat]}
    fps = Column(Integer, default=2, nullable=False)
    status = Column(String(32), default="inactive", nullable=False)  # active, inactive, streaming, error
    is_cv_enabled = Column(Boolean, default=True, nullable=False)
    # Optional audio stream (WAV over HTTP, or anything ffmpeg can read) for sound analysis
    audio_url = Column(String(2048), nullable=True)
    last_frame_at = Column(DateTime(timezone=True), nullable=True)

    site = relationship("Site", back_populates="cameras")
    zone = relationship("Zone", back_populates="cameras")
    alerts = relationship("Alert", back_populates="camera")
