import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.dependencies import get_db, get_rollup_repo, get_storage_driver
from app.db.models.alert import Alert, AlertStatus
from app.db.models.camera import Camera
from app.db.models.incident import Incident, IncidentStatus
from app.db.models.project import Project, Site
from app.db.models.sensor import Sensor
from app.db.models.user import User
from app.db.repositories.rollup_repo import RollupRepository
from app.gateway.auth import get_current_user
from app.processing.analytics import analytics_engine
from app.schemas.analytics import (
    DashboardSummaryResponse,
    KpiResponse,
    PredictionResponse,
    ReportCreateRequest,
    ReportResponse,
    RiskScoreResponse,
    TrendPoint,
    TrendsResponse,
)
from app.storage.base import StorageDriver

router = APIRouter(prefix="", tags=["Analytics"])


@router.get("/analytics/kpis", response_model=KpiResponse)
async def get_kpis(
    site_id: uuid.UUID = Query(...),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    kpis = await analytics_engine.calculate_kpis(site_id, session)
    return KpiResponse(**kpis)


@router.get("/analytics/trends", response_model=TrendsResponse)
async def get_trends(
    site_id: uuid.UUID = Query(...),
    metric: str = Query("ppe_compliance", description="ppe_compliance, alerts, uptime"),
    resolution: str = Query("1h", description="1h, 1d"),
    from_ts: Optional[datetime] = Query(None, alias="from"),
    to_ts: Optional[datetime] = Query(None, alias="to"),
    current_user: User = Depends(get_current_user),
    rollup_repo: RollupRepository = Depends(get_rollup_repo),
):
    """
    Retrieves historical trends exclusively from rollup tables.
    """
    now = datetime.now(timezone.utc)
    from_date = from_ts or (now - timedelta(days=7))
    to_date = to_ts or now

    data_points = []
    if metric == "alerts":
        records = await rollup_repo.get_alert_trends(site_id, resolution=resolution, from_ts=from_date, to_ts=to_date)
        for r in records:
            data_points.append(TrendPoint(bucket=r.bucket.isoformat(), value=float(r.count), metric=r.severity))
    elif metric == "ppe_compliance":
        records = await rollup_repo.get_ppe_trends(site_id, resolution=resolution, from_ts=from_date, to_ts=to_date)
        for r in records:
            if r.compliance_rate is not None:
                data_points.append(TrendPoint(bucket=r.bucket.isoformat(), value=r.compliance_rate, metric="compliance_rate"))
    else:
        # Generic KPI rollups
        records = await rollup_repo.get_kpi_rollups(site_id, resolution=resolution, from_ts=from_date, to_ts=to_date)
        for r in records:
            val = r.sensor_uptime_pct if metric == "uptime" else float(r.active_alerts_count)
            if val is None:
                continue
            data_points.append(TrendPoint(bucket=r.bucket.isoformat(), value=val, metric=metric))

    return TrendsResponse(metric=metric, resolution=resolution, data_points=data_points)


@router.get("/analytics/predictions", response_model=PredictionResponse)
async def get_predictions(
    site_id: uuid.UUID = Query(...),
    metric: str = Query("ppe_compliance", pattern="^(ppe_compliance|incidents|uptime)$", description="ppe_compliance, incidents, uptime"),
    horizon_days: int = Query(7, ge=1, le=30),
    current_user: User = Depends(get_current_user),
    rollup_repo: RollupRepository = Depends(get_rollup_repo),
):
    # Fetch historical rollup values
    now = datetime.now(timezone.utc)
    records = await rollup_repo.get_kpi_rollups(
        site_id, resolution="1h", from_ts=now - timedelta(days=14), to_ts=now
    )
    # Only real observations are used; with too few points the response says so
    if metric == "ppe_compliance":
        history = [r.ppe_compliance_pct for r in records]
    elif metric == "uptime":
        history = [r.sensor_uptime_pct for r in records]
    else:
        history = [float(r.incidents_count) for r in records]

    # Rollups are hourly, so a horizon of N days is N * 24 steps
    pred = analytics_engine.predict_forecast(history, horizon_steps=horizon_days * 24)
    return PredictionResponse(
        metric=metric,
        horizon_days=horizon_days,
        current_value=pred["current_value"],
        forecast_value=pred["forecast_value"],
        trend_direction=pred["trend_direction"],
        confidence_interval=pred["confidence_interval"],
        n_observations=pred["n_observations"],
    )


@router.get("/analytics/risk-score", response_model=RiskScoreResponse)
async def get_risk_score(
    site_id: uuid.UUID = Query(...),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    result = await analytics_engine.calculate_risk_scores(site_id, session)
    return RiskScoreResponse(**result)


@router.post("/analytics/reports", response_model=ReportResponse, status_code=status.HTTP_201_CREATED)
async def create_report(
    req: ReportCreateRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
    rollup_repo: RollupRepository = Depends(get_rollup_repo),
    storage: StorageDriver = Depends(get_storage_driver),
):
    file_key, _ = await analytics_engine.generate_report_file(
        report_type=req.report_type,
        file_format=req.file_format,
        site_id=req.site_id,
        session=session,
        storage=storage,
    )
    report = await rollup_repo.create_report(
        title=req.title,
        report_type=req.report_type,
        file_format=req.file_format,
        file_key=file_key,
        project_id=req.project_id,
        site_id=req.site_id,
        generated_by=current_user.id,
    )
    download_url = await storage.get_signed_url("reports", file_key)
    res = ReportResponse.model_validate(report)
    res.download_url = download_url
    return res


@router.get("/analytics/reports", response_model=List[ReportResponse])
async def list_reports(
    project_id: Optional[uuid.UUID] = None,
    site_id: Optional[uuid.UUID] = None,
    current_user: User = Depends(get_current_user),
    rollup_repo: RollupRepository = Depends(get_rollup_repo),
    storage: StorageDriver = Depends(get_storage_driver),
):
    reports = await rollup_repo.list_reports(project_id=project_id, site_id=site_id)
    items = []
    for r in reports:
        item = ReportResponse.model_validate(r)
        item.download_url = await storage.get_signed_url("reports", r.file_key)
        items.append(item)
    return items


@router.get("/analytics/reports/{report_id}/download")
async def download_report(
    report_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    rollup_repo: RollupRepository = Depends(get_rollup_repo),
    storage: StorageDriver = Depends(get_storage_driver),
):
    report = await rollup_repo.get_report(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    url = await storage.get_signed_url("reports", report.file_key)
    return RedirectResponse(url=url)


@router.get("/dashboard/summary", response_model=DashboardSummaryResponse)
async def get_dashboard_summary(
    project_id: Optional[uuid.UUID] = None,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    # Sites filter
    site_filter = [Site.status == "active", Site.deleted_at.is_(None)]
    if project_id:
        site_filter.append(Site.project_id == project_id)

    sites_res = await session.execute(select(Site).where(and_(*site_filter)))
    sites = sites_res.scalars().all()
    site_ids = [s.id for s in sites]

    # Sensors count
    if site_ids:
        sensor_res = await session.execute(
            select(Sensor).where(and_(Sensor.site_id.in_(site_ids), Sensor.deleted_at.is_(None)))
        )
        sensors = sensor_res.scalars().all()
    else:
        sensors = []

    now = datetime.now(timezone.utc)
    online_sensors = [s for s in sensors if s.last_seen_at and (now - s.last_seen_at).total_seconds() < 300]

    # Cameras count
    if site_ids:
        cam_res = await session.execute(
            select(Camera).where(and_(Camera.site_id.in_(site_ids), Camera.deleted_at.is_(None)))
        )
        cameras = cam_res.scalars().all()
    else:
        cameras = []

    # Active alerts
    alert_filter = [Alert.status == AlertStatus.ACTIVE]
    if site_ids:
        alert_filter.append(Alert.site_id.in_(site_ids))
    alerts_q = select(Alert).where(and_(*alert_filter)).order_by(Alert.created_at.desc()).limit(5)
    recent_alerts_res = await session.execute(alerts_q)
    recent_alerts = recent_alerts_res.scalars().all()
    active_alerts_count = (await session.execute(select(func.count(Alert.id)).where(and_(*alert_filter)))).scalar() or 0

    # Active incidents
    inc_filter = [Incident.status.in_([IncidentStatus.OPEN, IncidentStatus.ACKNOWLEDGED, IncidentStatus.INVESTIGATING])]
    if site_ids:
        inc_filter.append(Incident.site_id.in_(site_ids))
    inc_q = select(Incident).where(and_(*inc_filter)).order_by(Incident.created_at.desc()).limit(5)
    recent_inc_res = await session.execute(inc_q)
    recent_incidents = recent_inc_res.scalars().all()
    open_incidents_count = (await session.execute(select(func.count(Incident.id)).where(and_(*inc_filter)))).scalar() or 0

    # PPE summary
    ppe_sum = await analytics_engine.cv_repo.get_ppe_summary(site_id=str(site_ids[0]) if len(site_ids) == 1 else None)

    return DashboardSummaryResponse(
        project_id=project_id,
        active_sites_count=len(sites),
        total_sensors_count=len(sensors),
        online_sensors_count=len(online_sensors),
        active_cameras_count=len(cameras),
        ppe_compliance_pct=ppe_sum.get("compliance_rate"),
        active_alerts_count=active_alerts_count,
        open_incidents_count=open_incidents_count,
        recent_alerts=[
            {
                "id": str(a.id),
                "message": a.message,
                "severity": a.severity.value,
                "created_at": a.created_at.isoformat(),
            }
            for a in recent_alerts
        ],
        recent_incidents=[
            {
                "id": str(i.id),
                "number": i.incident_number,
                "title": i.title,
                "severity": i.severity.value,
                "status": i.status.value,
                "created_at": i.created_at.isoformat(),
            }
            for i in recent_incidents
        ],
    )
