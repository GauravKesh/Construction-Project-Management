import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select, and_, update
from app.db.models.alert import Alert, AlertStatus, AlertSeverity
from app.db.models.notification import Notification
from app.db.models.outbox import OutboxEvent
from app.db.models.project import Site
from app.db.models.user import User, UserRole
from app.db.postgres import AsyncSessionLocal
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

    def start(self) -> None:
        if not self.scheduler.running:
            self.scheduler.start()
            logger.info("Background scheduler started (rollup, escalation, retention).")

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


scheduler_service = BackgroundSchedulerService()
