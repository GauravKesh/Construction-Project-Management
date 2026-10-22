import uuid
from typing import List, Optional
from shapely.geometry import shape, Point as ShapelyPoint
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models.project import Zone
from app.db.repositories.base import BaseRepository


class ZoneRepository(BaseRepository[Zone]):
    def __init__(self, session: AsyncSession):
        super().__init__(Zone, session)

    async def list_by_site(self, site_id: uuid.UUID) -> List[Zone]:
        query = select(Zone).where(Zone.site_id == site_id).order_by(Zone.name.asc())
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def find_zone_containing_point(
        self, site_id: uuid.UUID, longitude: float, latitude: float
    ) -> Optional[Zone]:
        """
        Finds the zone in a given site that contains the given [longitude, latitude] point.
        Uses Shapely for point-in-polygon check on GeoJSON geometries.
        """
        zones = await self.list_by_site(site_id)
        pt = ShapelyPoint(longitude, latitude)

        for z in zones:
            if z.polygon_geojson:
                try:
                    poly = shape(z.polygon_geojson)
                    if poly.contains(pt):
                        return z
                except Exception:
                    continue
        return None
