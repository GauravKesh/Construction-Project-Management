import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class CameraCreate(BaseModel):
    camera_code: str
    name: str
    stream_url: str
    zone_id: Optional[uuid.UUID] = None
    location_geojson: Optional[Dict[str, Any]] = None
    fps: int = Field(default=2, ge=1, le=30)
    is_cv_enabled: bool = True
    audio_url: Optional[str] = None  # sound-level / acoustic-event analysis


class CameraUpdate(BaseModel):
    name: Optional[str] = None
    stream_url: Optional[str] = None
    zone_id: Optional[uuid.UUID] = None
    location_geojson: Optional[Dict[str, Any]] = None
    fps: Optional[int] = None
    audio_url: Optional[str] = None
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
    audio_url: Optional[str] = None
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
    last_error: Optional[str] = None


class CameraRecording(BaseModel):
    name: str
    started_at: datetime
    ended_at: datetime
    size_bytes: int


class CameraAudioTestResponse(BaseModel):
    ok: bool
    level_db: Optional[float] = None
    peak_db: Optional[float] = None
    sample_rate: Optional[int] = None
    error: Optional[str] = None


class CameraAnalyticsSample(BaseModel):
    ts: datetime
    motion_ratio: Optional[float] = None
    brightness: Optional[float] = None
    sharpness: Optional[float] = None
    persons: Optional[int] = None
    security_hours: Optional[bool] = None
    tamper: Optional[bool] = None


class CameraAnalyticsResponse(BaseModel):
    camera_id: uuid.UUID
    samples: List[CameraAnalyticsSample]
    latest_audio: Optional[Dict[str, Any]] = None


class CameraConnectionTestRequest(BaseModel):
    stream_url: str = Field(min_length=1, max_length=2048)


class CameraConnectionTestResponse(BaseModel):
    ok: bool
    width: Optional[int] = None
    height: Optional[int] = None
    fps: Optional[float] = None
    error: Optional[str] = None
    elapsed_ms: Optional[int] = None


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
