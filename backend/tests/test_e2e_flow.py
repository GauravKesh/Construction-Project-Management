import asyncio
import json
import uuid
from datetime import datetime, timezone
import pytest
from sqlalchemy import select
from app.db.models.alert import Alert, AlertSeverity
from app.db.models.incident import Incident
from app.db.models.project import Site
from app.db.models.sensor import Sensor
from app.db.redis import get_redis_client, KEY_STREAM_INGEST
from app.db.repositories.outbox_repo import OutboxRepository
from app.db.repositories.telemetry_repo import TelemetryRepository
from app.realtime.outbox_publisher import outbox_publisher
from app.workers.stream_worker import StreamIngestWorker


@pytest.mark.asyncio
async def test_end_to_end_telemetry_to_alert_and_outbox(db_session):
    r = get_redis_client()
    telemetry_repo = TelemetryRepository()

    # Find the seeded Gas sensor and site
    sensor_res = await db_session.execute(select(Sensor).where(Sensor.sensor_type == "gas").limit(1))
    sensor = sensor_res.scalar_one()
    site_id = str(sensor.site_id)
    sensor_id = str(sensor.id)
    sensor_uuid = sensor.id

    # Clear any residual dedup / cooldown keys for this sensor
    dedup_keys = await r.keys(f"*{sensor_id}*")
    for k in dedup_keys:
        await r.delete(k)

    # 1. Simulate MQTT Ingestion: push critical threshold-breaching payload into Redis Stream
    payload = {
        "sensor_id": sensor_id,
        "site_id": site_id,
        "type": "gas",
        "value": "115.0",  # Seeded rule triggers Critical alert at > 100.0 with auto_create_incident=True
        "unit": "ppm",
        "ts": datetime.now(timezone.utc).isoformat(),
        "battery": "94.0",
        "zone_id": str(sensor.zone_id) if sensor.zone_id else "",
    }
    msg_id = await r.xadd(KEY_STREAM_INGEST, payload)
    assert msg_id is not None

    # 2. Run single message processing cycle via worker
    worker = StreamIngestWorker(consumer_name=f"test-worker-{uuid.uuid4().hex[:6]}")
    await worker._process_stream_message(msg_id, payload)

    # Refresh db_session snapshot to read committed transaction from worker
    await db_session.rollback()

    # 3. Verify Alert was created in PostgreSQL
    alert_res = await db_session.execute(
        select(Alert).where(Alert.sensor_id == sensor_uuid, Alert.severity == AlertSeverity.CRITICAL).order_by(Alert.created_at.desc())
    )
    alert = alert_res.scalars().first()
    assert alert is not None
    assert alert.reading_value == 115.0
    assert "Toxic Gas" in alert.message

    # 4. Verify Auto Incident was generated
    inc_res = await db_session.execute(
        select(Incident).where(Incident.alert_id == alert.id)
    )
    incident = inc_res.scalar_one_or_none()
    assert incident is not None
    assert incident.severity == AlertSeverity.CRITICAL

    # 5. Verify Telemetry in Mongo sensor_latest
    latest = await telemetry_repo.get_sensor_latest(sensor_id)
    assert latest is not None
    assert float(latest["value"]) == 115.0

    # 6. Verify Outbox events were queued
    from app.db.models.outbox import OutboxEvent
    outbox_res = await db_session.execute(
        select(OutboxEvent).where(
            OutboxEvent.event_type == "alert:new",
            OutboxEvent.aggregate_id == str(alert.id),
        )
    )
    alert_events = list(outbox_res.scalars().all())
    assert len(alert_events) == 1

    # 7. Process outbox publisher batch (dispatches notifications and Socket.IO events)
    published_count = await outbox_publisher.process_pending_outbox()
    assert published_count >= 1

    # Clean up test alert & incident
    await db_session.delete(incident)
    await db_session.delete(alert)
    await db_session.commit()
