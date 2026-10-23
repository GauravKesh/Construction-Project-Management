import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class SensorSourceTestRequest(BaseModel):
    url: str = Field(min_length=1, max_length=2048)
    sensor_type: Optional[str] = None


class SensorSourceTestResponse(BaseModel):
    ok: bool
    format: Optional[str] = None  # "sse" or "json"
    value: Optional[float] = None
    unit: Optional[str] = None
    ts: Optional[str] = None
    reported_type: Optional[str] = None
    warnings: List[str] = []
    error: Optional[str] = None
    elapsed_ms: Optional[int] = None


class SensorSourceStatus(BaseModel):
    sensor_id: uuid.UUID
    source_url: Optional[str] = None
    state: str  # not_configured, connecting, connected, error
    last_reading_at: Optional[str] = None
    readings_received: int = 0
    last_error: Optional[str] = None


class SensorConnectionInfo(BaseModel):
    sensor_id: uuid.UUID
    sensor_code: str
    site_id: uuid.UUID
    sensor_type: str
    unit: str
    mqtt_host: str
    mqtt_port: int
    mqtt_topic: str
    mqtt_requires_auth: bool
    http_ingest_url: str
    http_requires_api_key: bool
    example_payload: Dict[str, Any]
    last_seen_at: Optional[datetime] = None


class SensorCreate(BaseModel):
    sensor_code: str
    name: str
    sensor_type: str  # temperature, gas, vibration, noise, humidity, dust
    unit: str
    zone_id: Optional[uuid.UUID] = None
    location_geojson: Optional[Dict[str, Any]] = None
    min_threshold: Optional[float] = None
    max_threshold: Optional[float] = None
    source_url: Optional[str] = None  # device endpoint the backend pulls from


class SensorUpdate(BaseModel):
    name: Optional[str] = None
    zone_id: Optional[uuid.UUID] = None
    location_geojson: Optional[Dict[str, Any]] = None
    min_threshold: Optional[float] = None
    max_threshold: Optional[float] = None
    source_url: Optional[str] = None  # device endpoint the backend pulls from
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
    source_url: Optional[str] = None  # device endpoint the backend pulls from
    status: str
    battery_level: Optional[float] = None
    last_seen_at: Optional[datetime] = None
    current_value: Optional[float] = None
    battery: Optional[float] = None
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
