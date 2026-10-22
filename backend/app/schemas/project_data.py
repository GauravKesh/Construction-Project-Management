import uuid
from datetime import date, datetime
from typing import Any, List, Optional
from pydantic import BaseModel


class ScheduleItemCreate(BaseModel):
    task_name: str
    wbs_code: Optional[str] = None
    start_date: date
    end_date: date
    progress_percent: float = 0.0
    status: str = "pending"
    dependencies: Optional[List[Any]] = None


class ScheduleItemUpdate(BaseModel):
    task_name: Optional[str] = None
    wbs_code: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    progress_percent: Optional[float] = None
    status: Optional[str] = None
    dependencies: Optional[List[Any]] = None


class ScheduleItemResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    task_name: str
    wbs_code: Optional[str] = None
    start_date: date
    end_date: date
    progress_percent: float
    status: str
    dependencies: List[Any]
    created_at: datetime

    class Config:
        from_attributes = True


class BoqItemCreate(BaseModel):
    item_code: str
    description: str
    unit: str
    planned_quantity: float
    unit_rate: float
    total_planned_cost: float
    consumed_quantity: float = 0.0


class BoqItemResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    item_code: str
    description: str
    unit: str
    planned_quantity: float
    unit_rate: float
    total_planned_cost: float
    consumed_quantity: float
    created_at: datetime

    class Config:
        from_attributes = True


class ManpowerCreate(BaseModel):
    date: date
    trade: str
    planned_headcount: int
    actual_headcount: int
    shift: str = "day"


class ManpowerResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    date: date
    trade: str
    planned_headcount: int
    actual_headcount: int
    shift: str
    created_at: datetime

    class Config:
        from_attributes = True


class MaterialCreate(BaseModel):
    name: str
    unit: str
    total_ordered: float = 0.0
    total_delivered: float = 0.0
    total_used: float = 0.0
    stock_on_hand: float = 0.0


class MaterialResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    unit: str
    total_ordered: float
    total_delivered: float
    total_used: float
    stock_on_hand: float
    created_at: datetime

    class Config:
        from_attributes = True


class DrawingResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    drawing_number: str
    title: str
    discipline: str
    version: str
    file_name: str
    file_size: int
    download_url: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
