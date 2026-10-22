import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from sqlalchemy import select, func, and_, text
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models.incident import Incident, IncidentStatus, IncidentUpdate, IncidentAttachment
from app.db.models.rule import AlertSeverity
from app.db.repositories.base import BaseRepository


class IncidentRepository(BaseRepository[Incident]):
    def __init__(self, session: AsyncSession):
        super().__init__(Incident, session)

    async def get_by_id_with_relations(self, incident_id: uuid.UUID) -> Optional[Incident]:
        query = (
            select(Incident)
            .where(Incident.id == incident_id)
            .options(
                selectinload(Incident.updates),
                selectinload(Incident.attachments),
                selectinload(Incident.assigned_to_user),
            )
        )
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def generate_incident_number(self) -> str:
        year = datetime.now(timezone.utc).year
        count_q = select(func.count(Incident.id))
        count_res = await self.session.execute(count_q)
        total = (count_res.scalar() or 0) + 1
        return f"INC-{year}-{total:04d}"

    async def create_incident(
        self,
        site_id: uuid.UUID,
        title: str,
        description: str,
        severity: AlertSeverity = AlertSeverity.WARNING,
        zone_id: Optional[uuid.UUID] = None,
        alert_id: Optional[uuid.UUID] = None,
        assigned_to: Optional[uuid.UUID] = None,
        reported_by: Optional[uuid.UUID] = None,
    ) -> Incident:
        inc_number = await self.generate_incident_number()
        incident = Incident(
            incident_number=inc_number,
            site_id=site_id,
            zone_id=zone_id,
            alert_id=alert_id,
            title=title,
            description=description,
            severity=severity,
            status=IncidentStatus.OPEN,
            assigned_to=assigned_to,
            reported_by=reported_by,
        )
        self.session.add(incident)
        await self.session.flush()

        # Add initial timeline update
        initial_update = IncidentUpdate(
            incident_id=incident.id,
            user_id=reported_by,
            status_from=None,
            status_to=IncidentStatus.OPEN.value,
            comment=f"Incident {inc_number} reported.",
        )
        self.session.add(initial_update)
        await self.session.flush()

        return incident

    async def list_incidents(
        self,
        skip: int = 0,
        limit: int = 50,
        site_id: Optional[uuid.UUID] = None,
        status: Optional[IncidentStatus] = None,
        severity: Optional[AlertSeverity] = None,
        assigned_to: Optional[uuid.UUID] = None,
    ) -> List[Incident]:
        query = select(Incident)
        if site_id:
            query = query.where(Incident.site_id == site_id)
        if status:
            query = query.where(Incident.status == status)
        if severity:
            query = query.where(Incident.severity == severity)
        if assigned_to:
            query = query.where(Incident.assigned_to == assigned_to)

        query = query.offset(skip).limit(limit).order_by(Incident.created_at.desc())
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def update_status(
        self,
        incident_id: uuid.UUID,
        new_status: IncidentStatus,
        user_id: Optional[uuid.UUID] = None,
        comment: str = "",
        resolution_notes: Optional[str] = None,
    ) -> Optional[Incident]:
        incident = await self.get_by_id(incident_id)
        if not incident:
            return None

        old_status = incident.status.value if hasattr(incident.status, "value") else str(incident.status)
        incident.status = new_status
        now = datetime.now(timezone.utc)

        if new_status == IncidentStatus.RESOLVED:
            incident.resolved_at = now
            if resolution_notes:
                incident.resolution_notes = resolution_notes
        elif new_status == IncidentStatus.CLOSED:
            incident.closed_at = now

        # Create update entry
        update_entry = IncidentUpdate(
            incident_id=incident.id,
            user_id=user_id,
            status_from=old_status,
            status_to=new_status.value,
            comment=comment or f"Status changed to {new_status.value}",
        )
        self.session.add(update_entry)
        await self.session.flush()
        return incident

    async def assign_incident(
        self,
        incident_id: uuid.UUID,
        assignee_id: uuid.UUID,
        actor_id: Optional[uuid.UUID] = None,
    ) -> Optional[Incident]:
        incident = await self.get_by_id(incident_id)
        if not incident:
            return None

        incident.assigned_to = assignee_id
        update_entry = IncidentUpdate(
            incident_id=incident.id,
            user_id=actor_id,
            comment=f"Assigned incident to user {assignee_id}",
        )
        self.session.add(update_entry)
        await self.session.flush()
        return incident

    async def add_attachment(
        self,
        incident_id: uuid.UUID,
        file_name: str,
        file_key: str,
        file_size: int,
        content_type: str,
    ) -> IncidentAttachment:
        att = IncidentAttachment(
            incident_id=incident_id,
            file_name=file_name,
            file_key=file_key,
            file_size=file_size,
            content_type=content_type,
        )
        self.session.add(att)
        await self.session.flush()
        return att

    async def get_stats(self, site_id: Optional[uuid.UUID] = None) -> Dict[str, Any]:
        base_filter = [Incident.site_id == site_id] if site_id else []

        status_q = (
            select(Incident.status, func.count(Incident.id))
            .where(*base_filter)
            .group_by(Incident.status)
        )
        status_res = await self.session.execute(status_q)
        by_status = {row[0].value if hasattr(row[0], "value") else str(row[0]): row[1] for row in status_res.all()}

        sev_q = (
            select(Incident.severity, func.count(Incident.id))
            .where(*base_filter)
            .group_by(Incident.severity)
        )
        sev_res = await self.session.execute(sev_q)
        by_severity = {row[0].value if hasattr(row[0], "value") else str(row[0]): row[1] for row in sev_res.all()}

        total = sum(by_status.values())
        open_count = by_status.get("open", 0) + by_status.get("acknowledged", 0) + by_status.get("investigating", 0)
        resolved_count = by_status.get("resolved", 0) + by_status.get("closed", 0)

        return {
            "total": total,
            "open": open_count,
            "resolved": resolved_count,
            "by_status": by_status,
            "by_severity": by_severity,
        }

    async def search(self, search_text: str, site_id: Optional[uuid.UUID] = None, limit: int = 20) -> List[Incident]:
        sql = text("""
            SELECT id,
                   ts_rank(tsv_search, plainto_tsquery('english', :q)) AS rank
            FROM incidents
            WHERE tsv_search @@ plainto_tsquery('english', :q)
              AND (cast(:site_id as uuid) IS NULL OR site_id = cast(:site_id as uuid))
            ORDER BY rank DESC, created_at DESC
            LIMIT :limit
        """)
        result = await self.session.execute(sql, {"q": search_text, "site_id": site_id, "limit": limit})
        rows = result.mappings().all()

        inc_ids = [row["id"] for row in rows]
        if not inc_ids:
            return []
        q = select(Incident).where(Incident.id.in_(inc_ids))
        res = await self.session.execute(q)
        items = {i.id: i for i in res.scalars().all()}
        return [items[iid] for iid in inc_ids if iid in items]
