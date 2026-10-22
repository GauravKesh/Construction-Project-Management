import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.metrics import STREAM_LAG_RECORDS, DLQ_SIZE_RECORDS
from app.db.postgres import AsyncSessionLocal
from app.db.redis import (
    get_redis_client,
    KEY_STREAM_INGEST,
    KEY_STREAM_DLQ,
    GROUP_PROCESSORS,
)
from app.db.models.alert import Alert, AlertStatus, AlertSeverity
from app.db.models.incident import Incident, IncidentStatus
from app.db.models.notification import Notification
from app.db.models.outbox import OutboxEvent
from app.db.models.user import User, UserRole
from app.db.repositories.alert_repo import AlertRepository
from app.db.repositories.incident_repo import IncidentRepository
from app.db.repositories.outbox_repo import OutboxRepository
from app.db.repositories.telemetry_repo import TelemetryRepository
from app.db.repositories.user_repo import UserRepository
from app.core.config import settings
from app.processing.anomaly import score_reading
from app.processing.event_processor import event_correlation_service
from app.processing.rule_engine import rule_engine
from app.processing.telemetry import TelemetryProcessingService
from app.db.models.project import Site
from app.processing.validation import reading_dedup_key, validation_service

logger = logging.getLogger("stream_worker")

# A message is retried until it has been delivered this many times, then dead-lettered
MAX_DELIVERIES = 3
# Pending messages idle this long (crashed consumer, or a failed attempt) are reclaimed
RECLAIM_IDLE_MS = 10_000
NOTIFY_ROLES = [UserRole.ADMIN, UserRole.SAFETY_OFFICER, UserRole.PROJECT_MANAGER]


class StreamIngestWorker:
    def __init__(self, consumer_name: Optional[str] = None):
        self.consumer_name = consumer_name or f"worker-{uuid.uuid4().hex[:8]}"
        self.group_name = GROUP_PROCESSORS
        self._running = False
        self.telemetry_repo = TelemetryRepository()
        self.telemetry_service = TelemetryProcessingService(self.telemetry_repo)

    async def start(self) -> None:
        self._running = True
        logger.info(f"Stream consumer started: group={self.group_name}, consumer={self.consumer_name}")
        r = get_redis_client()

        while self._running:
            try:
                # Read from Redis stream using consumer group
                streams = await r.xreadgroup(
                    groupname=self.group_name,
                    consumername=self.consumer_name,
                    streams={KEY_STREAM_INGEST: ">"},
                    count=20,
                    block=1000,
                )

                if not streams:
                    await self._reclaim_stale_messages()
                    continue

                for stream_name, messages in streams:
                    for msg_id, raw_fields in messages:
                        await self._process_stream_message(msg_id, raw_fields)

            except asyncio.CancelledError:
                logger.info("Stream worker stopping.")
                break
            except Exception as e:
                logger.error(f"Error in stream consumer loop: {e}", exc_info=True)
                await asyncio.sleep(1.0)

    async def _reclaim_stale_messages(self) -> int:
        """
        Take over messages that were delivered but never acknowledged: either another
        consumer crashed mid-processing, or a previous attempt failed and left the
        message pending for retry. XAUTOCLAIM increments each message's delivery count.
        """
        r = get_redis_client()
        try:
            result = await r.xautoclaim(
                KEY_STREAM_INGEST,
                self.group_name,
                self.consumer_name,
                min_idle_time=RECLAIM_IDLE_MS,
                start_id="0-0",
                count=20,
            )
        except Exception as e:
            logger.warning(f"XAUTOCLAIM failed: {e}")
            return 0
        messages = result[1] if len(result) > 1 else []
        for msg_id, raw_fields in messages:
            if raw_fields:
                await self._process_stream_message(msg_id, raw_fields)
        return len(messages)

    async def _delivery_count(self, msg_id: str) -> int:
        r = get_redis_client()
        try:
            pending = await r.xpending_range(
                KEY_STREAM_INGEST, self.group_name, min=msg_id, max=msg_id, count=1
            )
            return int(pending[0]["times_delivered"]) if pending else 1
        except Exception:
            return 1

    async def _handle_failure(
        self, msg_id: str, fields: Dict[str, str], normalized: Optional[Dict[str, Any]], error: Exception
    ) -> None:
        r = get_redis_client()
        # Release the dedup claim so the retry is not rejected as a duplicate
        if normalized:
            try:
                await r.delete(reading_dedup_key(normalized["sensor_id"], normalized["ts"]))
            except Exception:
                pass

        deliveries = await self._delivery_count(msg_id)
        if deliveries < MAX_DELIVERIES:
            logger.warning(
                f"Message {msg_id} failed (attempt {deliveries}/{MAX_DELIVERIES}); left pending for retry: {error}"
            )
            return

        logger.error(f"Message {msg_id} failed {deliveries} times; moving to DLQ: {error}")
        try:
            await r.xadd(
                KEY_STREAM_DLQ,
                {
                    "original_msg_id": msg_id,
                    "fields": json.dumps(fields),
                    "error": str(error),
                    "deliveries": str(deliveries),
                },
            )
            await r.xack(KEY_STREAM_INGEST, self.group_name, msg_id)
        except Exception as e:
            logger.error(f"Failed to dead-letter message {msg_id}: {e}")

    async def _process_stream_message(self, msg_id: str, fields: Dict[str, str]) -> None:
        r = get_redis_client()

        # Reconstruct reading payload
        location_data = None
        if fields.get("location"):
            try:
                location_data = json.loads(fields["location"])
            except Exception:
                pass

        payload = {
            "sensor_id": fields.get("sensor_id"),
            "site_id": fields.get("site_id"),
            "type": fields.get("type"),
            "value": fields.get("value"),
            "unit": fields.get("unit"),
            "ts": fields.get("ts"),
            "battery": float(fields["battery"]) if fields.get("battery") else None,
            "zone_id": fields.get("zone_id") or None,
            "location": location_data,
        }

        # 1. Validation
        is_valid, normalized, reason = await validation_service.validate_reading(payload)
        if not is_valid:
            # Acknowledge and drop invalid reading (already recorded in Mongo rejected_messages)
            await r.xack(KEY_STREAM_INGEST, self.group_name, msg_id)
            return

        async with AsyncSessionLocal() as session:
            try:
                # 2. Persistence (Mongo time-series + sensor_latest + Redis cache + PG heartbeat)
                await self.telemetry_service.persist_reading(normalized, session)

                # 3. Rule Engine evaluation
                triggered = await rule_engine.evaluate_reading(normalized, session)

                # 3b. Real-time statistical analysis: rolling z-score against this sensor's history
                analysis = None
                if settings.ANOMALY_DETECTION_ENABLED:
                    analysis = await score_reading(normalized["sensor_id"], normalized["value"], normalized["ts"])

                # 4. Atomic Transaction for Alerts + Incidents + Outbox events
                outbox_repo = OutboxRepository(session)
                alert_repo = AlertRepository(session)
                incident_repo = IncidentRepository(session)
                user_repo = UserRepository(session)

                # Add sensor:update outbox event for real-time WebSocket push
                await outbox_repo.add_event(
                    event_type="sensor:update",
                    aggregate_type="sensor",
                    aggregate_id=normalized["sensor_id"],
                    payload={
                        "sensor_id": normalized["sensor_id"],
                        "site_id": normalized["site_id"],
                        "type": normalized["type"],
                        "value": normalized["value"],
                        "unit": normalized["unit"],
                        "ts": normalized["ts"].isoformat(),
                        "battery": normalized.get("battery"),
                        "analysis": analysis.as_dict() if analysis else None,
                    },
                )

                recipients = None
                for item in triggered:
                    sensor_uuid = uuid.UUID(item["sensor_id"]) if item.get("sensor_id") else None
                    # Create Alert
                    alert = Alert(
                        site_id=item["site_id"],
                        zone_id=item["zone_id"],
                        rule_id=item["rule"].id,
                        sensor_id=sensor_uuid,
                        alert_type=item["alert_type"],
                        severity=item["severity"],
                        status=AlertStatus.ACTIVE,
                        message=item["message"],
                        reading_value=item["reading_value"],
                        threshold_value=item["threshold_value"],
                        details=item["details"],
                    )
                    session.add(alert)
                    await session.flush()

                    created_incident = None
                    if item.get("auto_create_incident") or item["severity"] == AlertSeverity.CRITICAL:
                        created_incident = await incident_repo.create_incident(
                            site_id=item["site_id"],
                            title=f"Automatic: {item['rule'].name}",
                            description=item["message"],
                            severity=item["severity"],
                            zone_id=item["zone_id"],
                            alert_id=alert.id,
                        )

                    # Notify admins plus safety/PM members of this site's project
                    if recipients is None:
                        site = await session.get(Site, item["site_id"])
                        recipients = await user_repo.list_alert_recipients(
                            site.project_id if site else None, NOTIFY_ROLES
                        )
                    for u in recipients:
                        notif = Notification(
                            user_id=u.id,
                            alert_id=alert.id,
                            channel="in_app",
                            recipient=u.email,
                            title=f"Alert: {item['rule'].name}",
                            body=item["message"],
                            status="pending",
                        )
                        session.add(notif)
                        await session.flush()

                        # Notification outbox event
                        await outbox_repo.add_event(
                            event_type="notification:new",
                            aggregate_type="notification",
                            aggregate_id=str(notif.id),
                            payload={
                                "notification_id": str(notif.id),
                                "user_id": str(u.id),
                                "title": notif.title,
                                "body": notif.body,
                                "alert_id": str(alert.id),
                                "channel": notif.channel,
                            },
                        )

                    # Alert outbox event
                    await outbox_repo.add_event(
                        event_type="alert:new",
                        aggregate_type="alert",
                        aggregate_id=str(alert.id),
                        payload={
                            "alert_id": str(alert.id),
                            "site_id": str(alert.site_id),
                            "severity": alert.severity.value,
                            "message": alert.message,
                            "reading_value": alert.reading_value,
                            "ts": datetime.now(timezone.utc).isoformat(),
                        },
                    )

                    if created_incident:
                        await outbox_repo.add_event(
                            event_type="incident:new",
                            aggregate_type="incident",
                            aggregate_id=str(created_incident.id),
                            payload={
                                "incident_id": str(created_incident.id),
                                "incident_number": created_incident.incident_number,
                                "site_id": str(created_incident.site_id),
                                "title": created_incident.title,
                                "severity": created_incident.severity.value,
                                "status": created_incident.status.value,
                                "ts": datetime.now(timezone.utc).isoformat(),
                            },
                        )

                anomaly_alert = None
                if analysis and analysis.should_alert:
                    anomaly_alert = await self._create_anomaly_alert(normalized, analysis, outbox_repo, session)

                # Commit transaction
                await session.commit()

                # Acknowledge message in Redis stream
                await r.xack(KEY_STREAM_INGEST, self.group_name, msg_id)

                # 5. Cross-event correlation (after commit: never fails the reading itself)
                await self._correlate(normalized, triggered, anomaly_alert)

            except Exception as e:
                await session.rollback()
                logger.error(f"Processing failed for message {msg_id}: {e}", exc_info=True)
                await self._handle_failure(msg_id, fields, normalized, e)

    async def _create_anomaly_alert(self, reading, analysis, outbox_repo, session):
        try:
            site_uuid = uuid.UUID(reading["site_id"])
        except ValueError:
            return None
        try:
            sensor_uuid = uuid.UUID(reading["sensor_id"])
        except ValueError:
            sensor_uuid = None
        zone_uuid = uuid.UUID(reading["zone_id"]) if reading.get("zone_id") else None
        details = {
            **analysis.as_dict(),
            "method": "rolling_zscore",
            "window": settings.ANOMALY_WINDOW,
            "z_threshold": settings.ANOMALY_Z_THRESHOLD,
            "sensor_type": reading["type"],
            "unit": reading.get("unit"),
            "reading_ts": reading["ts"].isoformat(),
        }
        direction = "above" if (analysis.z_score or 0) > 0 else "below"
        alert = Alert(
            site_id=site_uuid,
            zone_id=zone_uuid,
            sensor_id=sensor_uuid,
            alert_type="anomaly",
            severity=AlertSeverity.WARNING,
            status=AlertStatus.ACTIVE,
            message=(
                f"Unusual {reading['type']} reading on sensor {reading['sensor_id']}: {reading['value']} {reading.get('unit', '')} "
                f"is {abs(analysis.z_score):.1f} standard deviations {direction} its recent average ({analysis.mean:.2f})"
            ),
            reading_value=reading["value"],
            details=details,
        )
        session.add(alert)
        await session.flush()
        await outbox_repo.add_event(
            event_type="alert:new",
            aggregate_type="alert",
            aggregate_id=str(alert.id),
            payload={
                "alert_id": str(alert.id),
                "site_id": str(site_uuid),
                "severity": "warning",
                "message": alert.message,
                "reading_value": reading["value"],
                "ts": datetime.now(timezone.utc).isoformat(),
            },
        )
        return alert

    async def _correlate(self, reading, triggered, anomaly_alert) -> None:
        events = [("sensor_threshold", item) for item in triggered]
        if anomaly_alert is not None:
            events.append(("anomaly", None))
        for event_type, item in events:
            try:
                await event_correlation_service.process_and_log(
                    event_type=event_type,
                    site_id=reading["site_id"],
                    payload={
                        "sensor_id": reading["sensor_id"],
                        "type": reading["type"],
                        "zone_id": reading.get("zone_id"),
                        "value": reading["value"],
                        "ts": reading["ts"].isoformat(),
                        "rule": item["rule"].name if item else None,
                    },
                    severity=(item["severity"].value if item else "warning"),
                )
            except Exception as e:
                logger.warning(f"Correlation step failed for {reading['sensor_id']}: {e}")

    def stop(self) -> None:
        self._running = False


stream_worker = StreamIngestWorker()
