import pytest
from datetime import datetime, timezone, timedelta
from app.processing.validation import validation_service


@pytest.mark.asyncio
async def test_valid_reading():
    payload = {
        "sensor_id": "test-sensor-01",
        "site_id": "test-site-01",
        "type": "temperature",
        "value": 24.5,
        "unit": "°C",
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    is_valid, normalized, reason = await validation_service.validate_reading(payload)
    assert is_valid is True
    assert normalized is not None
    assert normalized["value"] == 24.5
    assert normalized["unit"] == "°C"
    assert reason is None


@pytest.mark.asyncio
async def test_missing_required_fields():
    payload = {
        "sensor_id": "test-sensor-01",
        # missing site_id, type, value
    }
    is_valid, normalized, reason = await validation_service.validate_reading(payload)
    assert is_valid is False
    assert normalized is None
    assert "Missing required field" in reason


@pytest.mark.asyncio
async def test_non_numeric_value():
    payload = {
        "sensor_id": "test-sensor-01",
        "site_id": "test-site-01",
        "type": "gas",
        "value": "corrupted_string",
    }
    is_valid, normalized, reason = await validation_service.validate_reading(payload)
    assert is_valid is False
    assert "not a valid number" in reason


@pytest.mark.asyncio
async def test_out_of_range_rejection():
    payload = {
        "sensor_id": "test-sensor-01",
        "site_id": "test-site-01",
        "type": "temperature",
        "value": 999.0,  # Range is -50 to 150
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    is_valid, normalized, reason = await validation_service.validate_reading(payload)
    assert is_valid is False
    assert "out of physical bounds" in reason


@pytest.mark.asyncio
async def test_future_timestamp_rejection():
    future_time = datetime.now(timezone.utc) + timedelta(hours=2)
    payload = {
        "sensor_id": "test-sensor-01",
        "site_id": "test-site-01",
        "type": "gas",
        "value": 15.0,
        "ts": future_time.isoformat(),
    }
    is_valid, normalized, reason = await validation_service.validate_reading(payload)
    assert is_valid is False
    assert "in the future" in reason


@pytest.mark.asyncio
async def test_unparseable_timestamp_is_rejected_not_retimed():
    payload = {
        "sensor_id": "test-sensor-01",
        "site_id": "test-site-01",
        "type": "gas",
        "value": 15.0,
        "ts": "yesterday-ish",
    }
    is_valid, normalized, reason = await validation_service.validate_reading(payload)
    assert is_valid is False
    assert "not a valid" in reason


@pytest.mark.asyncio
async def test_sub_second_readings_are_not_duplicates():
    base = datetime.now(timezone.utc).replace(microsecond=0)
    for offset_ms in (0, 250, 500):
        payload = {
            "sensor_id": "test-sensor-hf",
            "site_id": "test-site-01",
            "type": "vibration",
            "value": 3.0,
            "ts": (base + timedelta(milliseconds=offset_ms)).isoformat(),
        }
        is_valid, _, reason = await validation_service.validate_reading(payload)
        assert is_valid is True, reason

    # The exact same event time again is a duplicate
    is_valid, _, reason = await validation_service.validate_reading(payload)
    assert is_valid is False
    assert "Duplicate" in reason


@pytest.mark.asyncio
async def test_tilt_range_is_enforced():
    payload = {
        "sensor_id": "test-sensor-tilt",
        "site_id": "test-site-01",
        "type": "tilt",
        "value": 120.0,
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    is_valid, _, reason = await validation_service.validate_reading(payload)
    assert is_valid is False
    assert "out of physical bounds" in reason


@pytest.mark.asyncio
async def test_missing_timestamp_is_flagged():
    payload = {"sensor_id": "test-sensor-nots", "site_id": "test-site-01", "type": "gas", "value": 5.0}
    is_valid, normalized, _ = await validation_service.validate_reading(payload)
    assert is_valid is True
    assert normalized["ts_assigned_on_arrival"] is True
