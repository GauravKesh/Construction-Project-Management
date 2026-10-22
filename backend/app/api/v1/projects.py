import io
import math
import uuid
from typing import List, Optional
import pandas as pd
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import RedirectResponse
from app.core.dependencies import (
    get_audit_repo,
    get_project_data_repo,
    get_project_repo,
    get_storage_driver,
)
from app.db.models.project import Project, ProjectStatus
from app.db.models.user import User, UserRole
from app.db.repositories.audit_repo import AuditRepository
from app.db.repositories.project_data_repo import ProjectDataRepository
from app.db.repositories.project_repo import ProjectRepository
from app.gateway.auth import get_current_user
from app.gateway.rbac import check_project_access, require_roles
from app.schemas.common import PaginatedResponse, StatusMessage
from app.schemas.project import (
    ProjectCreate,
    ProjectMemberAdd,
    ProjectMemberResponse,
    ProjectResponse,
    ProjectUpdate,
)
from app.schemas.project_data import (
    BoqItemCreate,
    BoqItemResponse,
    DrawingResponse,
    ManpowerCreate,
    ManpowerResponse,
    MaterialCreate,
    MaterialResponse,
    ScheduleItemCreate,
    ScheduleItemResponse,
    ScheduleItemUpdate,
)
from app.storage.base import StorageDriver

router = APIRouter(prefix="", tags=["Projects & Project Data"])


@router.get("/projects", response_model=PaginatedResponse[ProjectResponse])
async def list_projects(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    status: Optional[ProjectStatus] = None,
    current_user: User = Depends(get_current_user),
    proj_repo: ProjectRepository = Depends(get_project_repo),
):
    skip = (page - 1) * page_size
    user_role_str = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    user_id_filter = None if user_role_str in [UserRole.ADMIN.value, UserRole.SAFETY_OFFICER.value] else current_user.id

    projects = await proj_repo.list_projects(
        skip=skip, limit=page_size, status=status, user_id=user_id_filter
    )
    total = len(projects)
    pages = math.ceil(total / page_size) if total > 0 else 1
    return PaginatedResponse(items=projects, total=total, page=page, page_size=page_size, pages=pages)


@router.post("/projects", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    req: ProjectCreate,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.PROJECT_MANAGER])),
    proj_repo: ProjectRepository = Depends(get_project_repo),
    audit_repo: AuditRepository = Depends(get_audit_repo),
):
    existing = await proj_repo.get_by_code(req.code)
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Project code '{req.code}' exists")

    project = await proj_repo.create(**req.model_dump())
    # Add creator as project member
    await proj_repo.add_member(project.id, current_user.id, project_role="manager")

    await audit_repo.record(
        action="CREATE_PROJECT",
        entity_type="project",
        entity_id=str(project.id),
        details={"code": project.code, "name": project.name},
        user_id=current_user.id,
    )
    return project


@router.get("/projects/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    proj_repo: ProjectRepository = Depends(get_project_repo),
):
    await check_project_access(project_id, current_user)
    project = await proj_repo.get_by_id_active(project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


@router.patch("/projects/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: uuid.UUID,
    req: ProjectUpdate,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.PROJECT_MANAGER])),
    proj_repo: ProjectRepository = Depends(get_project_repo),
    audit_repo: AuditRepository = Depends(get_audit_repo),
):
    await check_project_access(project_id, current_user)
    project = await proj_repo.update(project_id, **req.model_dump(exclude_unset=True))
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    await audit_repo.record(
        action="UPDATE_PROJECT",
        entity_type="project",
        entity_id=str(project.id),
        details=req.model_dump(exclude_unset=True),
        user_id=current_user.id,
    )
    return project


@router.delete("/projects/{project_id}", response_model=StatusMessage)
async def delete_project(
    project_id: uuid.UUID,
    current_user: User = Depends(require_roles([UserRole.ADMIN])),
    proj_repo: ProjectRepository = Depends(get_project_repo),
    audit_repo: AuditRepository = Depends(get_audit_repo),
):
    success = await proj_repo.delete(project_id, soft=True)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    await audit_repo.record(
        action="DELETE_PROJECT",
        entity_type="project",
        entity_id=str(project_id),
        user_id=current_user.id,
    )
    return StatusMessage(status="ok", message="Project soft deleted successfully")


# Project Members
@router.get("/projects/{project_id}/members", response_model=List[ProjectMemberResponse])
async def list_project_members(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    proj_repo: ProjectRepository = Depends(get_project_repo),
):
    await check_project_access(project_id, current_user)
    return await proj_repo.list_members(project_id)


@router.post("/projects/{project_id}/members", response_model=ProjectMemberResponse)
async def add_project_member(
    project_id: uuid.UUID,
    req: ProjectMemberAdd,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.PROJECT_MANAGER])),
    proj_repo: ProjectRepository = Depends(get_project_repo),
):
    await check_project_access(project_id, current_user)
    return await proj_repo.add_member(project_id, req.user_id, req.project_role)


@router.delete("/projects/{project_id}/members/{user_id}", response_model=StatusMessage)
async def remove_project_member(
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.PROJECT_MANAGER])),
    proj_repo: ProjectRepository = Depends(get_project_repo),
):
    await check_project_access(project_id, current_user)
    success = await proj_repo.remove_member(project_id, user_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    return StatusMessage(status="ok", message="Member removed")


# Schedules (JSON / CSV / XLSX)
@router.get("/projects/{project_id}/schedules", response_model=List[ScheduleItemResponse])
async def get_schedules(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    data_repo: ProjectDataRepository = Depends(get_project_data_repo),
):
    await check_project_access(project_id, current_user)
    return await data_repo.list_schedules(project_id)


@router.post("/projects/{project_id}/schedules", response_model=List[ScheduleItemResponse])
async def upload_schedules(
    project_id: uuid.UUID,
    file: Optional[UploadFile] = File(None),
    items: Optional[List[ScheduleItemCreate]] = None,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.SITE_ENGINEER])),
    data_repo: ProjectDataRepository = Depends(get_project_data_repo),
):
    await check_project_access(project_id, current_user)
    created = []
    if file:
        content = await file.read()
        if file.filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        elif file.filename.endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(content))
        else:
            raise HTTPException(status_code=400, detail="Only CSV or Excel files supported")

        for _, row in df.iterrows():
            item = await data_repo.add_schedule_item(
                project_id=project_id,
                task_name=str(row.get("task_name", "Untitled Task")),
                wbs_code=str(row.get("wbs_code", "")),
                start_date=pd.to_datetime(row.get("start_date")).date(),
                end_date=pd.to_datetime(row.get("end_date")).date(),
                progress_percent=float(row.get("progress_percent", 0.0)),
                status=str(row.get("status", "pending")),
                dependencies=[],
            )
            created.append(item)
    elif items:
        for it in items:
            item = await data_repo.add_schedule_item(
                project_id=project_id,
                **it.model_dump(),
            )
            created.append(item)
    else:
        raise HTTPException(status_code=400, detail="Provide JSON items or CSV/XLSX file")

    return created


@router.patch("/projects/{project_id}/schedules/{schedule_id}", response_model=ScheduleItemResponse)
async def update_schedule_item(
    project_id: uuid.UUID,
    schedule_id: uuid.UUID,
    req: ScheduleItemUpdate,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.SITE_ENGINEER])),
    data_repo: ProjectDataRepository = Depends(get_project_data_repo),
):
    await check_project_access(project_id, current_user)
    item = await data_repo.update_schedule_item(schedule_id, **req.model_dump(exclude_unset=True))
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule milestone task not found")
    return item


@router.delete("/projects/{project_id}/schedules/{schedule_id}", response_model=StatusMessage)
async def delete_schedule_item(
    project_id: uuid.UUID,
    schedule_id: uuid.UUID,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.PROJECT_MANAGER])),
    data_repo: ProjectDataRepository = Depends(get_project_data_repo),
):
    await check_project_access(project_id, current_user)
    success = await data_repo.delete_schedule_item(schedule_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule milestone task not found")
    return StatusMessage(status="success", message="Schedule item deleted successfully")


# BOQ (JSON / CSV / XLSX)
@router.get("/projects/{project_id}/boq", response_model=List[BoqItemResponse])
async def get_boq(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    data_repo: ProjectDataRepository = Depends(get_project_data_repo),
):
    await check_project_access(project_id, current_user)
    return await data_repo.list_boq(project_id)


@router.post("/projects/{project_id}/boq", response_model=List[BoqItemResponse])
async def upload_boq(
    project_id: uuid.UUID,
    file: Optional[UploadFile] = File(None),
    items: Optional[List[BoqItemCreate]] = None,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.SITE_ENGINEER])),
    data_repo: ProjectDataRepository = Depends(get_project_data_repo),
):
    await check_project_access(project_id, current_user)
    created = []
    if file:
        content = await file.read()
        if file.filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        elif file.filename.endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(content))
        else:
            raise HTTPException(status_code=400, detail="Only CSV or Excel files supported")

        for _, row in df.iterrows():
            item = await data_repo.add_boq_item(
                project_id=project_id,
                item_code=str(row.get("item_code", "BOQ-ITEM")),
                description=str(row.get("description", "")),
                unit=str(row.get("unit", "units")),
                planned_quantity=float(row.get("planned_quantity", 0)),
                unit_rate=float(row.get("unit_rate", 0)),
                total_planned_cost=float(row.get("total_planned_cost", 0)),
                consumed_quantity=float(row.get("consumed_quantity", 0)),
            )
            created.append(item)
    elif items:
        for it in items:
            item = await data_repo.add_boq_item(
                project_id=project_id,
                **it.model_dump(),
            )
            created.append(item)
    else:
        raise HTTPException(status_code=400, detail="Provide JSON items or CSV/XLSX file")

    return created


# Manpower
@router.get("/projects/{project_id}/manpower", response_model=List[ManpowerResponse])
async def get_manpower(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    data_repo: ProjectDataRepository = Depends(get_project_data_repo),
):
    await check_project_access(project_id, current_user)
    return await data_repo.list_manpower(project_id)


@router.post("/projects/{project_id}/manpower", response_model=List[ManpowerResponse])
async def upload_manpower(
    project_id: uuid.UUID,
    file: Optional[UploadFile] = File(None),
    items: Optional[List[ManpowerCreate]] = None,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.SITE_ENGINEER])),
    data_repo: ProjectDataRepository = Depends(get_project_data_repo),
):
    await check_project_access(project_id, current_user)
    created = []
    if file:
        content = await file.read()
        if file.filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        elif file.filename.endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(content))
        else:
            raise HTTPException(status_code=400, detail="Only CSV or Excel files supported")

        for _, row in df.iterrows():
            item = await data_repo.add_manpower(
                project_id=project_id,
                date=pd.to_datetime(row.get("date")).date(),
                trade=str(row.get("trade", "general")),
                planned_headcount=int(row.get("planned_headcount", 0)),
                actual_headcount=int(row.get("actual_headcount", 0)),
                shift=str(row.get("shift", "day")),
            )
            created.append(item)
    elif items:
        for it in items:
            item = await data_repo.add_manpower(
                project_id=project_id,
                **it.model_dump(),
            )
            created.append(item)
    else:
        raise HTTPException(status_code=400, detail="Provide JSON items or CSV/XLSX file")

    return created


# Materials
@router.get("/projects/{project_id}/materials", response_model=List[MaterialResponse])
async def get_materials(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    data_repo: ProjectDataRepository = Depends(get_project_data_repo),
):
    await check_project_access(project_id, current_user)
    return await data_repo.list_materials(project_id)


@router.post("/projects/{project_id}/materials", response_model=List[MaterialResponse])
async def upload_materials(
    project_id: uuid.UUID,
    file: Optional[UploadFile] = File(None),
    items: Optional[List[MaterialCreate]] = None,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.SITE_ENGINEER])),
    data_repo: ProjectDataRepository = Depends(get_project_data_repo),
):
    await check_project_access(project_id, current_user)
    created = []
    if file:
        content = await file.read()
        if file.filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        elif file.filename.endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(content))
        else:
            raise HTTPException(status_code=400, detail="Only CSV or Excel files supported")

        for _, row in df.iterrows():
            item = await data_repo.add_material(
                project_id=project_id,
                name=str(row.get("name", "material")),
                unit=str(row.get("unit", "units")),
                total_ordered=float(row.get("total_ordered", 0)),
                total_delivered=float(row.get("total_delivered", 0)),
                total_used=float(row.get("total_used", 0)),
                stock_on_hand=float(row.get("stock_on_hand", 0)),
            )
            created.append(item)
    elif items:
        for it in items:
            item = await data_repo.add_material(
                project_id=project_id,
                **it.model_dump(),
            )
            created.append(item)
    else:
        raise HTTPException(status_code=400, detail="Provide JSON items or CSV/XLSX file")

    return created


# Drawings (file upload to storage + signed url download)
@router.get("/projects/{project_id}/drawings", response_model=List[DrawingResponse])
async def list_drawings(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    data_repo: ProjectDataRepository = Depends(get_project_data_repo),
    storage: StorageDriver = Depends(get_storage_driver),
):
    await check_project_access(project_id, current_user)
    drawings = await data_repo.list_drawings(project_id)
    response_items = []
    for d in drawings:
        url = await storage.get_signed_url("drawings", d.file_key)
        item = DrawingResponse.model_validate(d)
        item.download_url = url
        response_items.append(item)
    return response_items


@router.post("/projects/{project_id}/drawings", response_model=DrawingResponse)
async def upload_drawing(
    project_id: uuid.UUID,
    drawing_number: str = Form(...),
    title: str = Form(...),
    discipline: str = Form("architectural"),
    version: str = Form("Rev-0"),
    file: UploadFile = File(...),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.SITE_ENGINEER])),
    data_repo: ProjectDataRepository = Depends(get_project_data_repo),
    storage: StorageDriver = Depends(get_storage_driver),
):
    await check_project_access(project_id, current_user)
    file_bytes = await file.read()
    key = f"{project_id}/{uuid.uuid4()}_{file.filename}"
    await storage.save_file("drawings", key, file_bytes, content_type=file.content_type or "application/octet-stream")

    drawing = await data_repo.add_drawing(
        project_id=project_id,
        drawing_number=drawing_number,
        title=title,
        discipline=discipline,
        version=version,
        file_name=file.filename,
        file_key=key,
        file_size=len(file_bytes),
    )
    url = await storage.get_signed_url("drawings", key)
    res = DrawingResponse.model_validate(drawing)
    res.download_url = url
    return res


@router.get("/drawings/{drawing_id}/download")
async def download_drawing(
    drawing_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    data_repo: ProjectDataRepository = Depends(get_project_data_repo),
    storage: StorageDriver = Depends(get_storage_driver),
):
    drawing = await data_repo.get_drawing(drawing_id)
    if not drawing:
        raise HTTPException(status_code=404, detail="Drawing not found")
    await check_project_access(drawing.project_id, current_user)
    url = await storage.get_signed_url("drawings", drawing.file_key)
    return RedirectResponse(url=url)
