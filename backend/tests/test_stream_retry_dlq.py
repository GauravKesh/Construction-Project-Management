import json
import uuid
import pytest
from app.db.redis import get_redis_client, KEY_STREAM_INGEST, KEY_STREAM_DLQ


@pytest.mark.asyncio
async def test_redis_stream_publish_and_dlq():
    r = get_redis_client()

    # 1. Add valid test message to stream:ingest
    test_id = str(uuid.uuid4())
    entry = {
        "sensor_id": test_id,
        "site_id": "test-site",
        "type": "temperature",
        "value": "25.0",
        "unit": "°C",
        "ts": "2026-10-22T08:00:00Z",
    }
    msg_id = await r.xadd(KEY_STREAM_INGEST, entry)
    assert msg_id is not None

    # Read from stream
    read_res = await r.xrange(KEY_STREAM_INGEST, min=msg_id, max=msg_id)
    assert len(read_res) == 1
    stream_fields = read_res[0][1]
    # Check either str or bytes decoded
    sensor_id_val = stream_fields.get(b"sensor_id", stream_fields.get("sensor_id"))
    assert (sensor_id_val.decode() if isinstance(sensor_id_val, bytes) else sensor_id_val) == test_id

    # 2. Simulate forwarding corrupted message to Dead Letter Queue
    dlq_entry = {
        "original_msg_id": str(msg_id),
        "fields": json.dumps(entry),
        "error": "Simulated unrecoverable deserialization failure",
    }
    dlq_id = await r.xadd(KEY_STREAM_DLQ, dlq_entry)
    assert dlq_id is not None

    dlq_msgs = await r.xrange(KEY_STREAM_DLQ, min=dlq_id, max=dlq_id)
    assert len(dlq_msgs) == 1
    dlq_data = dlq_msgs[0][1]
    err_val = dlq_data.get(b"error", dlq_data.get("error"))
    err_str = err_val.decode() if isinstance(err_val, bytes) else err_val
    assert "Simulated unrecoverable" in err_str

    # Clean up test messages
    await r.xdel(KEY_STREAM_INGEST, msg_id)
    await r.xdel(KEY_STREAM_DLQ, dlq_id)


@pytest.mark.asyncio
async def test_worker_retries_before_dead_lettering(db_session, monkeypatch):
    from datetime import datetime, timezone
    from sqlalchemy import select
    from app.db.models.sensor import Sensor
    from app.db.redis import GROUP_PROCESSORS
    from app.processing.validation import reading_dedup_key
    from app.workers.stream_worker import MAX_DELIVERIES, StreamIngestWorker

    r = get_redis_client()
    sensor = (await db_session.execute(select(Sensor).where(Sensor.sensor_type == "gas").limit(1))).scalar_one()
    ts = datetime.now(timezone.utc)
    fields = {
        "sensor_id": str(sensor.id),
        "site_id": str(sensor.site_id),
        "type": "gas",
        "value": "12.0",
        "unit": "ppm",
        "ts": ts.isoformat(),
    }
    worker = StreamIngestWorker(consumer_name=f"retry-test-{uuid.uuid4().hex[:6]}")

    async def boom(*args, **kwargs):
        raise RuntimeError("simulated transient database failure")

    monkeypatch.setattr(worker.telemetry_service, "persist_reading", boom)

    msg_id = await r.xadd(KEY_STREAM_INGEST, fields)
    await r.xreadgroup(GROUP_PROCESSORS, worker.consumer_name, {KEY_STREAM_INGEST: ">"}, count=100)

    def dlq_has(entries):
        return any(e[1].get("original_msg_id") == msg_id for e in entries)

    for attempt in range(1, MAX_DELIVERIES + 1):
        if attempt > 1:
            # Simulate the reclaim loop re-delivering the pending message
            await r.xclaim(KEY_STREAM_INGEST, GROUP_PROCESSORS, worker.consumer_name, 0, [msg_id])
        await worker._process_stream_message(msg_id, fields)

        # The dedup claim is released so the retry is not rejected as a duplicate
        assert await r.get(reading_dedup_key(str(sensor.id), ts)) is None

        pending = await r.xpending_range(KEY_STREAM_INGEST, GROUP_PROCESSORS, min=msg_id, max=msg_id, count=1)
        dlq = await r.xrevrange(KEY_STREAM_DLQ, count=50)
        if attempt < MAX_DELIVERIES:
            assert len(pending) == 1, f"attempt {attempt}: message should stay pending for retry"
            assert not dlq_has(dlq)
        else:
            assert pending == [], "message should be acknowledged once dead-lettered"
            assert dlq_has(dlq)

    await r.xdel(KEY_STREAM_INGEST, msg_id)


@pytest.mark.asyncio
async def test_alert_recipients_are_scoped_to_project(db_session, admin_user, safety_user):
    from sqlalchemy import select
    from app.core.security import hash_password
    from app.db.models.project import Site
    from app.db.models.user import User, UserRole
    from app.db.repositories.user_repo import UserRepository
    from app.workers.stream_worker import NOTIFY_ROLES

    site = (await db_session.execute(select(Site).limit(1))).scalar_one()
    outsider = User(
        email="outsider-notify@example.com",
        hashed_password=hash_password("Outsider@123456"),
        full_name="Other Project Safety Officer",
        role=UserRole.SAFETY_OFFICER,
        is_active=True,
    )
    db_session.add(outsider)
    await db_session.commit()
    try:
        recipients = await UserRepository(db_session).list_alert_recipients(site.project_id, NOTIFY_ROLES)
        ids = {u.id for u in recipients}
        assert admin_user.id in ids
        assert safety_user.id in ids
        assert outsider.id not in ids
    finally:
        await db_session.delete(outsider)
        await db_session.commit()
