import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from sqlalchemy import select, func, and_, desc, text
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models.alert import Alert, AlertStatus, AlertSeverity
from app.db.repositories.base import BaseRepository


class AlertRepository(BaseRepository[Alert]):
    def __init__(self, session: AsyncSession):
        super().__init__(Alert, session)

    async def list_alerts(
        self,
        skip: int = 0,
        limit: int = 50,
        site_id: Optional[uuid.UUID] = None,
        status: Optional[AlertStatus] = None,
        severity: Optional[AlertSeverity] = None,
        from_ts: Optional[datetime] = None,
        to_ts: Optional[datetime] = None,
    ) -> List[Alert]:
        query = select(Alert)
        if site_id:
            query = query.where(Alert.site_id == site_id)
        if status:
            query = query.where(Alert.status == status)
        if severity:
            query = query.where(Alert.severity == severity)
        if from_ts:
            query = query.where(Alert.created_at >= from_ts)
        if to_ts:
            query = query.where(Alert.created_at <= to_ts)

        query = query.offset(skip).limit(limit).order_by(Alert.created_at.desc())
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def acknowledge(self, alert_id: uuid.UUID, user_id: uuid.UUID) -> Optional[Alert]:
        alert = await self.get_by_id(alert_id)
        if not alert:
            return None
        alert.status = AlertStatus.ACKNOWLEDGED
        alert.acknowledged_at = datetime.now(timezone.utc)
        alert.acknowledged_by = user_id
        await self.session.flush()
        return alert

    async def resolve(self, alert_id: uuid.UUID, user_id: uuid.UUID) -> Optional[Alert]:
        alert = await self.get_by_id(alert_id)
        if not alert:
            return None
        alert.status = AlertStatus.RESOLVED
        alert.resolved_at = datetime.now(timezone.utc)
        alert.resolved_by = user_id
        await self.session.flush()
        return alert

    async def get_stats(self, site_id: Optional[uuid.UUID] = None) -> Dict[str, Any]:
        base_filter = [Alert.site_id == site_id] if site_id else []

        # Count by status
        status_q = (
            select(Alert.status, func.count(Alert.id))
            .where(*base_filter)
            .group_by(Alert.status)
        )
        status_res = await self.session.execute(status_q)
        by_status = {row[0].value if hasattr(row[0], "value") else str(row[0]): row[1] for row in status_res.all()}

        # Count by severity
        sev_q = (
            select(Alert.severity, func.count(Alert.id))
            .where(*base_filter)
            .group_by(Alert.severity)
        )
        sev_res = await self.session.execute(sev_q)
        by_severity = {row[0].value if hasattr(row[0], "value") else str(row[0]): row[1] for row in sev_res.all()}

        total = sum(by_status.values())
        active = by_status.get("active", 0)

        return {
            "total": total,
            "active": active,
            "acknowledged": by_status.get("acknowledged", 0),
            "resolved": by_status.get("resolved", 0),
            "by_severity": by_severity,
        }

    async def search(self, search_text: str, site_id: Optional[uuid.UUID] = None, limit: int = 20) -> List[Alert]:
        """
        PostgreSQL full-text search on alerts(tsv_message).
        """
        sql = text("""
            SELECT id, site_id, zone_id, rule_id, sensor_id, camera_id, alert_type, severity, status, message, reading_value, threshold_value, details, created_at, updated_at,
                   ts_rank(tsv_message, plainto_tsquery('english', :q)) AS rank
            FROM alerts
            WHERE tsv_message @@ plainto_tsquery('english', :q)
              AND (cast(:site_id as uuid) IS NULL OR site_id = cast(:site_id as uuid))
            ORDER BY rank DESC, created_at DESC
            LIMIT :limit
        """)
        result = await self.session.execute(sql, {"q": search_text, "site_id": site_id, "limit": limit})
        rows = result.mappings().all()

        alert_ids = [row["id"] for row in rows]
        if not alert_ids:
            return []
        q = select(Alert).where(Alert.id.in_(alert_ids))
        res = await self.session.execute(q)
        items = {a.id: a for a in res.scalars().all()}
        # Preserve rank order
        return [items[aid] for aid in alert_ids if aid in items]
