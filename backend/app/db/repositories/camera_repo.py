import uuid
from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy import select, and_, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models.camera import Camera
from app.db.repositories.base import BaseRepository


class CameraRepository(BaseRepository[Camera]):
    def __init__(self, session: AsyncSession):
        super().__init__(Camera, session)

    async def get_by_id_active(self, camera_id: uuid.UUID) -> Optional[Camera]:
        query = select(Camera).where(
            and_(Camera.id == camera_id, Camera.deleted_at.is_(None))
        )
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def get_by_code(self, camera_code: str) -> Optional[Camera]:
        query = select(Camera).where(
            and_(Camera.camera_code == camera_code, Camera.deleted_at.is_(None))
        )
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def list_by_site(
        self,
        site_id: uuid.UUID,
        skip: int = 0,
        limit: int = 50,
        status: Optional[str] = None,
    ) -> List[Camera]:
        query = select(Camera).where(
            and_(Camera.site_id == site_id, Camera.deleted_at.is_(None))
        )
        if status:
            query = query.where(Camera.status == status)
        query = query.offset(skip).limit(limit).order_by(Camera.name.asc())
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def update_status(self, camera_id: uuid.UUID, status: str) -> None:
        await self.session.execute(
            update(Camera).where(Camera.id == camera_id).values(status=status)
        )
        await self.session.flush()

    async def update_last_frame(self, camera_id: uuid.UUID) -> None:
        await self.session.execute(
            update(Camera).where(Camera.id == camera_id).values(
                last_frame_at=datetime.now(timezone.utc)
            )
        )
        await self.session.flush()
