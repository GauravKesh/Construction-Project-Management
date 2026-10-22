import uuid
from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy import select, update, and_
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models.notification import Notification, DeviceToken
from app.db.repositories.base import BaseRepository


class NotificationRepository(BaseRepository[Notification]):
    def __init__(self, session: AsyncSession):
        super().__init__(Notification, session)

    async def list_for_user(
        self,
        user_id: uuid.UUID,
        skip: int = 0,
        limit: int = 50,
        unread_only: bool = False,
    ) -> List[Notification]:
        query = select(Notification).where(Notification.user_id == user_id)
        if unread_only:
            query = query.where(Notification.read_at.is_(None))
        query = query.offset(skip).limit(limit).order_by(Notification.created_at.desc())
        res = await self.session.execute(query)
        return list(res.scalars().all())

    async def mark_as_read(self, notification_id: uuid.UUID, user_id: uuid.UUID) -> Optional[Notification]:
        notif = await self.get_by_id(notification_id)
        if not notif or notif.user_id != user_id:
            return None
        notif.read_at = datetime.now(timezone.utc)
        await self.session.flush()
        return notif

    async def mark_all_as_read(self, user_id: uuid.UUID) -> int:
        now = datetime.now(timezone.utc)
        stmt = (
            update(Notification)
            .where(and_(Notification.user_id == user_id, Notification.read_at.is_(None)))
            .values(read_at=now)
        )
        res = await self.session.execute(stmt)
        await self.session.flush()
        return res.rowcount

    async def register_device(self, user_id: uuid.UUID, token: str, platform: str = "web") -> DeviceToken:
        query = select(DeviceToken).where(DeviceToken.token == token)
        res = await self.session.execute(query)
        dev = res.scalar_one_or_none()
        if dev:
            dev.user_id = user_id
            dev.platform = platform
        else:
            dev = DeviceToken(user_id=user_id, token=token, platform=platform)
            self.session.add(dev)
        await self.session.flush()
        return dev

    async def get_device_tokens_for_user(self, user_id: uuid.UUID) -> List[str]:
        query = select(DeviceToken.token).where(DeviceToken.user_id == user_id)
        res = await self.session.execute(query)
        return list(res.scalars().all())
