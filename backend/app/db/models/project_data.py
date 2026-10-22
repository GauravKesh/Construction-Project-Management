from sqlalchemy import Column, Date, Float, ForeignKey, Index, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from app.db.postgres import Base
from app.db.models.base import UUIDMixin, TimestampMixin


class ProjectSchedule(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "schedules"

    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    task_name = Column(String(255), nullable=False)
    wbs_code = Column(String(64), nullable=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    progress_percent = Column(Float, default=0.0, nullable=False)
    status = Column(String(32), default="pending", nullable=False)  # pending, in_progress, completed, delayed
    dependencies = Column(JSONB, default=list, nullable=False)

    project = relationship("Project", back_populates="schedules")


class BoqItem(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "boq_items"

    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    item_code = Column(String(64), nullable=False)
    description = Column(Text, nullable=False)
    unit = Column(String(32), nullable=False)
    planned_quantity = Column(Float, nullable=False)
    unit_rate = Column(Numeric(15, 2), nullable=False)
    total_planned_cost = Column(Numeric(15, 2), nullable=False)
    consumed_quantity = Column(Float, default=0.0, nullable=False)

    project = relationship("Project", back_populates="boq_items")


class Manpower(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "manpower"

    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    trade = Column(String(64), nullable=False)  # mason, electrician, steel_fixer, etc.
    planned_headcount = Column(Integer, nullable=False)
    actual_headcount = Column(Integer, nullable=False)
    shift = Column(String(32), default="day", nullable=False)

    project = relationship("Project", back_populates="manpower")


class Material(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "materials"

    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(128), nullable=False)  # cement, rebar, sand, etc.
    unit = Column(String(32), nullable=False)
    total_ordered = Column(Float, default=0.0, nullable=False)
    total_delivered = Column(Float, default=0.0, nullable=False)
    total_used = Column(Float, default=0.0, nullable=False)
    stock_on_hand = Column(Float, default=0.0, nullable=False)

    project = relationship("Project", back_populates="materials")


class Drawing(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "drawings"

    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    drawing_number = Column(String(64), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    discipline = Column(String(64), default="architectural", nullable=False)
    version = Column(String(32), default="Rev-0", nullable=False)
    file_name = Column(String(255), nullable=False)
    file_key = Column(String(1024), nullable=False)
    file_size = Column(Integer, nullable=False)

    project = relationship("Project", back_populates="drawings")
