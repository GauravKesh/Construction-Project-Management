import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from app.core.dependencies import get_audit_repo, get_zone_repo
from app.db.models.user import User, UserRole
from app.db.repositories.audit_repo import AuditRepository
from app.db.repositories.zone_repo import ZoneRepository
from app.gateway.auth import get_current_user
from app.gateway.rbac import check_site_access, require_roles
from app.schemas.common import StatusMessage
from app.schemas.project import ZoneCreate, ZoneResponse, ZoneUpdate

router = APIRouter(prefix="", tags=["Zones"])


@router.get("/sites/{site_id}/zones", response_model=List[ZoneResponse])
async def list_zones_for_site(
    site_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    zone_repo: ZoneRepository = Depends(get_zone_repo),
):
    await check_site_access(site_id, current_user)
    return await zone_repo.list_by_site(site_id)


@router.post("/sites/{site_id}/zones", response_model=ZoneResponse, status_code=status.HTTP_201_CREATED)
async def create_zone(
    site_id: uuid.UUID,
    req: ZoneCreate,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.SAFETY_OFFICER])),
    zone_repo: ZoneRepository = Depends(get_zone_repo),
    audit_repo: AuditRepository = Depends(get_audit_repo),
):
    await check_site_access(site_id, current_user)
    zone = await zone_repo.create(site_id=site_id, **req.model_dump())
    await audit_repo.record(
        action="CREATE_ZONE",
        entity_type="zone",
        entity_id=str(zone.id),
        details={"name": zone.name, "site_id": str(site_id)},
        user_id=current_user.id,
    )
    return zone


@router.get("/zones/{zone_id}", response_model=ZoneResponse)
async def get_zone(
    zone_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    zone_repo: ZoneRepository = Depends(get_zone_repo),
):
    zone = await zone_repo.get_by_id(zone_id)
    if not zone:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Zone not found")
    await check_site_access(zone.site_id, current_user)
    return zone


@router.patch("/zones/{zone_id}", response_model=ZoneResponse)
async def update_zone(
    zone_id: uuid.UUID,
    req: ZoneUpdate,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.SAFETY_OFFICER])),
    zone_repo: ZoneRepository = Depends(get_zone_repo),
    audit_repo: AuditRepository = Depends(get_audit_repo),
):
    zone = await zone_repo.get_by_id(zone_id)
    if not zone:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Zone not found")
    await check_site_access(zone.site_id, current_user)

    updated = await zone_repo.update(zone_id, **req.model_dump(exclude_unset=True))
    await audit_repo.record(
        action="UPDATE_ZONE",
        entity_type="zone",
        entity_id=str(zone_id),
        details=req.model_dump(exclude_unset=True),
        user_id=current_user.id,
    )
    return updated


@router.delete("/zones/{zone_id}", response_model=StatusMessage)
async def delete_zone(
    zone_id: uuid.UUID,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.SAFETY_OFFICER])),
    zone_repo: ZoneRepository = Depends(get_zone_repo),
    audit_repo: AuditRepository = Depends(get_audit_repo),
):
    zone = await zone_repo.get_by_id(zone_id)
    if not zone:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Zone not found")
    await check_site_access(zone.site_id, current_user)

    await zone_repo.delete(zone_id)
    await audit_repo.record(
        action="DELETE_ZONE",
        entity_type="zone",
        entity_id=str(zone_id),
        user_id=current_user.id,
    )
    return StatusMessage(status="ok", message="Zone deleted successfully")
