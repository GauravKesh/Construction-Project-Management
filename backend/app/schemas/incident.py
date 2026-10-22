import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel
from app.db.models.incident import IncidentStatus
from app.db.models.rule import AlertSeverity


class IncidentCreate(BaseModel):
    site_id: uuid.UUID
    title: str
    description: str
    severity: AlertSeverity = AlertSeverity.WARNING
    zone_id: Optional[uuid.UUID] = None
    alert_id: Optional[uuid.UUID] = None
    assigned_to: Optional[uuid.UUID] = None


class IncidentUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    severity: Optional[AlertSeverity] = None
    assigned_to: Optional[uuid.UUID] = None
    root_cause: Optional[str] = None
    resolution_notes: Optional[str] = None


class IncidentStatusUpdate(BaseModel):
    status: IncidentStatus
    comment: Optional[str] = None
    resolution_notes: Optional[str] = None


class IncidentAssignRequest(BaseModel):
    assigned_to: uuid.UUID


class IncidentUpdateCreate(BaseModel):
    comment: str


class IncidentUpdateResponse(BaseModel):
    id: uuid.UUID
    incident_id: uuid.UUID
    user_id: Optional[uuid.UUID] = None
    status_from: Optional[str] = None
    status_to: Optional[str] = None
    comment: str
    created_at: datetime

    class Config:
        from_attributes = True


class IncidentAttachmentResponse(BaseModel):
    id: uuid.UUID
    incident_id: uuid.UUID
    file_name: str
    file_size: int
    content_type: str
    download_url: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class IncidentResponse(BaseModel):
    id: uuid.UUID
    incident_number: str
    site_id: uuid.UUID
    zone_id: Optional[uuid.UUID] = None
    alert_id: Optional[uuid.UUID] = None
    title: str
    description: str
    severity: AlertSeverity
    status: IncidentStatus
    assigned_to: Optional[uuid.UUID] = None
    reported_by: Optional[uuid.UUID] = None
    resolved_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    root_cause: Optional[str] = None
    resolution_notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class IncidentDetailResponse(IncidentResponse):
    updates: List[IncidentUpdateResponse] = []
    attachments: List[IncidentAttachmentResponse] = []


class IncidentStatsResponse(BaseModel):
    total: int
    open: int
    resolved: int
    by_status: Dict[str, int]
    by_severity: Dict[str, int]
