import math
import uuid
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from app.core.dependencies import get_alert_repo, get_audit_repo, get_outbox_repo
from app.db.models.alert import Alert, AlertSeverity, AlertStatus
from app.db.models.user import User, UserRole
from app.db.repositories.alert_repo import AlertRepository
from app.db.repositories.audit_repo import AuditRepository
from app.db.repositories.outbox_repo import OutboxRepository
from app.gateway.auth import get_current_user
from app.gateway.rbac import require_roles
from app.schemas.alert import AlertResponse, AlertStatsResponse
from app.schemas.common import PaginatedResponse

router = APIRouter(prefix="", tags=["Alerts"])


@router.get("/alerts", response_model=PaginatedResponse[AlertResponse])
async def list_alerts(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    site_id: Optional[uuid.UUID] = None,
    status: Optional[AlertStatus] = None,
    severity: Optional[AlertSeverity] = None,
    from_ts: Optional[datetime] = Query(None, alias="from"),
    to_ts: Optional[datetime] = Query(None, alias="to"),
    current_user: User = Depends(get_current_user),
    alert_repo: AlertRepository = Depends(get_alert_repo),
):
    skip = (page - 1) * page_size
    alerts = await alert_repo.list_alerts(
        skip=skip,
        limit=page_size,
        site_id=site_id,
        status=status,
        severity=severity,
        from_ts=from_ts,
        to_ts=to_ts,
    )
    total = len(alerts)
    pages = math.ceil(total / page_size) if total > 0 else 1
    return PaginatedResponse(items=alerts, total=total, page=page, page_size=page_size, pages=pages)


@router.get("/alerts/stats", response_model=AlertStatsResponse)
async def get_alert_stats(
    site_id: Optional[uuid.UUID] = None,
    current_user: User = Depends(get_current_user),
    alert_repo: AlertRepository = Depends(get_alert_repo),
):
    stats = await alert_repo.get_stats(site_id)
    return AlertStatsResponse(**stats)


@router.get("/alerts/{alert_id}", response_model=AlertResponse)
async def get_alert(
    alert_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    alert_repo: AlertRepository = Depends(get_alert_repo),
):
    alert = await alert_repo.get_by_id(alert_id)
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")
    return alert


@router.post("/alerts/{alert_id}/acknowledge", response_model=AlertResponse)
async def acknowledge_alert(
    alert_id: uuid.UUID,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.SAFETY_OFFICER, UserRole.SITE_ENGINEER])),
    alert_repo: AlertRepository = Depends(get_alert_repo),
    outbox_repo: OutboxRepository = Depends(get_outbox_repo),
    audit_repo: AuditRepository = Depends(get_audit_repo),
):
    alert = await alert_repo.acknowledge(alert_id, current_user.id)
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")

    # Add outbox event for real-time WebSocket update
    await outbox_repo.add_event(
        event_type="alert:updated",
        aggregate_type="alert",
        aggregate_id=str(alert.id),
        payload={
            "alert_id": str(alert.id),
            "site_id": str(alert.site_id),
            "status": alert.status.value,
            "acknowledged_at": alert.acknowledged_at.isoformat() if alert.acknowledged_at else None,
            "acknowledged_by": str(current_user.id),
        },
    )

    await audit_repo.record(
        action="ACKNOWLEDGE_ALERT",
        entity_type="alert",
        entity_id=str(alert.id),
        user_id=current_user.id,
    )
    return alert


@router.post("/alerts/{alert_id}/resolve", response_model=AlertResponse)
async def resolve_alert(
    alert_id: uuid.UUID,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.SAFETY_OFFICER])),
    alert_repo: AlertRepository = Depends(get_alert_repo),
    outbox_repo: OutboxRepository = Depends(get_outbox_repo),
    audit_repo: AuditRepository = Depends(get_audit_repo),
):
    alert = await alert_repo.resolve(alert_id, current_user.id)
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")

    await outbox_repo.add_event(
        event_type="alert:resolved",
        aggregate_type="alert",
        aggregate_id=str(alert.id),
        payload={
            "alert_id": str(alert.id),
            "site_id": str(alert.site_id),
            "status": alert.status.value,
            "resolved_at": alert.resolved_at.isoformat() if alert.resolved_at else None,
            "resolved_by": str(current_user.id),
        },
    )

    await audit_repo.record(
        action="RESOLVE_ALERT",
        entity_type="alert",
        entity_id=str(alert.id),
        user_id=current_user.id,
    )
    return alert
