import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class NotificationResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    alert_id: Optional[uuid.UUID] = None
    channel: str
    recipient: str
    title: str
    body: str
    status: str
    sent_at: Optional[datetime] = None
    read_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class DeviceRegisterRequest(BaseModel):
    token: str
    platform: str = "web"  # web, android, ios
