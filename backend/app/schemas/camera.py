import uuid
from datetime import datetime
from typing import Any, Dict, Optional
from pydantic import BaseModel, Field


class CameraCreate(BaseModel):
    camera_code: str
    name: str
    stream_url: str
    zone_id: Optional[uuid.UUID] = None
    location_geojson: Optional[Dict[str, Any]] = None
    fps: int = Field(default=2, ge=1, le=30)
    is_cv_enabled: bool = True


class CameraUpdate(BaseModel):
    name: Optional[str] = None
    stream_url: Optional[str] = None
    zone_id: Optional[uuid.UUID] = None
    location_geojson: Optional[Dict[str, Any]] = None
    fps: Optional[int] = None
    status: Optional[str] = None
    is_cv_enabled: Optional[bool] = None


class CameraResponse(BaseModel):
    id: uuid.UUID
    site_id: uuid.UUID
    zone_id: Optional[uuid.UUID] = None
    camera_code: str
    name: str
    stream_url: str
    location_geojson: Optional[Dict[str, Any]] = None
    fps: int
    status: str
    is_cv_enabled: bool
    last_frame_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CameraStatusResponse(BaseModel):
    camera_id: uuid.UUID
    camera_code: str
    status: str
    fps: int
    is_cv_enabled: bool
    last_frame_at: Optional[datetime] = None
    stream_active: bool


class CVConfigUpdate(BaseModel):
    confidence_threshold: Optional[float] = Field(default=None, ge=0.1, le=1.0)
    inference_fps: Optional[int] = Field(default=None, ge=1, le=30)
    mode: Optional[str] = None


class CVConfigResponse(BaseModel):
    cv_mode: str
    model_path: str
    confidence_threshold: float
    inference_fps: int
    is_ml_available: bool
