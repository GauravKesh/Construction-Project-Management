import io
import math
import uuid
from datetime import datetime
from typing import List, Optional
import pandas as pd
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from app.core.dependencies import (
    get_audit_repo,
    get_incident_repo,
    get_outbox_repo,
    get_storage_driver,
)
from app.db.models.incident import Incident, IncidentStatus
from app.db.models.rule import AlertSeverity
from app.db.models.user import User, UserRole
from app.db.repositories.audit_repo import AuditRepository
from app.db.repositories.incident_repo import IncidentRepository
from app.db.repositories.outbox_repo import OutboxRepository
from app.gateway.auth import get_current_user
from app.gateway.rbac import require_roles
from app.schemas.common import PaginatedResponse, StatusMessage
from app.schemas.incident import (
    IncidentAssignRequest,
    IncidentAttachmentResponse,
    IncidentCreate,
    IncidentDetailResponse,
    IncidentResponse,
    IncidentStatsResponse,
    IncidentStatusUpdate,
    IncidentUpdate,
    IncidentUpdateCreate,
    IncidentUpdateResponse,
)
from app.storage.base import StorageDriver

router = APIRouter(prefix="", tags=["Incidents"])


@router.get("/incidents", response_model=PaginatedResponse[IncidentResponse])
async def list_incidents(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    site_id: Optional[uuid.UUID] = None,
    status: Optional[IncidentStatus] = None,
    severity: Optional[AlertSeverity] = None,
    assigned_to: Optional[uuid.UUID] = None,
    current_user: User = Depends(get_current_user),
    incident_repo: IncidentRepository = Depends(get_incident_repo),
):
    skip = (page - 1) * page_size
    incidents = await incident_repo.list_incidents(
        skip=skip,
        limit=page_size,
        site_id=site_id,
        status=status,
        severity=severity,
        assigned_to=assigned_to,
    )
    total = len(incidents)
    pages = math.ceil(total / page_size) if total > 0 else 1
    return PaginatedResponse(items=incidents, total=total, page=page, page_size=page_size, pages=pages)


@router.post("/incidents", response_model=IncidentResponse, status_code=status.HTTP_201_CREATED)
async def create_incident(
    req: IncidentCreate,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.SAFETY_OFFICER, UserRole.SITE_ENGINEER])),
    incident_repo: IncidentRepository = Depends(get_incident_repo),
    outbox_repo: OutboxRepository = Depends(get_outbox_repo),
    audit_repo: AuditRepository = Depends(get_audit_repo),
):
    incident = await incident_repo.create_incident(
        site_id=req.site_id,
        title=req.title,
        description=req.description,
        severity=req.severity,
        zone_id=req.zone_id,
        alert_id=req.alert_id,
        assigned_to=req.assigned_to,
        reported_by=current_user.id,
    )

    await outbox_repo.add_event(
        event_type="incident:new",
        aggregate_type="incident",
        aggregate_id=str(incident.id),
        payload={
            "incident_id": str(incident.id),
            "incident_number": incident.incident_number,
            "site_id": str(incident.site_id),
            "title": incident.title,
            "severity": incident.severity.value,
            "status": incident.status.value,
        },
    )

    await audit_repo.record(
        action="CREATE_INCIDENT",
        entity_type="incident",
        entity_id=str(incident.id),
        details={"number": incident.incident_number, "title": incident.title},
        user_id=current_user.id,
    )
    return incident


@router.get("/incidents/stats", response_model=IncidentStatsResponse)
async def get_incident_stats(
    site_id: Optional[uuid.UUID] = None,
    current_user: User = Depends(get_current_user),
    incident_repo: IncidentRepository = Depends(get_incident_repo),
):
    stats = await incident_repo.get_stats(site_id)
    return IncidentStatsResponse(**stats)


@router.get("/incidents/export")
async def export_incidents(
    format: str = Query("csv", description="csv, xlsx, or pdf"),
    site_id: Optional[uuid.UUID] = None,
    current_user: User = Depends(get_current_user),
    incident_repo: IncidentRepository = Depends(get_incident_repo),
):
    incidents = await incident_repo.list_incidents(site_id=site_id, limit=1000)
    data = [
        {
            "Incident Number": i.incident_number,
            "Title": i.title,
            "Severity": i.severity.value if hasattr(i.severity, "value") else str(i.severity),
            "Status": i.status.value if hasattr(i.status, "value") else str(i.status),
            "Created At": i.created_at.strftime("%Y-%m-%d %H:%M:%S"),
            "Resolved At": i.resolved_at.strftime("%Y-%m-%d %H:%M:%S") if i.resolved_at else "N/A",
            "Root Cause": i.root_cause or "N/A",
        }
        for i in incidents
    ]
    df = pd.DataFrame(data)

    fmt = format.lower()
    if fmt == "csv":
        csv_bytes = df.to_csv(index=False).encode("utf-8")
        return Response(
            content=csv_bytes,
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=incidents_export.csv"},
        )
    elif fmt == "xlsx":
        out = io.BytesIO()
        df.to_excel(out, index=False, engine="openpyxl")
        return Response(
            content=out.getvalue(),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=incidents_export.xlsx"},
        )
    elif fmt == "pdf":
        from reportlab.lib.pagesizes import letter
        from reportlab.pdfgen import canvas

        buffer = io.BytesIO()
        p = canvas.Canvas(buffer, pagesize=letter)
        p.setFont("Helvetica-Bold", 16)
        p.drawString(50, 750, "BuildTrack - Incidents Export Report")
        p.setFont("Helvetica", 10)
        p.drawString(50, 730, f"Generated on {datetime.now().strftime('%Y-%m-%d %H:%M')} | Total Incidents: {len(incidents)}")

        y = 690
        for item in data[:35]:  # fit on first page
            p.drawString(50, y, f"{item['Incident Number']} | {item['Severity'].upper()} | {item['Status']} | {item['Title'][:45]}")
            y -= 18
            if y < 50:
                break

        p.showPage()
        p.save()
        return Response(
            content=buffer.getvalue(),
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=incidents_export.pdf"},
        )
    else:
        raise HTTPException(status_code=400, detail="Supported export formats: csv, xlsx, pdf")


@router.get("/incidents/{incident_id}", response_model=IncidentDetailResponse)
async def get_incident(
    incident_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    incident_repo: IncidentRepository = Depends(get_incident_repo),
    storage: StorageDriver = Depends(get_storage_driver),
):
    incident = await incident_repo.get_by_id_with_relations(incident_id)
    if not incident:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")

    detail = IncidentDetailResponse.model_validate(incident)
    for att in detail.attachments:
        att.download_url = await storage.get_signed_url("attachments", att.file_key)
    return detail


@router.patch("/incidents/{incident_id}", response_model=IncidentResponse)
async def update_incident(
    incident_id: uuid.UUID,
    req: IncidentUpdate,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.SAFETY_OFFICER])),
    incident_repo: IncidentRepository = Depends(get_incident_repo),
    audit_repo: AuditRepository = Depends(get_audit_repo),
):
    incident = await incident_repo.update(incident_id, **req.model_dump(exclude_unset=True))
    if not incident:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")

    await audit_repo.record(
        action="UPDATE_INCIDENT",
        entity_type="incident",
        entity_id=str(incident_id),
        details=req.model_dump(exclude_unset=True),
        user_id=current_user.id,
    )
    return incident


@router.post("/incidents/{incident_id}/status", response_model=IncidentResponse)
async def update_incident_status(
    incident_id: uuid.UUID,
    req: IncidentStatusUpdate,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.SAFETY_OFFICER, UserRole.SITE_ENGINEER])),
    incident_repo: IncidentRepository = Depends(get_incident_repo),
    outbox_repo: OutboxRepository = Depends(get_outbox_repo),
    audit_repo: AuditRepository = Depends(get_audit_repo),
):
    incident = await incident_repo.update_status(
        incident_id=incident_id,
        new_status=req.status,
        user_id=current_user.id,
        comment=req.comment or f"Status changed to {req.status.value}",
        resolution_notes=req.resolution_notes,
    )
    if not incident:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")

    await outbox_repo.add_event(
        event_type="incident:updated",
        aggregate_type="incident",
        aggregate_id=str(incident.id),
        payload={
            "incident_id": str(incident.id),
            "incident_number": incident.incident_number,
            "status": incident.status.value,
            "comment": req.comment,
        },
    )

    await audit_repo.record(
        action="UPDATE_INCIDENT_STATUS",
        entity_type="incident",
        entity_id=str(incident_id),
        details={"status": req.status.value, "comment": req.comment},
        user_id=current_user.id,
    )
    return incident


@router.post("/incidents/{incident_id}/assign", response_model=IncidentResponse)
async def assign_incident(
    incident_id: uuid.UUID,
    req: IncidentAssignRequest,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.SAFETY_OFFICER])),
    incident_repo: IncidentRepository = Depends(get_incident_repo),
    outbox_repo: OutboxRepository = Depends(get_outbox_repo),
):
    incident = await incident_repo.assign_incident(
        incident_id=incident_id,
        assignee_id=req.assigned_to,
        actor_id=current_user.id,
    )
    if not incident:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")

    await outbox_repo.add_event(
        event_type="incident:updated",
        aggregate_type="incident",
        aggregate_id=str(incident.id),
        payload={
            "incident_id": str(incident.id),
            "assigned_to": str(req.assigned_to),
        },
    )
    return incident


@router.get("/incidents/{incident_id}/updates", response_model=List[IncidentUpdateResponse])
async def list_incident_updates(
    incident_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    incident_repo: IncidentRepository = Depends(get_incident_repo),
):
    incident = await incident_repo.get_by_id_with_relations(incident_id)
    if not incident:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")
    return incident.updates


@router.post("/incidents/{incident_id}/updates", response_model=IncidentUpdateResponse)
async def add_incident_update(
    incident_id: uuid.UUID,
    req: IncidentUpdateCreate,
    current_user: User = Depends(get_current_user),
    incident_repo: IncidentRepository = Depends(get_incident_repo),
):
    incident = await incident_repo.get_by_id(incident_id)
    if not incident:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")

    from app.db.models.incident import IncidentUpdate as IncUpdateModel
    update_entry = IncUpdateModel(
        incident_id=incident_id,
        user_id=current_user.id,
        comment=req.comment,
    )
    incident_repo.session.add(update_entry)
    await incident_repo.session.flush()
    return update_entry


@router.post("/incidents/{incident_id}/attachments", response_model=IncidentAttachmentResponse)
async def upload_incident_attachment(
    incident_id: uuid.UUID,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    incident_repo: IncidentRepository = Depends(get_incident_repo),
    storage: StorageDriver = Depends(get_storage_driver),
):
    incident = await incident_repo.get_by_id(incident_id)
    if not incident:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")

    file_bytes = await file.read()
    key = f"{incident_id}/{uuid.uuid4()}_{file.filename}"
    await storage.save_file("attachments", key, file_bytes, content_type=file.content_type or "application/octet-stream")

    att = await incident_repo.add_attachment(
        incident_id=incident_id,
        file_name=file.filename,
        file_key=key,
        file_size=len(file_bytes),
        content_type=file.content_type or "application/octet-stream",
    )
    res = IncidentAttachmentResponse.model_validate(att)
    res.download_url = await storage.get_signed_url("attachments", key)
    return res
