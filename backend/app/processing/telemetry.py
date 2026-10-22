import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.redis import get_redis_client, key_latest_sensor
from app.db.repositories.sensor_repo import SensorRepository
from app.db.repositories.telemetry_repo import TelemetryRepository

logger = logging.getLogger(__name__)


class TelemetryProcessingService:
    def __init__(
        self,
        telemetry_repo: TelemetryRepository,
    ):
        self.telemetry_repo = telemetry_repo

    async def persist_reading(
        self,
        reading: Dict[str, Any],
        session: AsyncSession,
    ) -> None:
        """
        1. Writes to Mongo sensor_readings (time-series).
        2. Upserts Mongo sensor_latest.
        3. Updates Redis latest cache.
        4. Updates PostgreSQL sensor heartbeat and battery.
        """
        sensor_id = reading["sensor_id"]
        site_id = reading["site_id"]
        sensor_type = reading["type"]
        val = reading["value"]
        unit = reading["unit"]
        ts = reading["ts"]
        zone_id = reading.get("zone_id")
        battery = reading.get("battery")
        location = reading.get("location")

        # 1 & 2. MongoDB persistence
        await self.telemetry_repo.insert_reading(
            sensor_id=sensor_id,
            site_id=site_id,
            sensor_type=sensor_type,
            value=val,
            unit=unit,
            ts=ts,
            zone_id=zone_id,
            battery=battery,
            location=location,
        )
        await self.telemetry_repo.upsert_sensor_latest(
            sensor_id=sensor_id,
            site_id=site_id,
            sensor_type=sensor_type,
            value=val,
            unit=unit,
            ts=ts,
            zone_id=zone_id,
            battery=battery,
            location=location,
        )

        # 3. Redis hot cache (TTL 60s)
        try:
            r = get_redis_client()
            cache_payload = {
                "sensor_id": sensor_id,
                "site_id": site_id,
                "type": sensor_type,
                "value": val,
                "unit": unit,
                "ts": ts.isoformat() if isinstance(ts, datetime) else str(ts),
                "battery": battery,
            }
            await r.set(key_latest_sensor(sensor_id), json.dumps(cache_payload), ex=60)
        except Exception as e:
            logger.warning(f"Failed to update Redis sensor cache: {e}")

        # 4. PostgreSQL sensor heartbeat
        try:
            sensor_repo = SensorRepository(session)
            # Try UUID lookup, otherwise try sensor_code
            try:
                sensor_uuid = uuid.UUID(sensor_id)
                sensor = await sensor_repo.get_by_id_active(sensor_uuid)
            except ValueError:
                sensor = await sensor_repo.get_by_code(sensor_id)

            if sensor:
                await sensor_repo.update_telemetry_heartbeat(sensor.id, battery_level=battery)
        except Exception as e:
            logger.warning(f"Failed to update sensor heartbeat in PostgreSQL: {e}")
