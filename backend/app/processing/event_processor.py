import logging
import math
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models.alert import Alert, AlertStatus, AlertSeverity
from app.db.models.outbox import OutboxEvent
from app.db.postgres import AsyncSessionLocal
from app.db.redis import get_redis_client
from app.db.repositories.alert_repo import AlertRepository
from app.db.repositories.event_log_repo import EventLogRepository
from app.db.repositories.incident_repo import IncidentRepository
from app.db.repositories.outbox_repo import OutboxRepository
from app.db.repositories.telemetry_repo import TelemetryRepository

logger = logging.getLogger("event_processor")


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
        Cross-event correlation:
        E.g. Gas spike + worker without PPE in the same zone within 5 minutes.
        Uses Redis keys to remember recent events in zone for correlation window.
        """
        if not zone_id:
            return None

        r = get_redis_client()
        corr_key = f"corr:zone:{zone_id}"

        # Record this event in zone state (TTL 300 seconds = 5 min)
        event_summary = {
            "type": event_type,
            "ts": datetime.now(timezone.utc).isoformat(),
            "payload": payload,
        }

        # Check existing events in this zone
        recent_events_raw = await r.lrange(corr_key, 0, -1)
        recent_types = set()
        for ev_str in recent_events_raw:
            try:
                import json
                ev_data = json.loads(ev_str)
                recent_types.add(ev_data.get("type"))
            except Exception:
                pass

        # Push current event and set 5 min expiration
        import json
        await r.rpush(corr_key, json.dumps(event_summary))
        await r.expire(corr_key, 300)

        # Correlation 1: Hazardous gas spike + PPE violation in same zone
        if (event_type == "sensor_threshold" and payload.get("type") == "gas") or event_type == "ppe_violation":
            if "sensor_threshold" in recent_types and "ppe_violation" in recent_types:
                # Trigger correlated critical alert!
                return {
                    "correlation_type": "gas_hazard_unprotected_workers",
                    "title": "CRITICAL HAZARD: Toxic Gas Detected Near Workers With Missing PPE",
                    "severity": "critical",
                    "site_id": site_id,
                    "zone_id": zone_id,
                }

        # Correlation 2: Vibration spike + Temperature spike in same zone
        if event_type == "sensor_threshold":
            t = payload.get("type")
            if t == "vibration" and "temperature" in recent_types:
                return {
                    "correlation_type": "structural_thermal_stress",
                    "title": "CRITICAL WARNING: Concurrent High Vibration & Heat Stress in Zone",
                    "severity": "critical",
                    "site_id": site_id,
                    "zone_id": zone_id,
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
