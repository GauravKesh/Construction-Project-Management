import uuid
from datetime import date, datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from app.db.models.project import ProjectStatus


class ProjectCreate(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    code: str = Field(min_length=2, max_length=64)
    description: Optional[str] = None
    status: ProjectStatus = ProjectStatus.ACTIVE
    budget: Optional[float] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[ProjectStatus] = None
    budget: Optional[float] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class ProjectResponse(BaseModel):
    id: uuid.UUID
    name: str
    code: str
    description: Optional[str] = None
    status: ProjectStatus
    budget: Optional[float] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ProjectMemberAdd(BaseModel):
    user_id: uuid.UUID
    project_role: str = "member"


class ProjectMemberResponse(BaseModel):
    project_id: uuid.UUID
    user_id: uuid.UUID
    project_role: str
    created_at: datetime

    class Config:
        from_attributes = True


class SiteCreate(BaseModel):
    name: str
    code: str
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    boundary_geojson: Optional[Dict[str, Any]] = None
    status: str = "active"


class SiteUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    boundary_geojson: Optional[Dict[str, Any]] = None
    status: Optional[str] = None


class SiteResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    code: str
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    boundary_geojson: Optional[Dict[str, Any]] = None
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ZoneCreate(BaseModel):
    name: str
    zone_type: str = "general"
    polygon_geojson: Dict[str, Any]
    risk_level: str = "medium"


class ZoneUpdate(BaseModel):
    name: Optional[str] = None
    zone_type: Optional[str] = None
    polygon_geojson: Optional[Dict[str, Any]] = None
    risk_level: Optional[str] = None


class ZoneResponse(BaseModel):
    id: uuid.UUID
    site_id: uuid.UUID
    name: str
    zone_type: str
    polygon_geojson: Dict[str, Any]
    risk_level: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SiteMapResponse(BaseModel):
    type: str = "FeatureCollection"
    site_id: str
    site_name: str
    center: Optional[List[float]] = None
    features: List[Dict[str, Any]]
