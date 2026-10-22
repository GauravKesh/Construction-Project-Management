import uuid
from typing import List, Optional
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models.rule import Rule
from app.db.repositories.base import BaseRepository


class RuleRepository(BaseRepository[Rule]):
    def __init__(self, session: AsyncSession):
        super().__init__(Rule, session)

    async def list_active_rules_for_sensor(
        self, sensor_type: str, site_id: uuid.UUID, zone_id: Optional[uuid.UUID] = None
    ) -> List[Rule]:
        """
        Retrieves enabled rules matching sensor_type and scoped to the site (or global)
        and matching the zone (or site-wide).
        """
        site_filter = or_(Rule.site_id == site_id, Rule.site_id.is_(None))
        if zone_id:
            zone_filter = or_(Rule.zone_id == zone_id, Rule.zone_id.is_(None))
        else:
            zone_filter = Rule.zone_id.is_(None)

        query = select(Rule).where(
            and_(
                Rule.is_enabled.is_(True),
                Rule.sensor_type == sensor_type,
                site_filter,
                zone_filter,
            )
        )
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def list_rules(
        self,
        skip: int = 0,
        limit: int = 50,
        site_id: Optional[uuid.UUID] = None,
        sensor_type: Optional[str] = None,
        is_enabled: Optional[bool] = None,
    ) -> List[Rule]:
        query = select(Rule)
        if site_id:
            query = query.where(or_(Rule.site_id == site_id, Rule.site_id.is_(None)))
        if sensor_type:
            query = query.where(Rule.sensor_type == sensor_type)
        if is_enabled is not None:
            query = query.where(Rule.is_enabled == is_enabled)
        query = query.offset(skip).limit(limit).order_by(Rule.created_at.desc())
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def toggle(self, rule_id: uuid.UUID) -> Optional[Rule]:
        rule = await self.get_by_id(rule_id)
        if not rule:
            return None
        rule.is_enabled = not rule.is_enabled
        await self.session.flush()
        return rule
