import math
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from app.core.dependencies import get_notification_repo
from app.db.models.user import User
from app.db.repositories.notification_repo import NotificationRepository
from app.gateway.auth import get_current_user
from app.notifications.engine import notification_engine
from app.schemas.common import PaginatedResponse, StatusMessage
from app.schemas.notification import DeviceRegisterRequest, NotificationResponse

router = APIRouter(prefix="", tags=["Notifications"])


@router.get("/notifications", response_model=PaginatedResponse[NotificationResponse])
async def list_notifications(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    unread_only: bool = False,
    current_user: User = Depends(get_current_user),
    notif_repo: NotificationRepository = Depends(get_notification_repo),
):
    skip = (page - 1) * page_size
    items = await notif_repo.list_for_user(
        user_id=current_user.id,
        skip=skip,
        limit=page_size,
        unread_only=unread_only,
    )
    total = len(items)
    pages = math.ceil(total / page_size) if total > 0 else 1
    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size, pages=pages)


@router.post("/notifications/{notification_id}/read", response_model=NotificationResponse)
async def mark_notification_read(
    notification_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    notif_repo: NotificationRepository = Depends(get_notification_repo),
):
    notif = await notif_repo.mark_as_read(notification_id, current_user.id)
    if not notif:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    return notif


@router.post("/notifications/read-all", response_model=StatusMessage)
async def mark_all_notifications_read(
    current_user: User = Depends(get_current_user),
    notif_repo: NotificationRepository = Depends(get_notification_repo),
):
    count = await notif_repo.mark_all_as_read(current_user.id)
    return StatusMessage(status="ok", message=f"{count} notifications marked as read")


@router.post("/notifications/test", response_model=StatusMessage)
async def test_notification(
    channel: str = Query("console", description="console, email, sms, push"),
    current_user: User = Depends(get_current_user),
):
    recipient = current_user.email
    success = await notification_engine.dispatch(
        channel=channel,
        recipient=recipient,
        title="BuildTrack Test Notification",
        body="This is a test notification confirming delivery channel functionality.",
        metadata={"user_id": str(current_user.id)},
    )
    return StatusMessage(
        status="ok" if success else "failed",
        message=f"Test notification dispatched to {recipient} via {channel}",
    )


@router.post("/devices/register", response_model=StatusMessage)
async def register_device(
    req: DeviceRegisterRequest,
    current_user: User = Depends(get_current_user),
    notif_repo: NotificationRepository = Depends(get_notification_repo),
):
    await notif_repo.register_device(
        user_id=current_user.id,
        token=req.token,
        platform=req.platform,
    )
    return StatusMessage(status="ok", message="Device token registered successfully")
