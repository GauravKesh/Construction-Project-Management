import uuid
from typing import Any, Dict, List, Optional
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models.audit import AuditLog
from app.db.repositories.base import BaseRepository


class AuditRepository(BaseRepository[AuditLog]):
    def __init__(self, session: AsyncSession):
        super().__init__(AuditLog, session)

    async def record(
        self,
        action: str,
        entity_type: str,
        entity_id: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        user_id: Optional[uuid.UUID] = None,
        ip_address: Optional[str] = None,
    ) -> AuditLog:
        log = AuditLog(
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            details=details or {},
            user_id=user_id,
            ip_address=ip_address,
        )
        self.session.add(log)
        await self.session.flush()
        return log

    async def list_logs(
        self,
        skip: int = 0,
        limit: int = 50,
        entity_type: Optional[str] = None,
        entity_id: Optional[str] = None,
        user_id: Optional[uuid.UUID] = None,
    ) -> List[AuditLog]:
        query = select(AuditLog)
        if entity_type:
            query = query.where(AuditLog.entity_type == entity_type)
        if entity_id:
            query = query.where(AuditLog.entity_id == entity_id)
        if user_id:
            query = query.where(AuditLog.user_id == user_id)
        query = query.offset(skip).limit(limit).order_by(AuditLog.created_at.desc())
        res = await self.session.execute(query)
        return list(res.scalars().all())

    async def search(self, search_text: str, limit: int = 20) -> List[AuditLog]:
        sql = text("""
            SELECT id,
                   ts_rank(tsv_details, plainto_tsquery('english', :q)) AS rank
            FROM audit_logs
            WHERE tsv_details @@ plainto_tsquery('english', :q)
            ORDER BY rank DESC, created_at DESC
            LIMIT :limit
        """)
        result = await self.session.execute(sql, {"q": search_text, "limit": limit})
        rows = result.mappings().all()

        log_ids = [row["id"] for row in rows]
        if not log_ids:
            return []
        q = select(AuditLog).where(AuditLog.id.in_(log_ids))
        res = await self.session.execute(q)
        items = {l.id: l for l in res.scalars().all()}
        return [items[lid] for lid in log_ids if lid in items]
