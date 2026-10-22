import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models.outbox import OutboxEvent
from app.db.repositories.base import BaseRepository


class OutboxRepository(BaseRepository[OutboxEvent]):
    def __init__(self, session: AsyncSession):
        super().__init__(OutboxEvent, session)

    async def add_event(
        self,
        event_type: str,
        aggregate_type: str,
        aggregate_id: str,
        payload: Dict[str, Any],
    ) -> OutboxEvent:
        event = OutboxEvent(
            event_type=event_type,
            aggregate_type=aggregate_type,
            aggregate_id=aggregate_id,
            payload=payload,
            status="pending",
        )
        self.session.add(event)
        await self.session.flush()
        return event

    async def fetch_pending(self, limit: int = 100) -> List[OutboxEvent]:
        query = (
            select(OutboxEvent)
            .where(OutboxEvent.status == "pending")
            .order_by(OutboxEvent.created_at.asc())
            .limit(limit)
        )
        res = await self.session.execute(query)
        return list(res.scalars().all())

    async def mark_published(self, event_id: uuid.UUID) -> None:
        event = await self.get_by_id(event_id)
        if event:
            event.status = "published"
            event.published_at = datetime.now(timezone.utc)
            await self.session.flush()

    async def mark_failed(self, event_id: uuid.UUID) -> None:
        event = await self.get_by_id(event_id)
        if event:
            event.retry_count += 1
            if event.retry_count >= 5:
                event.status = "failed"
            await self.session.flush()
