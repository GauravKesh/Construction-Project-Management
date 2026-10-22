import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class SensorCreate(BaseModel):
    sensor_code: str
    name: str
    sensor_type: str  # temperature, gas, vibration, noise, humidity, dust
    unit: str
    zone_id: Optional[uuid.UUID] = None
    location_geojson: Optional[Dict[str, Any]] = None
    min_threshold: Optional[float] = None
    max_threshold: Optional[float] = None


class SensorUpdate(BaseModel):
    name: Optional[str] = None
    zone_id: Optional[uuid.UUID] = None
    location_geojson: Optional[Dict[str, Any]] = None
    min_threshold: Optional[float] = None
    max_threshold: Optional[float] = None
    status: Optional[str] = None


class SensorResponse(BaseModel):
    id: uuid.UUID
    site_id: uuid.UUID
    zone_id: Optional[uuid.UUID] = None
    sensor_code: str
    name: str
    sensor_type: str
    unit: str
    location_geojson: Optional[Dict[str, Any]] = None
    min_threshold: Optional[float] = None
    max_threshold: Optional[float] = None
    status: str
    battery_level: Optional[float] = None
    last_seen_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TelemetryIngestPayload(BaseModel):
    sensor_id: str
    site_id: str
    type: str
    value: float
    unit: str
    ts: Optional[datetime] = None
    battery: Optional[float] = None
    location: Optional[Dict[str, Any]] = None
    zone_id: Optional[str] = None


class ReadingRangeItem(BaseModel):
    bucket: str
    avg: float
    min: Optional[float] = None
    max: Optional[float] = None
    count: int
    unit: Optional[str] = None


class SensorHealthResponse(BaseModel):
    sensor_id: uuid.UUID
    sensor_code: str
    status: str
    last_seen_at: Optional[datetime] = None
    battery_level: Optional[float] = None
    is_online: bool
