from datetime import datetime
import uuid
from typing import Any, Dict, Optional
from pydantic import BaseModel


class DependencyHealth(BaseModel):
    status: str  # healthy, degraded, unhealthy
    latency_ms: Optional[float] = None
    details: Optional[str] = None


class HealthResponse(BaseModel):
    status: str  # ok, degraded, error
    timestamp: datetime
    dependencies: Dict[str, DependencyHealth]


class AuditLogResponse(BaseModel):
    id: uuid.UUID
    user_id: Optional[uuid.UUID] = None
    action: str
    entity_type: str
    entity_id: Optional[str] = None
    details: Dict[str, Any] = {}
    ip_address: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
