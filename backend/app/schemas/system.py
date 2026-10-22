from datetime import datetime
from typing import Dict, Optional
from pydantic import BaseModel


class DependencyHealth(BaseModel):
    status: str  # healthy, degraded, unhealthy
    latency_ms: Optional[float] = None
    details: Optional[str] = None


class HealthResponse(BaseModel):
    status: str  # ok, degraded, error
    timestamp: datetime
    dependencies: Dict[str, DependencyHealth]
