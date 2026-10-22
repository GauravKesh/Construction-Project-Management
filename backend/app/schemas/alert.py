import uuid
from datetime import datetime
from typing import Any, Dict, Optional
from pydantic import BaseModel
from app.db.models.alert import AlertStatus
from app.db.models.rule import AlertSeverity


class AlertResponse(BaseModel):
    id: uuid.UUID
    site_id: uuid.UUID
    zone_id: Optional[uuid.UUID] = None
    rule_id: Optional[uuid.UUID] = None
    sensor_id: Optional[uuid.UUID] = None
    camera_id: Optional[uuid.UUID] = None
    alert_type: str
    severity: AlertSeverity
    status: AlertStatus
    message: str
    reading_value: Optional[float] = None
    threshold_value: Optional[float] = None
    details: Dict[str, Any]
    acknowledged_at: Optional[datetime] = None
    acknowledged_by: Optional[uuid.UUID] = None
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[uuid.UUID] = None
    escalation_level: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AlertStatsResponse(BaseModel):
    total: int
    active: int
    acknowledged: int
    resolved: int
    by_severity: Dict[str, int]
