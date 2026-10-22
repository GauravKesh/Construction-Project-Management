import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field
from app.db.models.rule import AlertSeverity, RuleOperator


class RuleCreate(BaseModel):
    name: str
    sensor_type: str
    operator: str = Field(description="One of >, <, >=, <=, ==, !=, between, outside")
    threshold_val1: float
    threshold_val2: Optional[float] = None
    duration_seconds: int = 0
    severity: AlertSeverity = AlertSeverity.WARNING
    site_id: Optional[uuid.UUID] = None
    zone_id: Optional[uuid.UUID] = None
    description: Optional[str] = None
    is_enabled: bool = True
    cooldown_seconds: int = 300
    auto_create_incident: bool = False


class RuleUpdate(BaseModel):
    name: Optional[str] = None
    operator: Optional[str] = None
    threshold_val1: Optional[float] = None
    threshold_val2: Optional[float] = None
    duration_seconds: Optional[int] = None
    severity: Optional[AlertSeverity] = None
    zone_id: Optional[uuid.UUID] = None
    description: Optional[str] = None
    is_enabled: Optional[bool] = None
    cooldown_seconds: Optional[int] = None
    auto_create_incident: Optional[bool] = None


class RuleResponse(BaseModel):
    id: uuid.UUID
    site_id: Optional[uuid.UUID] = None
    zone_id: Optional[uuid.UUID] = None
    sensor_type: str
    name: str
    description: Optional[str] = None
    operator: str
    threshold_val1: float
    threshold_val2: Optional[float] = None
    duration_seconds: int
    severity: AlertSeverity
    is_enabled: bool
    cooldown_seconds: int
    auto_create_incident: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class RuleTestRequest(BaseModel):
    operator: str
    threshold_val1: float
    threshold_val2: Optional[float] = None
    duration_seconds: int = 0
    test_value: float


class RuleTestResult(BaseModel):
    matched: bool
    operator: str
    threshold_val1: float
    threshold_val2: Optional[float] = None
    test_value: float
    message: str
