import json
import uuid
from datetime import datetime, timezone
import pytest
from app.db.redis import get_redis_client, key_latest_sensor
from app.db.repositories.telemetry_repo import TelemetryRepository
from app.processing.telemetry import TelemetryProcessingService


@pytest.mark.asyncio
async def test_telemetry_persistence_and_cache(db_session):
    telemetry_repo = TelemetryRepository()
    telemetry_service = TelemetryProcessingService(telemetry_repo)
    r = get_redis_client()

    sensor_id = str(uuid.uuid4())
    site_id = str(uuid.uuid4())
    ts = datetime.now(timezone.utc)

    reading = {
        "sensor_id": sensor_id,
        "site_id": site_id,
        "type": "temperature",
        "value": 28.5,
        "unit": "°C",
        "ts": ts,
        "battery": 92.0,
    }

    # 1. First persist
    await telemetry_service.persist_reading(reading, db_session)

    # Check Redis latest cache
    cache_key = key_latest_sensor(sensor_id)
    cached_val = await r.get(cache_key)
    assert cached_val is not None
    data = json.loads(cached_val)
    assert data["value"] == 28.5
    assert data["sensor_id"] == sensor_id

    # Check MongoDB sensor_latest
    latest_doc = await telemetry_repo.get_sensor_latest(sensor_id)
    assert latest_doc is not None
    assert latest_doc["value"] == 28.5

    # 2. Idempotent second persist with updated value
    reading["value"] = 31.0
    await telemetry_service.persist_reading(reading, db_session)

    # Latest must reflect updated reading
    updated_doc = await telemetry_repo.get_sensor_latest(sensor_id)
    assert updated_doc["value"] == 31.0

    # Cleanup Redis key
    await r.delete(cache_key)
