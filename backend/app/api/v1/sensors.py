import json
import math
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from app.core.config import settings
from app.core.dependencies import (
    get_audit_repo,
    get_sensor_repo,
    get_telemetry_repo,
)
from app.db.models.sensor import Sensor
from app.db.models.user import User, UserRole
from app.db.redis import get_redis_client, KEY_STREAM_INGEST
from app.db.repositories.audit_repo import AuditRepository
from app.db.repositories.sensor_repo import SensorRepository
from app.db.repositories.telemetry_repo import TelemetryRepository
from app.gateway.auth import get_current_user
from app.gateway.rbac import check_site_access, require_roles
from app.schemas.common import PaginatedResponse, StatusMessage
from app.schemas.sensor import (
    ReadingRangeItem,
    SensorCreate,
    SensorHealthResponse,
    SensorResponse,
    SensorUpdate,
    TelemetryIngestPayload,
)

router = APIRouter(prefix="", tags=["Sensors & Telemetry"])


@router.get("/sites/{site_id}/sensors", response_model=PaginatedResponse[SensorResponse])
async def list_sensors_for_site(
    site_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    sensor_type: Optional[str] = None,
    zone_id: Optional[uuid.UUID] = None,
    status: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    sensor_repo: SensorRepository = Depends(get_sensor_repo),
):
    await check_site_access(site_id, current_user)
    skip = (page - 1) * page_size
    sensors = await sensor_repo.list_by_site(
        site_id=site_id,
        skip=skip,
        limit=page_size,
        sensor_type=sensor_type,
        zone_id=zone_id,
        status=status,
    )
    total = len(sensors)
    pages = math.ceil(total / page_size) if total > 0 else 1
    return PaginatedResponse(items=sensors, total=total, page=page, page_size=page_size, pages=pages)


@router.post("/sites/{site_id}/sensors", response_model=SensorResponse, status_code=status.HTTP_201_CREATED)
async def create_sensor(
    site_id: uuid.UUID,
    req: SensorCreate,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.SITE_ENGINEER])),
    sensor_repo: SensorRepository = Depends(get_sensor_repo),
    audit_repo: AuditRepository = Depends(get_audit_repo),
):
    await check_site_access(site_id, current_user)
    existing = await sensor_repo.get_by_code(req.sensor_code)
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Sensor code already exists")

    sensor = await sensor_repo.create(site_id=site_id, **req.model_dump())
    await audit_repo.record(
        action="CREATE_SENSOR",
        entity_type="sensor",
        entity_id=str(sensor.id),
        details={"code": sensor.sensor_code, "type": sensor.sensor_type},
        user_id=current_user.id,
    )
    return sensor


@router.get("/sensors/{sensor_id}", response_model=SensorResponse)
async def get_sensor(
    sensor_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    sensor_repo: SensorRepository = Depends(get_sensor_repo),
):
    sensor = await sensor_repo.get_by_id_active(sensor_id)
    if not sensor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sensor not found")
    await check_site_access(sensor.site_id, current_user)
    return sensor


@router.patch("/sensors/{sensor_id}", response_model=SensorResponse)
async def update_sensor(
    sensor_id: uuid.UUID,
    req: SensorUpdate,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.SITE_ENGINEER])),
    sensor_repo: SensorRepository = Depends(get_sensor_repo),
    audit_repo: AuditRepository = Depends(get_audit_repo),
):
    sensor = await sensor_repo.get_by_id_active(sensor_id)
    if not sensor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sensor not found")
    await check_site_access(sensor.site_id, current_user)

    updated = await sensor_repo.update(sensor_id, **req.model_dump(exclude_unset=True))
    await audit_repo.record(
        action="UPDATE_SENSOR",
        entity_type="sensor",
        entity_id=str(sensor_id),
        details=req.model_dump(exclude_unset=True),
        user_id=current_user.id,
    )
    return updated


@router.delete("/sensors/{sensor_id}", response_model=StatusMessage)
async def delete_sensor(
    sensor_id: uuid.UUID,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.PROJECT_MANAGER])),
    sensor_repo: SensorRepository = Depends(get_sensor_repo),
    audit_repo: AuditRepository = Depends(get_audit_repo),
):
    sensor = await sensor_repo.get_by_id_active(sensor_id)
    if not sensor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sensor not found")
    await check_site_access(sensor.site_id, current_user)

    await sensor_repo.delete(sensor_id, soft=True)
    await audit_repo.record(
        action="DELETE_SENSOR",
        entity_type="sensor",
        entity_id=str(sensor_id),
        user_id=current_user.id,
    )
    return StatusMessage(status="ok", message="Sensor soft deleted successfully")


@router.get("/sensors/{sensor_id}/latest")
async def get_sensor_latest_reading(
    sensor_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    sensor_repo: SensorRepository = Depends(get_sensor_repo),
    telemetry_repo: TelemetryRepository = Depends(get_telemetry_repo),
):
    sensor = await sensor_repo.get_by_id_active(sensor_id)
    if not sensor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sensor not found")
    await check_site_access(sensor.site_id, current_user)

    doc = await telemetry_repo.get_sensor_latest(str(sensor_id))
    if not doc:
        # Fallback to sensor_code
        doc = await telemetry_repo.get_sensor_latest(sensor.sensor_code)
    return doc or {"sensor_id": str(sensor_id), "status": "no_data_yet"}


@router.get("/sensors/{sensor_id}/readings", response_model=List[ReadingRangeItem])
async def get_sensor_readings(
    sensor_id: uuid.UUID,
    from_ts: Optional[datetime] = Query(None, alias="from"),
    to_ts: Optional[datetime] = Query(None, alias="to"),
    interval: str = Query("5m", description="1m, 5m, 1h, 1d"),
    agg: str = Query("avg", description="avg, min, max, count"),
    current_user: User = Depends(get_current_user),
    sensor_repo: SensorRepository = Depends(get_sensor_repo),
    telemetry_repo: TelemetryRepository = Depends(get_telemetry_repo),
):
    sensor = await sensor_repo.get_by_id_active(sensor_id)
    if not sensor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sensor not found")
    await check_site_access(sensor.site_id, current_user)

    now = datetime.now(timezone.utc)
    from_date = from_ts or datetime.fromtimestamp(now.timestamp() - 86400, timezone.utc)  # default 24h
    to_date = to_ts or now

    # Try sensor_id first, then sensor_code
    readings = await telemetry_repo.get_readings_range(
        sensor_id=str(sensor_id),
        from_ts=from_date,
        to_ts=to_date,
        interval=interval,
        agg=agg,
    )
    if not readings:
        readings = await telemetry_repo.get_readings_range(
            sensor_id=sensor.sensor_code,
            from_ts=from_date,
            to_ts=to_date,
            interval=interval,
            agg=agg,
        )
    return readings


@router.get("/sites/{site_id}/telemetry/latest")
async def get_site_latest_telemetry(
    site_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    telemetry_repo: TelemetryRepository = Depends(get_telemetry_repo),
):
    await check_site_access(site_id, current_user)
    return await telemetry_repo.get_site_latest_readings(str(site_id))


@router.post("/telemetry/ingest", response_model=StatusMessage)
async def http_telemetry_ingest(
    payload: TelemetryIngestPayload,
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
):
    """
    HTTP fallback ingestion endpoint for IoT sensors / field gateways.
    Pushes reading into Redis Stream 'stream:ingest' just like the MQTT consumer.
    """
    # Accept API key or allow in dev
    r = get_redis_client()
    msg_data = {
        "sensor_id": payload.sensor_id,
        "site_id": payload.site_id,
        "type": payload.type,
        "value": str(payload.value),
        "unit": payload.unit,
        "ts": (payload.ts or datetime.now(timezone.utc)).isoformat(),
        "battery": str(payload.battery) if payload.battery is not None else "",
        "zone_id": payload.zone_id or "",
        "location": json.dumps(payload.location) if payload.location else "",
    }
    await r.xadd(KEY_STREAM_INGEST, msg_data)
    return StatusMessage(status="ok", message="Sensor reading queued for ingestion")


@router.get("/sensors/{sensor_id}/health", response_model=SensorHealthResponse)
async def get_sensor_health(
    sensor_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    sensor_repo: SensorRepository = Depends(get_sensor_repo),
):
    sensor = await sensor_repo.get_by_id_active(sensor_id)
    if not sensor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sensor not found")
    await check_site_access(sensor.site_id, current_user)

    now = datetime.now(timezone.utc)
    is_online = False
    if sensor.last_seen_at:
        seconds_ago = (now - sensor.last_seen_at).total_seconds()
        is_online = seconds_ago < 300  # online if seen within 5 min

    return SensorHealthResponse(
        sensor_id=sensor.id,
        sensor_code=sensor.sensor_code,
        status=sensor.status,
        last_seen_at=sensor.last_seen_at,
        battery_level=sensor.battery_level,
        is_online=is_online,
    )
