import uuid
from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models.project_data import ProjectSchedule, BoqItem, Manpower, Material, Drawing


class ProjectDataRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    # Schedules
    async def add_schedule_item(self, **kwargs) -> ProjectSchedule:
        item = ProjectSchedule(**kwargs)
        self.session.add(item)
        await self.session.flush()
        return item

    async def list_schedules(self, project_id: uuid.UUID) -> List[ProjectSchedule]:
        query = select(ProjectSchedule).where(ProjectSchedule.project_id == project_id).order_by(ProjectSchedule.start_date.asc())
        res = await self.session.execute(query)
        return list(res.scalars().all())

    async def get_schedule_item(self, schedule_id: uuid.UUID) -> Optional[ProjectSchedule]:
        query = select(ProjectSchedule).where(ProjectSchedule.id == schedule_id)
        res = await self.session.execute(query)
        return res.scalar_one_or_none()

    async def update_schedule_item(self, schedule_id: uuid.UUID, **kwargs) -> Optional[ProjectSchedule]:
        item = await self.get_schedule_item(schedule_id)
        if not item:
            return None
        for k, v in kwargs.items():
            if hasattr(item, k) and v is not None:
                setattr(item, k, v)
        await self.session.flush()
        return item

    async def delete_schedule_item(self, schedule_id: uuid.UUID) -> bool:
        item = await self.get_schedule_item(schedule_id)
        if not item:
            return False
        await self.session.delete(item)
        await self.session.flush()
        return True

    # BOQ
    async def add_boq_item(self, **kwargs) -> BoqItem:
        item = BoqItem(**kwargs)
        self.session.add(item)
        await self.session.flush()
        return item

    async def list_boq(self, project_id: uuid.UUID) -> List[BoqItem]:
        query = select(BoqItem).where(BoqItem.project_id == project_id).order_by(BoqItem.item_code.asc())
        res = await self.session.execute(query)
        return list(res.scalars().all())

    # Manpower
    async def add_manpower(self, **kwargs) -> Manpower:
        item = Manpower(**kwargs)
        self.session.add(item)
        await self.session.flush()
        return item

    async def list_manpower(self, project_id: uuid.UUID) -> List[Manpower]:
        query = select(Manpower).where(Manpower.project_id == project_id).order_by(Manpower.date.desc())
        res = await self.session.execute(query)
        return list(res.scalars().all())

    # Materials
    async def add_material(self, **kwargs) -> Material:
        item = Material(**kwargs)
        self.session.add(item)
        await self.session.flush()
        return item

    async def list_materials(self, project_id: uuid.UUID) -> List[Material]:
        query = select(Material).where(Material.project_id == project_id).order_by(Material.name.asc())
        res = await self.session.execute(query)
        return list(res.scalars().all())

    # Drawings
    async def add_drawing(self, **kwargs) -> Drawing:
        item = Drawing(**kwargs)
        self.session.add(item)
        await self.session.flush()
        return item

    async def get_drawing(self, drawing_id: uuid.UUID) -> Optional[Drawing]:
        query = select(Drawing).where(Drawing.id == drawing_id)
        res = await self.session.execute(query)
        return res.scalar_one_or_none()

    async def list_drawings(self, project_id: uuid.UUID) -> List[Drawing]:
        query = select(Drawing).where(Drawing.project_id == project_id).order_by(Drawing.created_at.desc())
        res = await self.session.execute(query)
        return list(res.scalars().all())
