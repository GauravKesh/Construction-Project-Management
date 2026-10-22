"""
Raising alerts from analysers that run outside the sensor stream worker
(camera security analytics, audio analysis): cooldown, alert row, live outbox
event and zone correlation in one place.
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from app.db.models.alert import Alert, AlertSeverity, AlertStatus
from app.db.postgres import AsyncSessionLocal
from app.db.redis import get_redis_client
from app.db.repositories.outbox_repo import OutboxRepository

logger = logging.getLogger("alerts")


def _uuid(value: Optional[str]) -> Optional[uuid.UUID]:
    try:
        return uuid.UUID(str(value)) if value else None
    except ValueError:
        return None


async def raise_alert(
    *,
    site_id: str,
    alert_type: str,
    severity: AlertSeverity,
    message: str,
    details: Dict[str, Any],
    zone_id: Optional[str] = None,
    camera_id: Optional[str] = None,
    sensor_id: Optional[str] = None,
    cooldown_key: Optional[str] = None,
    cooldown_seconds: int = 0,
    correlate_as: Optional[str] = None,
) -> Optional[str]:
    """Create the alert unless the cooldown key is held. Returns the alert id, or None."""
    site_uuid = _uuid(site_id)
    if site_uuid is None:
        return None
    if cooldown_key and cooldown_seconds > 0:
        try:
            if not await get_redis_client().set(cooldown_key, "1", nx=True, ex=cooldown_seconds):
                return None
        except Exception as e:
            logger.warning(f"Alert cooldown check failed ({e}); raising anyway")

    async with AsyncSessionLocal() as session:
        try:
            alert = Alert(
                site_id=site_uuid,
                zone_id=_uuid(zone_id),
                camera_id=_uuid(camera_id),
                sensor_id=_uuid(sensor_id),
                alert_type=alert_type,
                severity=severity,
                status=AlertStatus.ACTIVE,
                message=message,
                details=details,
            )
            session.add(alert)
            await session.flush()
            await OutboxRepository(session).add_event(
                event_type="alert:new",
                aggregate_type="alert",
                aggregate_id=str(alert.id),
                payload={
                    "alert_id": str(alert.id),
                    "site_id": str(site_uuid),
                    "severity": severity.value,
                    "message": message,
                    "ts": datetime.now(timezone.utc).isoformat(),
                },
            )
            await session.commit()
            alert_id = str(alert.id)
        except Exception as e:
            await session.rollback()
            logger.error(f"Failed to record {alert_type} alert: {e}")
            return None

    if correlate_as and zone_id:
        try:
            from app.processing.event_processor import event_correlation_service

            await event_correlation_service.process_and_log(
                event_type=correlate_as,
                site_id=site_id,
                payload={"zone_id": zone_id, "camera_id": camera_id, "sensor_id": sensor_id, "alert_id": alert_id},
                severity=severity.value,
            )
        except Exception as e:
            logger.warning(f"Correlation step failed for {alert_type}: {e}")
    return alert_id
