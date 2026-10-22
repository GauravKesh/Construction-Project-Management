import uuid
from datetime import datetime, timedelta, timezone
import pytest
from sqlalchemy import select
from app.db.models.alert import Alert, AlertSeverity, AlertStatus
from app.db.models.project import Site
from app.db.redis import get_redis_client, key_alert_dedup
from app.workers.scheduler import scheduler_service


@pytest.mark.asyncio
async def test_alert_dedup_redis_key():
    r = get_redis_client()
    rule_id = str(uuid.uuid4())
    sensor_id = str(uuid.uuid4())

    key = key_alert_dedup(rule_id, sensor_id)
    assert f"dedup:alert:{rule_id}:{sensor_id}" == key

    # Set deduplication flag with 5-second TTL
    await r.set(key, "1", ex=5)
    val = await r.get(key)
    assert val == b"1" or val == "1"

    ttl = await r.ttl(key)
    assert 0 < ttl <= 5

    await r.delete(key)


@pytest.mark.asyncio
async def test_alert_escalation(db_session):
    site_res = await db_session.execute(select(Site).limit(1))
    site = site_res.scalar_one()

    # Create unacknowledged alert from 20 minutes ago
    old_time = datetime.now(timezone.utc) - timedelta(minutes=20)
    alert = Alert(
        site_id=site.id,
        alert_type="sensor_threshold",
        severity=AlertSeverity.CRITICAL,
        status=AlertStatus.ACTIVE,
        message="Test alert for escalation logic",
        escalation_level=0,
        created_at=old_time,
    )
    db_session.add(alert)
    await db_session.commit()
    await db_session.refresh(alert)

    # Run escalation job
    await scheduler_service.run_alert_escalation()

    await db_session.refresh(alert)
    assert alert.escalation_level >= 1
    assert alert.last_escalated_at is not None

    # Cleanup test alert
    await db_session.delete(alert)
    await db_session.commit()
