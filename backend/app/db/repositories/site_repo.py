import uuid
from typing import Any, Dict, List, Optional
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models.project import Site, Zone
from app.db.models.sensor import Sensor
from app.db.models.camera import Camera
from app.db.repositories.base import BaseRepository


class SiteRepository(BaseRepository[Site]):
    def __init__(self, session: AsyncSession):
        super().__init__(Site, session)

    async def get_by_id_active(self, site_id: uuid.UUID) -> Optional[Site]:
        query = select(Site).where(
            and_(Site.id == site_id, Site.deleted_at.is_(None))
        )
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def list_by_project(
        self,
        project_id: uuid.UUID,
        skip: int = 0,
        limit: int = 50,
        status: Optional[str] = None,
    ) -> List[Site]:
        query = select(Site).where(
            and_(Site.project_id == project_id, Site.deleted_at.is_(None))
        )
        if status:
            query = query.where(Site.status == status)
        query = query.offset(skip).limit(limit).order_by(Site.created_at.desc())
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def get_site_map_data(self, site_id: uuid.UUID) -> Optional[Dict[str, Any]]:
        """
        Assembles GeoJSON FeatureCollection for site boundary, zones, sensors and cameras.
        """
        site = await self.get_by_id_active(site_id)
        if not site:
            return None

        # Fetch active zones, sensors, cameras
        zones_res = await self.session.execute(select(Zone).where(Zone.site_id == site_id))
        zones = zones_res.scalars().all()

        sensors_res = await self.session.execute(
            select(Sensor).where(and_(Sensor.site_id == site_id, Sensor.deleted_at.is_(None)))
        )
        sensors = sensors_res.scalars().all()

        cameras_res = await self.session.execute(
            select(Camera).where(and_(Camera.site_id == site_id, Camera.deleted_at.is_(None)))
        )
        cameras = cameras_res.scalars().all()

        features = []

        # Site boundary feature
        if site.boundary_geojson:
            features.append({
                "type": "Feature",
                "id": str(site.id),
                "geometry": site.boundary_geojson,
                "properties": {
                    "layer": "site_boundary",
                    "name": site.name,
                    "code": site.code,
                    "status": site.status,
                },
            })

        # Zone features
        for z in zones:
            if z.polygon_geojson:
                features.append({
                    "type": "Feature",
                    "id": str(z.id),
                    "geometry": z.polygon_geojson,
                    "properties": {
                        "layer": "zone",
                        "name": z.name,
                        "zone_type": z.zone_type,
                        "risk_level": z.risk_level,
                    },
                })

        # Sensor features
        for s in sensors:
            if s.location_geojson:
                features.append({
                    "type": "Feature",
                    "id": str(s.id),
                    "geometry": s.location_geojson,
                    "properties": {
                        "layer": "sensor",
                        "zone_id": str(s.zone_id) if s.zone_id else None,
                        "name": s.name,
                        "code": s.sensor_code,
                        "sensor_type": s.sensor_type,
                        "unit": s.unit,
                        "min_threshold": s.min_threshold,
                        "max_threshold": s.max_threshold,
                        "status": s.status,
                        "battery_level": s.battery_level,
                    },
                })

        # Camera features
        for c in cameras:
            if c.location_geojson:
                features.append({
                    "type": "Feature",
                    "id": str(c.id),
                    "geometry": c.location_geojson,
                    "properties": {
                        "layer": "camera",
                        "zone_id": str(c.zone_id) if c.zone_id else None,
                        "name": c.name,
                        "code": c.camera_code,
                        "stream_url": c.stream_url,
                        "status": c.status,
                        "fps": c.fps,
                        "is_cv_enabled": c.is_cv_enabled,
                    },
                })

        return {
            "type": "FeatureCollection",
            "site_id": str(site.id),
            "site_name": site.name,
            "center": [site.latitude, site.longitude] if site.latitude and site.longitude else None,
            "features": features,
        }
