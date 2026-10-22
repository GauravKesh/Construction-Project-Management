import enum
from sqlalchemy import Column, Date, Enum, Float, ForeignKey, Index, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from app.db.postgres import Base
from app.db.models.base import UUIDMixin, TimestampMixin, SoftDeleteMixin


class ProjectStatus(str, enum.Enum):
    PLANNING = "planning"
    ACTIVE = "active"
    ON_HOLD = "on_hold"
    COMPLETED = "completed"


class Project(Base, UUIDMixin, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "projects"

    name = Column(String(255), nullable=False, index=True)
    code = Column(String(64), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    status = Column(
        Enum(ProjectStatus, name="project_status_enum", values_callable=lambda x: [e.value for e in x]),
        default=ProjectStatus.ACTIVE,
        nullable=False,
    )
    budget = Column(Numeric(15, 2), nullable=True)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)

    members = relationship("ProjectMember", back_populates="project", cascade="all, delete-orphan")
    sites = relationship("Site", back_populates="project", cascade="all, delete-orphan")
    schedules = relationship("ProjectSchedule", back_populates="project", cascade="all, delete-orphan")
    boq_items = relationship("BoqItem", back_populates="project", cascade="all, delete-orphan")
    manpower = relationship("Manpower", back_populates="project", cascade="all, delete-orphan")
    materials = relationship("Material", back_populates="project", cascade="all, delete-orphan")
    drawings = relationship("Drawing", back_populates="project", cascade="all, delete-orphan")


class ProjectMember(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "project_members"

    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    project_role = Column(String(64), default="member", nullable=False)

    project = relationship("Project", back_populates="members")
    user = relationship("User", back_populates="project_memberships")

    __table_args__ = (
        Index("ix_project_member_unique", "project_id", "user_id", unique=True),
    )


class Site(Base, UUIDMixin, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "sites"

    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False, index=True)
    code = Column(String(64), nullable=False)
    address = Column(String(500), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    boundary_geojson = Column(JSONB, nullable=True)
    status = Column(String(32), default="active", nullable=False)

    project = relationship("Project", back_populates="sites")
    zones = relationship("Zone", back_populates="site", cascade="all, delete-orphan")
    sensors = relationship("Sensor", back_populates="site", cascade="all, delete-orphan")
    cameras = relationship("Camera", back_populates="site", cascade="all, delete-orphan")
    alerts = relationship("Alert", back_populates="site")
    incidents = relationship("Incident", back_populates="site")


class Zone(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "zones"

    site_id = Column(UUID(as_uuid=True), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    zone_type = Column(String(64), default="general", nullable=False)  # excavation, scaffolding, welding, hazardous
    polygon_geojson = Column(JSONB, nullable=False)  # GeoJSON Polygon / MultiPolygon
    risk_level = Column(String(32), default="medium", nullable=False)  # low, medium, high

    site = relationship("Site", back_populates="zones")
    sensors = relationship("Sensor", back_populates="zone")
    cameras = relationship("Camera", back_populates="zone")
