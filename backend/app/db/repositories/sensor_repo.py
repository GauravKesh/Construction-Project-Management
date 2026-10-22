import uuid
from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy import select, and_, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models.sensor import Sensor
from app.db.repositories.base import BaseRepository


class SensorRepository(BaseRepository[Sensor]):
    def __init__(self, session: AsyncSession):
        super().__init__(Sensor, session)

    async def get_by_id_active(self, sensor_id: uuid.UUID) -> Optional[Sensor]:
        query = select(Sensor).where(
            and_(Sensor.id == sensor_id, Sensor.deleted_at.is_(None))
        )
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def get_by_code(self, sensor_code: str) -> Optional[Sensor]:
        query = select(Sensor).where(
            and_(Sensor.sensor_code == sensor_code, Sensor.deleted_at.is_(None))
        )
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def list_by_site(
        self,
        site_id: uuid.UUID,
        skip: int = 0,
        limit: int = 50,
        sensor_type: Optional[str] = None,
        zone_id: Optional[uuid.UUID] = None,
        status: Optional[str] = None,
    ) -> List[Sensor]:
        query = select(Sensor).where(
            and_(Sensor.site_id == site_id, Sensor.deleted_at.is_(None))
        )
        if sensor_type:
            query = query.where(Sensor.sensor_type == sensor_type)
        if zone_id:
            query = query.where(Sensor.zone_id == zone_id)
        if status:
            query = query.where(Sensor.status == status)
        query = query.offset(skip).limit(limit).order_by(Sensor.name.asc())
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def update_telemetry_heartbeat(
        self, sensor_id: uuid.UUID, battery_level: Optional[float] = None
    ) -> None:
        values = {"last_seen_at": datetime.now(timezone.utc)}
        if battery_level is not None:
            values["battery_level"] = battery_level
        await self.session.execute(
            update(Sensor).where(Sensor.id == sensor_id).values(**values)
        )
        await self.session.flush()
