import logging
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Optional, Tuple
from app.db.redis import get_redis_client
from app.db.repositories.telemetry_repo import TelemetryRepository

logger = logging.getLogger(__name__)

# Realistic physical range bounds for sensor types
SENSOR_RANGES = {
    "temperature": (-50.0, 150.0),    # °C
    "gas": (0.0, 10000.0),            # ppm
    "vibration": (0.0, 500.0),         # mm/s
    "noise": (0.0, 160.0),            # dB
    "humidity": (0.0, 100.0),         # %
    "dust": (0.0, 5000.0),            # ug/m3
    "tilt": (-90.0, 90.0),            # degrees
}

DEFAULT_UNITS = {
    "temperature": "°C",
    "gas": "ppm",
    "vibration": "mm/s",
    "noise": "dB",
    "humidity": "%",
    "dust": "ug/m3",
    "tilt": "deg",
}


def reading_dedup_key(sensor_id: str, ts: datetime) -> str:
    """Redis key identifying one reading (sensor + event time at millisecond resolution)."""
    return f"dedup:reading:{sensor_id}:{int(ts.timestamp() * 1000)}"


class ValidationService:
    def __init__(
        self,
        telemetry_repo: Optional[TelemetryRepository] = None,
        clock: Optional[Callable[[], datetime]] = None,
    ):
        self.telemetry_repo = telemetry_repo or TelemetryRepository()
        # Injectable so recorded data can be replayed deterministically
        self.clock = clock or (lambda: datetime.now(timezone.utc))

    async def validate_reading(
        self, payload: Dict[str, Any]
    ) -> Tuple[bool, Optional[Dict[str, Any]], Optional[str]]:
        """
        Validates raw sensor payload.
        Returns (is_valid, normalized_reading, rejection_reason).
        If invalid, automatically records in MongoDB rejected_messages.
        """
        # 1. Required fields check
        required_fields = ["sensor_id", "site_id", "type", "value"]
        for field in required_fields:
            if field not in payload or payload[field] is None:
                reason = f"Missing required field: '{field}'"
                await self.telemetry_repo.record_rejected_message(payload, reason, payload.get("sensor_id"))
                return False, None, reason

        sensor_id = str(payload["sensor_id"]).strip()
        site_id = str(payload["site_id"]).strip()
        sensor_type = str(payload["type"]).strip().lower()

        # 2. Numeric value check
        try:
            val = float(payload["value"])
        except (ValueError, TypeError):
            reason = f"Value '{payload.get('value')}' is not a valid number"
            await self.telemetry_repo.record_rejected_message(payload, reason, sensor_id)
            return False, None, reason

        # 3. Unit normalization
        unit = str(payload.get("unit", "")).strip()
        if not unit:
            unit = DEFAULT_UNITS.get(sensor_type, "units")

        # 4. Timestamp sanity. A reading without a timestamp is stamped with arrival
        # time (and flagged); an unparseable one is rejected rather than silently
        # re-timed, because that would corrupt the time series.
        now = self.clock()
        raw_ts = payload.get("ts")
        ts_assigned_on_arrival = False
        if raw_ts:
            try:
                if isinstance(raw_ts, datetime):
                    ts = raw_ts
                elif isinstance(raw_ts, (int, float)):
                    ts = datetime.fromtimestamp(raw_ts, timezone.utc)
                else:
                    ts = datetime.fromisoformat(str(raw_ts).replace("Z", "+00:00"))
            except (ValueError, OverflowError, OSError):
                reason = f"Timestamp '{raw_ts}' is not a valid ISO-8601 or epoch timestamp"
                await self.telemetry_repo.record_rejected_message(payload, reason, sensor_id)
                return False, None, reason
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
        else:
            ts = now
            ts_assigned_on_arrival = True

        # Reject future timestamps > 5 minutes
        if (ts - now).total_seconds() > 300:
            reason = f"Timestamp '{ts}' is too far in the future"
            await self.telemetry_repo.record_rejected_message(payload, reason, sensor_id)
            return False, None, reason

        # Reject timestamps older than 90 days
        if (now - ts).total_seconds() > 90 * 86400:
            reason = f"Timestamp '{ts}' is older than 90 days retention window"
            await self.telemetry_repo.record_rejected_message(payload, reason, sensor_id)
            return False, None, reason

        # 5. Out of range check
        if sensor_type in SENSOR_RANGES:
            min_bound, max_bound = SENSOR_RANGES[sensor_type]
            if val < min_bound or val > max_bound:
                reason = f"Reading {val} {unit} out of physical bounds [{min_bound}, {max_bound}]"
                await self.telemetry_repo.record_rejected_message(payload, reason, sensor_id)
                return False, None, reason

        # 6. Deduplication check (sensor_id + event time in milliseconds)
        dedup_key = reading_dedup_key(sensor_id, ts)
        try:
            r = get_redis_client()
            is_new = await r.set(dedup_key, "1", nx=True, ex=300)
            if not is_new:
                reason = f"Duplicate reading for sensor {sensor_id} at timestamp {ts.isoformat()}"
                await self.telemetry_repo.record_rejected_message(payload, reason, sensor_id)
                return False, None, reason
        except Exception as e:
            logger.warning(f"Dedup check warning: {e}")

        normalized = {
            "sensor_id": sensor_id,
            "site_id": site_id,
            "type": sensor_type,
            "value": val,
            "unit": unit,
            "ts": ts,
            "battery": float(payload["battery"]) if payload.get("battery") is not None else None,
            "zone_id": str(payload["zone_id"]) if payload.get("zone_id") else None,
            "location": payload.get("location"),
            "ts_assigned_on_arrival": ts_assigned_on_arrival,
        }
        return True, normalized, None


validation_service = ValidationService()
