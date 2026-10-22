import logging
import math
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models.alert import Alert, AlertStatus, AlertSeverity
from app.db.models.outbox import OutboxEvent
from app.core.config import settings
from app.db.postgres import AsyncSessionLocal
from app.db.redis import get_redis_client
from app.db.repositories.alert_repo import AlertRepository
from app.db.repositories.event_log_repo import EventLogRepository
from app.db.repositories.incident_repo import IncidentRepository
from app.db.repositories.outbox_repo import OutboxRepository
from app.db.repositories.telemetry_repo import TelemetryRepository

logger = logging.getLogger("event_processor")


CORRELATIONS = [
    (
        "gas_hazard_unprotected_workers",
        {"sensor_threshold:gas", "ppe_violation"},
        "Toxic gas threshold breached in a zone where workers are missing PPE",
    ),
    (
        "structural_thermal_stress",
        {"sensor_threshold:vibration", "sensor_threshold:temperature"},
        "Concurrent high vibration and heat stress in one zone",
    ),
]


class EventCorrelationService:
    def __init__(self):
        self.event_log_repo = EventLogRepository()
        self.telemetry_repo = TelemetryRepository()

    async def check_anomaly_zscore(
        self, sensor_id: str, current_value: float, window_size: int = 20, z_threshold: float = 3.0
    ) -> Tuple[bool, float, float]:
        """
        Z-score anomaly detector on recent sensor readings.
        Returns (is_anomaly, mean, z_score).
        """
        readings = await self.telemetry_repo.get_raw_readings(sensor_id, limit=window_size)
        if len(readings) < 10:
            return False, current_value, 0.0

        values = [r["value"] for r in readings if "value" in r]
        if not values:
            return False, current_value, 0.0

        mean = sum(values) / len(values)
        variance = sum((x - mean) ** 2 for x in values) / len(values)
        std_dev = math.sqrt(variance)

        if std_dev < 1e-4:
            return False, mean, 0.0

        z_score = abs(current_value - mean) / std_dev
        is_anomaly = z_score >= z_threshold
        return is_anomaly, mean, round(z_score, 2)

    async def correlate_events(
        self,
        site_id: str,
        zone_id: Optional[str],
        event_type: str,
        payload: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        """
        Cross-event correlation within one zone and a time window (event time):
          * gas threshold + PPE violation        -> gas_hazard_unprotected_workers
          * vibration + temperature thresholds   -> structural_thermal_stress
        Events are keyed by kind *and* sensor type (e.g. "sensor_threshold:gas"), the
        current event counts, and each correlation fires at most once per zone per
        CORRELATION_COOLDOWN_SECONDS.
        """
        if not zone_id:
            return None
        sensor_type = (payload.get("type") or "").lower()
        key = f"{event_type}:{sensor_type}" if event_type in ("sensor_threshold", "anomaly") and sensor_type else event_type

        ts_raw = payload.get("ts")
        try:
            now = datetime.fromisoformat(str(ts_raw).replace("Z", "+00:00")).timestamp() if ts_raw else None
        except ValueError:
            now = None
        now = now or datetime.now(timezone.utc).timestamp()

        r = get_redis_client()
        window_key = f"corr:zone:{zone_id}"
        window = settings.CORRELATION_WINDOW_SECONDS
        pipe = r.pipeline()
        pipe.zadd(window_key, {key: now})
        pipe.zremrangebyscore(window_key, "-inf", now - window)
        pipe.zrangebyscore(window_key, now - window, now + window)
        pipe.expire(window_key, window * 4)
        recent = set((await pipe.execute())[2])

        for correlation_type, required, title in CORRELATIONS:
            if key in required and required <= recent:
                cooldown_key = f"corr:fired:{zone_id}:{correlation_type}"
                if not await r.set(cooldown_key, "1", nx=True, ex=settings.CORRELATION_COOLDOWN_SECONDS):
                    return None
                return {
                    "correlation_type": correlation_type,
                    "title": title,
                    "severity": "critical",
                    "site_id": site_id,
                    "zone_id": zone_id,
                    "events": sorted(required),
                }
        return None

    async def process_and_log(
        self,
        event_type: str,
        site_id: Optional[str],
        payload: Dict[str, Any],
        severity: str = "info",
    ) -> None:
        """
        Logs normalized event to Mongo event_log, and triggers auto-escalation if correlated.
        """
        correlation_id = str(uuid.uuid4())
        await self.event_log_repo.log_event(
            event_type=event_type,
            site_id=site_id,
            payload=payload,
            severity=severity,
            correlation_id=correlation_id,
        )

        zone_id = payload.get("zone_id")
        if site_id and zone_id:
            corr = await self.correlate_events(site_id, zone_id, event_type, payload)
            if corr:
                # Automatically create critical alert and incident for correlated risk
                await self._trigger_correlated_alert(corr)

    async def _trigger_correlated_alert(self, corr: Dict[str, Any]) -> None:
        async with AsyncSessionLocal() as session:
            try:
                alert_repo = AlertRepository(session)
                incident_repo = IncidentRepository(session)
                outbox_repo = OutboxRepository(session)

                site_uuid = uuid.UUID(corr["site_id"])
                zone_uuid = uuid.UUID(corr["zone_id"]) if corr.get("zone_id") else None

                alert = Alert(
                    site_id=site_uuid,
                    zone_id=zone_uuid,
                    alert_type="correlation",
                    severity=AlertSeverity.CRITICAL,
                    status=AlertStatus.ACTIVE,
                    message=corr["title"],
                    details=corr,
                )
                session.add(alert)
                await session.flush()

                # Auto-create incident for critical correlation
                incident = await incident_repo.create_incident(
                    site_id=site_uuid,
                    zone_id=zone_uuid,
                    alert_id=alert.id,
                    title=corr["title"],
                    description=f"Automated correlation trigger: {corr['correlation_type']}",
                    severity=AlertSeverity.CRITICAL,
                )

                # Add outbox events
                await outbox_repo.add_event(
                    event_type="alert:new",
                    aggregate_type="alert",
                    aggregate_id=str(alert.id),
                    payload={
                        "alert_id": str(alert.id),
                        "site_id": corr["site_id"],
                        "severity": "critical",
                        "message": alert.message,
                        "ts": datetime.now(timezone.utc).isoformat(),
                    },
                )
                await outbox_repo.add_event(
                    event_type="incident:new",
                    aggregate_type="incident",
                    aggregate_id=str(incident.id),
                    payload={
                        "incident_id": str(incident.id),
                        "incident_number": incident.incident_number,
                        "site_id": corr["site_id"],
                        "title": incident.title,
                        "severity": "critical",
                        "status": incident.status.value,
                        "ts": datetime.now(timezone.utc).isoformat(),
                    },
                )
                await session.commit()
            except Exception as e:
                await session.rollback()
                logger.error(f"Failed to record correlated alert: {e}")


event_correlation_service = EventCorrelationService()
