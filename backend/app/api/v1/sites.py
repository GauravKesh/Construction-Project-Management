import math
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from app.core.dependencies import get_audit_repo, get_site_repo
from app.db.models.user import User, UserRole
from app.db.repositories.audit_repo import AuditRepository
from app.db.repositories.site_repo import SiteRepository
from app.gateway.auth import get_current_user
from app.gateway.rbac import check_project_access, check_site_access, require_roles
from app.schemas.common import PaginatedResponse, StatusMessage
from app.schemas.project import SiteCreate, SiteMapResponse, SiteResponse, SiteUpdate

router = APIRouter(prefix="", tags=["Sites & Site Map"])


@router.get("/projects/{project_id}/sites", response_model=PaginatedResponse[SiteResponse])
async def list_sites_for_project(
    project_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    status: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    site_repo: SiteRepository = Depends(get_site_repo),
):
    await check_project_access(project_id, current_user)
    skip = (page - 1) * page_size
    sites = await site_repo.list_by_project(project_id, skip=skip, limit=page_size, status=status)
    total = len(sites)
    pages = math.ceil(total / page_size) if total > 0 else 1
    return PaginatedResponse(items=sites, total=total, page=page, page_size=page_size, pages=pages)


@router.post("/projects/{project_id}/sites", response_model=SiteResponse, status_code=status.HTTP_201_CREATED)
async def create_site(
    project_id: uuid.UUID,
    req: SiteCreate,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.PROJECT_MANAGER])),
    site_repo: SiteRepository = Depends(get_site_repo),
    audit_repo: AuditRepository = Depends(get_audit_repo),
):
    await check_project_access(project_id, current_user)
    site = await site_repo.create(project_id=project_id, **req.model_dump())
    await audit_repo.record(
        action="CREATE_SITE",
        entity_type="site",
        entity_id=str(site.id),
        details={"code": site.code, "name": site.name},
        user_id=current_user.id,
    )
    return site


@router.get("/sites/{site_id}", response_model=SiteResponse)
async def get_site(
    site_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    site_repo: SiteRepository = Depends(get_site_repo),
):
    await check_site_access(site_id, current_user)
    site = await site_repo.get_by_id_active(site_id)
    if not site:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site not found")
    return site


@router.patch("/sites/{site_id}", response_model=SiteResponse)
async def update_site(
    site_id: uuid.UUID,
    req: SiteUpdate,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.PROJECT_MANAGER])),
    site_repo: SiteRepository = Depends(get_site_repo),
    audit_repo: AuditRepository = Depends(get_audit_repo),
):
    await check_site_access(site_id, current_user)
    site = await site_repo.update(site_id, **req.model_dump(exclude_unset=True))
    if not site:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site not found")

    await audit_repo.record(
        action="UPDATE_SITE",
        entity_type="site",
        entity_id=str(site.id),
        details=req.model_dump(exclude_unset=True),
        user_id=current_user.id,
    )
    return site


@router.delete("/sites/{site_id}", response_model=StatusMessage)
async def delete_site(
    site_id: uuid.UUID,
    current_user: User = Depends(require_roles([UserRole.ADMIN])),
    site_repo: SiteRepository = Depends(get_site_repo),
    audit_repo: AuditRepository = Depends(get_audit_repo),
):
    success = await site_repo.delete(site_id, soft=True)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site not found")

    await audit_repo.record(
        action="DELETE_SITE",
        entity_type="site",
        entity_id=str(site_id),
        user_id=current_user.id,
    )
    return StatusMessage(status="ok", message="Site soft deleted successfully")


@router.get("/sites/{site_id}/map", response_model=SiteMapResponse)
async def get_site_map(
    site_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    site_repo: SiteRepository = Depends(get_site_repo),
):
    await check_site_access(site_id, current_user)
    map_data = await site_repo.get_site_map_data(site_id)
    if not map_data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site map data not found")
    return map_data
