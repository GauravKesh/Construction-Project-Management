import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel


class KpiResponse(BaseModel):
    site_id: uuid.UUID
    overall_progress_pct: float
    ppe_compliance_pct: Optional[float] = None  # None = no CV data
    sensor_uptime_pct: Optional[float] = None   # None = no sensors
    active_alerts: int
    open_incidents: int
    resolved_incidents: int
    manpower_present: int
    mttr_hours: float
    metrics: Dict[str, Any] = {}


class TrendPoint(BaseModel):
    bucket: str
    value: float
    metric: str


class TrendsResponse(BaseModel):
    metric: str
    resolution: str
    data_points: List[TrendPoint]


class PredictionResponse(BaseModel):
    metric: str
    horizon_days: int
    current_value: Optional[float] = None
    forecast_value: Optional[float] = None
    trend_direction: str  # increasing, decreasing, stable, insufficient_data
    confidence_interval: Optional[List[float]] = None  # 95% prediction interval [lower, upper]
    n_observations: int = 0
    method: str = "ols_linear_trend"


class RiskScoreZone(BaseModel):
    zone_id: Optional[str] = None
    zone_name: str
    risk_score: float  # 0 to 100
    risk_level: str    # Low, Medium, High, Critical
    contributing_factors: List[str]


class RiskScoreResponse(BaseModel):
    site_id: uuid.UUID
    overall_risk_score: float
    risk_level: str
    zones: List[RiskScoreZone]


class DashboardSummaryResponse(BaseModel):
    project_id: Optional[uuid.UUID] = None
    active_sites_count: int
    total_sensors_count: int
    online_sensors_count: int
    active_cameras_count: int
    ppe_compliance_pct: Optional[float] = None
    active_alerts_count: int
    open_incidents_count: int
    recent_alerts: List[Dict[str, Any]]
    recent_incidents: List[Dict[str, Any]]


class ReportCreateRequest(BaseModel):
    project_id: Optional[uuid.UUID] = None
    site_id: Optional[uuid.UUID] = None
    title: str
    report_type: str = "daily_summary"  # daily_summary, safety_audit, incident_log, ppe_compliance
    file_format: str = "pdf"  # pdf, csv, xlsx


class ReportResponse(BaseModel):
    id: uuid.UUID
    project_id: Optional[uuid.UUID] = None
    site_id: Optional[uuid.UUID] = None
    title: str
    report_type: str
    file_format: str
    status: str
    download_url: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
