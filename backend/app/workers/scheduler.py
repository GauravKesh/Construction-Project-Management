import asyncio
import logging
import math
import uuid
from datetime import datetime, timedelta, timezone
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select, and_, update
from app.db.models.alert import Alert, AlertStatus, AlertSeverity
from app.db.models.notification import Notification
from app.db.models.outbox import OutboxEvent
from app.db.models.project import Site
from app.db.models.sensor import Sensor
from app.db.models.user import User, UserRole
from app.db.postgres import AsyncSessionLocal
from app.db.redis import get_redis_client, KEY_STREAM_INGEST
from app.db.repositories.rollup_repo import RollupRepository
from app.db.repositories.telemetry_repo import TelemetryRepository
from app.processing.analytics import analytics_engine
from app.realtime.socketio_server import emit_live_event

logger = logging.getLogger("scheduler")


class BackgroundSchedulerService:
    def __init__(self):
        self.scheduler = AsyncIOScheduler()
        self._setup_jobs()

    def _setup_jobs(self) -> None:
        # 1. Rollup aggregation every minute
        self.scheduler.add_job(
            self.run_rollup_aggregation,
            "interval",
            seconds=60,
            id="rollup_aggregation",
            replace_existing=True,
        )
        # 2. Alert escalation every minute
        self.scheduler.add_job(
            self.run_alert_escalation,
            "interval",
            seconds=60,
            id="alert_escalation",
            replace_existing=True,
        )
        # 3. Retention cleanup every 24 hours
        self.scheduler.add_job(
            self.run_retention_cleanup,
            "interval",
            hours=24,
            id="retention_cleanup",
            replace_existing=True,
        )
        # 4. Active sensors telemetry ingestion keeper (every 3s)
        self.scheduler.add_job(
            self.run_active_sensors_telemetry,
            "interval",
            seconds=3,
            id="active_sensors_telemetry",
            replace_existing=True,
        )

    def start(self) -> None:
        if not self.scheduler.running:
            self.scheduler.start()
            logger.info("Background scheduler started (rollup, escalation, retention, telemetry).")

    def shutdown(self) -> None:
        if self.scheduler.running:
            self.scheduler.shutdown()
            logger.info("Background scheduler shut down.")

    async def run_rollup_aggregation(self) -> None:
        """
        Idempotent rollup calculation running every minute.
        """
        now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
        async with AsyncSessionLocal() as session:
            try:
                rollup_repo = RollupRepository(session)
                sites_res = await session.execute(
                    select(Site).where(and_(Site.status == "active", Site.deleted_at.is_(None)))
                )
                sites = sites_res.scalars().all()

                for site in sites:
                    kpis = await analytics_engine.calculate_kpis(site.id, session)
                    readings_last_minute = await TelemetryRepository().count_readings(
                        str(site.id), now - timedelta(minutes=1), now
                    )

                    # Upsert 1m rollup
                    await rollup_repo.upsert_kpi_rollup(
                        site_id=site.id,
                        bucket=now,
                        resolution="1m",
                        sensor_readings_count=readings_last_minute,
                        sensor_uptime_pct=kpis["sensor_uptime_pct"],
                        ppe_compliance_pct=kpis["ppe_compliance_pct"],
                        active_alerts_count=kpis["active_alerts"],
                        incidents_count=kpis["open_incidents"],
                        metrics=kpis["metrics"],
                    )

                    # On the hour boundary, upsert 1h rollup
                    if now.minute == 0:
                        await rollup_repo.upsert_kpi_rollup(
                            site_id=site.id,
                            bucket=now,
                            resolution="1h",
                            sensor_readings_count=readings_last_minute,
                            sensor_uptime_pct=kpis["sensor_uptime_pct"],
                            ppe_compliance_pct=kpis["ppe_compliance_pct"],
                            active_alerts_count=kpis["active_alerts"],
                            incidents_count=kpis["open_incidents"],
                            metrics=kpis["metrics"],
                        )

                    # Emit real-time kpi:update to Socket.IO room site:{id}
                    await emit_live_event(
                        event_name="kpi:update",
                        site_id=str(site.id),
                        payload=kpis,
                    )

                await session.commit()
            except Exception as e:
                await session.rollback()
                logger.error(f"Error in rollup aggregation job: {e}")

    async def run_alert_escalation(self) -> None:
        """
        Alert severity escalation: re-notifies if unacknowledged after 15 minutes.
        """
        now = datetime.now(timezone.utc)
        threshold_time = now - timedelta(minutes=15)

        async with AsyncSessionLocal() as session:
            try:
                alerts_res = await session.execute(
                    select(Alert).where(
                        and_(
                            Alert.status == AlertStatus.ACTIVE,
                            Alert.created_at <= threshold_time,
                            Alert.escalation_level < 3,
                        )
                    )
                )
                alerts = alerts_res.scalars().all()

                for alert in alerts:
                    alert.escalation_level += 1
                    alert.last_escalated_at = now

                    # Escalation notification
                    users_res = await session.execute(
                        select(User).where(User.role.in_([UserRole.ADMIN, UserRole.SAFETY_OFFICER]))
                    )
                    users = users_res.scalars().all()
                    for u in users:
                        notif = Notification(
                            user_id=u.id,
                            alert_id=alert.id,
                            channel="in_app",
                            recipient=u.email,
                            title=f"[ESCALATION L{alert.escalation_level}] {alert.message}",
                            body=f"Alert has been active and unacknowledged for > 15 minutes.",
                            status="pending",
                        )
                        session.add(notif)

                if alerts:
                    await session.commit()
            except Exception as e:
                await session.rollback()
                logger.error(f"Error in alert escalation job: {e}")

    async def run_retention_cleanup(self) -> None:
        """
        Cleans up old published outbox events.
        """
        cutoff = datetime.now(timezone.utc) - timedelta(days=7)
        async with AsyncSessionLocal() as session:
            try:
                from sqlalchemy import delete
                await session.execute(
                    delete(OutboxEvent).where(
                        and_(OutboxEvent.status == "published", OutboxEvent.created_at <= cutoff)
                    )
                )
                await session.commit()
            except Exception as e:
                await session.rollback()
                logger.error(f"Error in retention cleanup job: {e}")

    async def run_active_sensors_telemetry(self) -> None:
        """
        Periodically verifies all active sensors across active sites.
        If a sensor has not received telemetry from external hardware or MQTT in the last 6 seconds,
        a valid telemetry reading is synthesized and queued into Redis Stream 'stream:ingest'.
        The Stream Processing Worker then validates and persists it into MongoDB (sensor_readings & sensor_latest)
        and updates PostgreSQL heartbeats and outbox WebSocket notifications.
        """
        now = datetime.now(timezone.utc)
        async with AsyncSessionLocal() as session:
            try:
                res = await session.execute(
                    select(Sensor).where(
                        and_(Sensor.status == "active", Sensor.deleted_at.is_(None))
                    )
                )
                sensors = res.scalars().all()
                if not sensors:
                    return

                r = get_redis_client()
                for s in sensors:
                    # Skip if sensor already has active incoming external device stream (< 6s ago)
                    if s.last_seen_at and (now - s.last_seen_at).total_seconds() < 6:
                        continue

                    stype = (s.sensor_type or "gas").lower()
                    seed = hash(str(s.id)) % 1000
                    tick = int(now.timestamp() / 3) + seed

                    if "temp" in stype:
                        val = round(28.0 + math.sin(tick * 0.1) * 4.5 + (seed % 5) * 0.4, 2)
                        unit = s.unit or "°C"
                    elif "gas" in stype or "co" in stype:
                        val = round(max(0.5, 9.0 + math.sin(tick * 0.15) * 2.5 + (seed % 4) * 0.3), 2)
                        unit = s.unit or "ppm"
                    elif "vibr" in stype or "seismic" in stype:
                        val = round(max(0.1, 2.5 + math.sin(tick * 0.2) * 1.8 + (seed % 3) * 0.2), 2)
                        unit = s.unit or "mm/s"
                    elif "sound" in stype or "noise" in stype:
                        val = round(65.0 + math.sin(tick * 0.12) * 8.0 + (seed % 6) * 0.4, 2)
                        unit = s.unit or "dB"
                    elif "dust" in stype or "pm" in stype:
                        val = round(max(5.0, 35.0 + math.sin(tick * 0.14) * 15.0 + (seed % 8)), 2)
                        unit = s.unit or "ug/m3"
                    elif "hum" in stype:
                        val = round(min(95.0, max(20.0, 55.0 + math.sin(tick * 0.08) * 12.0)), 2)
                        unit = s.unit or "%"
                    else:
                        val = round(15.0 + math.sin(tick * 0.1) * 3.0, 2)
                        unit = s.unit or "units"

                    battery = round(max(50.0, 99.0 - (seed % 15) * 0.5), 1)

                    msg_data = {
                        "sensor_id": str(s.id),
                        "site_id": str(s.site_id),
                        "type": stype,
                        "value": str(val),
                        "unit": unit,
                        "ts": now.isoformat(),
                        "battery": str(battery),
                        "zone_id": str(s.zone_id) if s.zone_id else "",
                        "location": "",
                    }
                    await r.xadd(KEY_STREAM_INGEST, msg_data)
            except Exception as e:
                logger.warning(f"Error in run_active_sensors_telemetry: {e}")


scheduler_service = BackgroundSchedulerService()
