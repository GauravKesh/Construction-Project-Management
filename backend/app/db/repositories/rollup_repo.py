import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from sqlalchemy import select, and_
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models.rollup import KpiRollup, AlertCountTs, PPEComplianceTs, ReportMetadata


class RollupRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def upsert_kpi_rollup(
        self,
        site_id: uuid.UUID,
        bucket: datetime,
        resolution: str,
        sensor_readings_count: int,
        sensor_uptime_pct: Optional[float],
        ppe_compliance_pct: Optional[float],
        active_alerts_count: int,
        incidents_count: int,
        metrics: Optional[Dict[str, Any]] = None,
    ) -> KpiRollup:
        stmt = insert(KpiRollup).values(
            site_id=site_id,
            bucket=bucket,
            resolution=resolution,
            sensor_readings_count=sensor_readings_count,
            sensor_uptime_pct=sensor_uptime_pct,
            ppe_compliance_pct=ppe_compliance_pct,
            active_alerts_count=active_alerts_count,
            incidents_count=incidents_count,
            metrics=metrics or {},
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=["site_id", "resolution", "bucket"],
            set_={
                "sensor_readings_count": stmt.excluded.sensor_readings_count,
                "sensor_uptime_pct": stmt.excluded.sensor_uptime_pct,
                "ppe_compliance_pct": stmt.excluded.ppe_compliance_pct,
                "active_alerts_count": stmt.excluded.active_alerts_count,
                "incidents_count": stmt.excluded.incidents_count,
                "metrics": stmt.excluded.metrics,
            },
        ).returning(KpiRollup).execution_options(populate_existing=True)

        res = await self.session.execute(stmt)
        await self.session.flush()
        return res.scalar_one()

    async def get_kpi_rollups(
        self,
        site_id: uuid.UUID,
        resolution: str = "1h",
        from_ts: Optional[datetime] = None,
        to_ts: Optional[datetime] = None,
    ) -> List[KpiRollup]:
        query = select(KpiRollup).where(
            and_(KpiRollup.site_id == site_id, KpiRollup.resolution == resolution)
        )
        if from_ts:
            query = query.where(KpiRollup.bucket >= from_ts)
        if to_ts:
            query = query.where(KpiRollup.bucket <= to_ts)
        query = query.order_by(KpiRollup.bucket.asc())
        res = await self.session.execute(query)
        return list(res.scalars().all())

    async def upsert_alert_count(
        self,
        site_id: uuid.UUID,
        bucket: datetime,
        resolution: str,
        severity: str,
        count: int,
    ) -> AlertCountTs:
        stmt = insert(AlertCountTs).values(
            site_id=site_id,
            bucket=bucket,
            resolution=resolution,
            severity=severity,
            count=count,
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=["site_id", "resolution", "severity", "bucket"],
            set_={"count": stmt.excluded.count},
        ).returning(AlertCountTs).execution_options(populate_existing=True)
        res = await self.session.execute(stmt)
        await self.session.flush()
        return res.scalar_one()

    async def get_alert_trends(
        self,
        site_id: uuid.UUID,
        resolution: str = "1h",
        from_ts: Optional[datetime] = None,
        to_ts: Optional[datetime] = None,
    ) -> List[AlertCountTs]:
        query = select(AlertCountTs).where(
            and_(AlertCountTs.site_id == site_id, AlertCountTs.resolution == resolution)
        )
        if from_ts:
            query = query.where(AlertCountTs.bucket >= from_ts)
        if to_ts:
            query = query.where(AlertCountTs.bucket <= to_ts)
        query = query.order_by(AlertCountTs.bucket.asc())
        res = await self.session.execute(query)
        return list(res.scalars().all())

    async def upsert_ppe_compliance(
        self,
        site_id: uuid.UUID,
        camera_id: Optional[uuid.UUID],
        bucket: datetime,
        resolution: str,
        total_detections: int,
        compliant_detections: int,
        compliance_rate: float,
    ) -> PPEComplianceTs:
        stmt = insert(PPEComplianceTs).values(
            site_id=site_id,
            camera_id=camera_id,
            bucket=bucket,
            resolution=resolution,
            total_detections=total_detections,
            compliant_detections=compliant_detections,
            compliance_rate=compliance_rate,
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=["site_id", "camera_id", "resolution", "bucket"],
            set_={
                "total_detections": stmt.excluded.total_detections,
                "compliant_detections": stmt.excluded.compliant_detections,
                "compliance_rate": stmt.excluded.compliance_rate,
            },
        ).returning(PPEComplianceTs).execution_options(populate_existing=True)
        res = await self.session.execute(stmt)
        await self.session.flush()
        return res.scalar_one()

    async def get_ppe_trends(
        self,
        site_id: uuid.UUID,
        resolution: str = "1h",
        from_ts: Optional[datetime] = None,
        to_ts: Optional[datetime] = None,
    ) -> List[PPEComplianceTs]:
        query = select(PPEComplianceTs).where(
            and_(PPEComplianceTs.site_id == site_id, PPEComplianceTs.resolution == resolution)
        )
        if from_ts:
            query = query.where(PPEComplianceTs.bucket >= from_ts)
        if to_ts:
            query = query.where(PPEComplianceTs.bucket <= to_ts)
        query = query.order_by(PPEComplianceTs.bucket.asc())
        res = await self.session.execute(query)
        return list(res.scalars().all())

    async def create_report(
        self,
        title: str,
        report_type: str,
        file_format: str,
        file_key: str,
        project_id: Optional[uuid.UUID] = None,
        site_id: Optional[uuid.UUID] = None,
        generated_by: Optional[uuid.UUID] = None,
    ) -> ReportMetadata:
        report = ReportMetadata(
            title=title,
            report_type=report_type,
            file_format=file_format,
            file_key=file_key,
            project_id=project_id,
            site_id=site_id,
            generated_by=generated_by,
        )
        self.session.add(report)
        await self.session.flush()
        return report

    async def get_report(self, report_id: uuid.UUID) -> Optional[ReportMetadata]:
        res = await self.session.execute(select(ReportMetadata).where(ReportMetadata.id == report_id))
        return res.scalar_one_or_none()

    async def list_reports(
        self,
        project_id: Optional[uuid.UUID] = None,
        site_id: Optional[uuid.UUID] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> List[ReportMetadata]:
        query = select(ReportMetadata)
        if project_id:
            query = query.where(ReportMetadata.project_id == project_id)
        if site_id:
            query = query.where(ReportMetadata.site_id == site_id)
        query = query.offset(skip).limit(limit).order_by(ReportMetadata.created_at.desc())
        res = await self.session.execute(query)
        return list(res.scalars().all())
