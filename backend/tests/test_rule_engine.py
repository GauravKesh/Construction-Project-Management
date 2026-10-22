import uuid
from datetime import datetime, timedelta, timezone
import pytest
from sqlalchemy import select
from app.db.models.project import Site
from app.db.models.rule import AlertSeverity, Rule
from app.db.redis import get_redis_client, key_alert_dedup, key_rule_state
from app.processing.rule_engine import evaluate_operator, rule_engine


def test_evaluate_operators():
    # Greater than
    assert evaluate_operator(">", 55.0, 50.0) is True
    assert evaluate_operator(">", 45.0, 50.0) is False

    # Less than
    assert evaluate_operator("<", 10.0, 20.0) is True
    assert evaluate_operator("<", 25.0, 20.0) is False

    # Greater than or equal
    assert evaluate_operator(">=", 50.0, 50.0) is True
    assert evaluate_operator(">=", 51.0, 50.0) is True
    assert evaluate_operator(">=", 49.0, 50.0) is False

    # Less than or equal
    assert evaluate_operator("<=", 50.0, 50.0) is True
    assert evaluate_operator("<=", 49.0, 50.0) is True
    assert evaluate_operator("<=", 51.0, 50.0) is False

    # Between
    assert evaluate_operator("between", 25.0, 20.0, 30.0) is True
    assert evaluate_operator("between", 15.0, 20.0, 30.0) is False
    assert evaluate_operator("between", 35.0, 20.0, 30.0) is False

    # Outside
    assert evaluate_operator("outside", 15.0, 20.0, 30.0) is True
    assert evaluate_operator("outside", 35.0, 20.0, 30.0) is True
    assert evaluate_operator("outside", 25.0, 20.0, 30.0) is False


async def _make_rule(db_session, sensor_type, duration_seconds, cooldown_seconds):
    site_res = await db_session.execute(select(Site).limit(1))
    site = site_res.scalar_one()
    rule = Rule(
        id=uuid.uuid4(),
        site_id=site.id,
        name=f"Test Rule {sensor_type}",
        sensor_type=sensor_type,
        operator=">",
        threshold_val1=50.0,
        duration_seconds=duration_seconds,
        severity=AlertSeverity.WARNING,
        is_enabled=True,
        cooldown_seconds=cooldown_seconds,
    )
    db_session.add(rule)
    await db_session.flush()
    return site, rule


def _reading(site, sensor_id, sensor_type, value, ts):
    return {
        "sensor_id": sensor_id,
        "site_id": str(site.id),
        "type": sensor_type,
        "value": value,
        "unit": "ppm",
        "ts": ts,
    }


@pytest.mark.asyncio
async def test_rule_duration_and_cooldown(db_session):
    """Duration and cooldown are measured in event time, so replays are deterministic."""
    site, rule = await _make_rule(db_session, "test_duration_type", duration_seconds=5, cooldown_seconds=60)
    sensor_id = str(uuid.uuid4())
    t0 = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)

    async def evaluate(value, offset_s):
        return await rule_engine.evaluate_reading(
            _reading(site, sensor_id, "test_duration_type", value, t0 + timedelta(seconds=offset_s)),
            db_session,
        )

    # Breach starts: not sustained yet
    assert await evaluate(65.0, 0) == []
    assert await evaluate(65.0, 3) == []
    # Sustained for >= 5s of event time: alert
    alerts = await evaluate(65.0, 6)
    assert len(alerts) == 1
    assert alerts[0]["severity"] == AlertSeverity.WARNING
    assert "Test Rule" in alerts[0]["message"]
    assert alerts[0]["details"]["reading_ts"] == (t0 + timedelta(seconds=6)).isoformat()

    # Within the 60s cooldown (event time): suppressed even though the breach is sustained
    assert await evaluate(65.0, 8) == []
    assert await evaluate(65.0, 11) == []
    assert await evaluate(65.0, 14) == []
    # After cooldown, a newly sustained breach alerts again
    assert await evaluate(65.0, 70) == []  # gap > duration restarts the timer
    assert len(await evaluate(65.0, 75)) == 1

    await db_session.rollback()


@pytest.mark.asyncio
async def test_rule_gap_does_not_count_as_sustained(db_session):
    """Two breaching readings separated by silence longer than the window must not alert."""
    site, rule = await _make_rule(db_session, "test_gap_type", duration_seconds=5, cooldown_seconds=0)
    sensor_id = str(uuid.uuid4())
    t0 = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)

    first = _reading(site, sensor_id, "test_gap_type", 65.0, t0)
    after_gap = _reading(site, sensor_id, "test_gap_type", 65.0, t0 + timedelta(seconds=600))
    assert await rule_engine.evaluate_reading(first, db_session) == []
    assert await rule_engine.evaluate_reading(after_gap, db_session) == []

    # A normal reading resets the state entirely
    normal = _reading(site, sensor_id, "test_gap_type", 10.0, t0 + timedelta(seconds=601))
    assert await rule_engine.evaluate_reading(normal, db_session) == []
    assert await get_redis_client().get(key_rule_state(str(rule.id), sensor_id)) is None

    await db_session.rollback()


@pytest.mark.asyncio
async def test_zero_cooldown_is_honoured(db_session):
    """A configured cooldown of 0 must not be silently raised to 60s."""
    site, rule = await _make_rule(db_session, "test_nocooldown_type", duration_seconds=0, cooldown_seconds=0)
    sensor_id = str(uuid.uuid4())
    t0 = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    for i in range(3):
        reading = _reading(site, sensor_id, "test_nocooldown_type", 65.0, t0 + timedelta(seconds=i))
        assert len(await rule_engine.evaluate_reading(reading, db_session)) == 1
    await db_session.rollback()
