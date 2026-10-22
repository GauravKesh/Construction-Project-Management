import math
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import StreamingResponse
from app.core.dependencies import (
    get_audit_repo,
    get_camera_repo,
    get_storage_driver,
)
from app.db.models.camera import Camera
from app.db.models.user import User, UserRole
from app.db.repositories.audit_repo import AuditRepository
from app.db.repositories.camera_repo import CameraRepository
from app.gateway.auth import get_current_user
from app.gateway.rbac import check_site_access, require_roles
import asyncio
from app.ingestion.video_stream_handler import (
    generate_mjpeg_stream,
    get_last_error,
    get_latest_frame,
    probe_stream,
)
from app.schemas.camera import (
    CameraConnectionTestRequest,
    CameraConnectionTestResponse,
    CameraCreate,
    CameraResponse,
    CameraStatusResponse,
    CameraUpdate,
)
from app.schemas.common import PaginatedResponse, StatusMessage
from app.storage.base import StorageDriver

router = APIRouter(prefix="", tags=["Cameras"])


@router.get("/sites/{site_id}/cameras", response_model=PaginatedResponse[CameraResponse])
async def list_cameras_for_site(
    site_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    status: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    camera_repo: CameraRepository = Depends(get_camera_repo),
):
    await check_site_access(site_id, current_user)
    skip = (page - 1) * page_size
    cameras = await camera_repo.list_by_site(site_id, skip=skip, limit=page_size, status=status)
    total = len(cameras)
    pages = math.ceil(total / page_size) if total > 0 else 1
    return PaginatedResponse(items=cameras, total=total, page=page, page_size=page_size, pages=pages)


@router.post("/sites/{site_id}/cameras", response_model=CameraResponse, status_code=status.HTTP_201_CREATED)
async def create_camera(
    site_id: uuid.UUID,
    req: CameraCreate,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.SAFETY_OFFICER])),
    camera_repo: CameraRepository = Depends(get_camera_repo),
    audit_repo: AuditRepository = Depends(get_audit_repo),
):
    await check_site_access(site_id, current_user)
    existing = await camera_repo.get_by_code(req.camera_code)
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Camera code already exists")

    camera = await camera_repo.create(site_id=site_id, status="active", **req.model_dump())
    await audit_repo.record(
        action="CREATE_CAMERA",
        entity_type="camera",
        entity_id=str(camera.id),
        details={"code": camera.camera_code, "name": camera.name},
        user_id=current_user.id,
    )
    return camera


@router.get("/cameras/{camera_id}", response_model=CameraResponse)
async def get_camera(
    camera_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    camera_repo: CameraRepository = Depends(get_camera_repo),
):
    camera = await camera_repo.get_by_id_active(camera_id)
    if not camera:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")
    await check_site_access(camera.site_id, current_user)
    return camera


@router.patch("/cameras/{camera_id}", response_model=CameraResponse)
async def update_camera(
    camera_id: uuid.UUID,
    req: CameraUpdate,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.SAFETY_OFFICER])),
    camera_repo: CameraRepository = Depends(get_camera_repo),
    audit_repo: AuditRepository = Depends(get_audit_repo),
):
    camera = await camera_repo.get_by_id_active(camera_id)
    if not camera:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")
    await check_site_access(camera.site_id, current_user)

    updated = await camera_repo.update(camera_id, **req.model_dump(exclude_unset=True))
    await audit_repo.record(
        action="UPDATE_CAMERA",
        entity_type="camera",
        entity_id=str(camera_id),
        details=req.model_dump(exclude_unset=True),
        user_id=current_user.id,
    )
    return updated


@router.delete("/cameras/{camera_id}", response_model=StatusMessage)
async def delete_camera(
    camera_id: uuid.UUID,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.PROJECT_MANAGER])),
    camera_repo: CameraRepository = Depends(get_camera_repo),
    audit_repo: AuditRepository = Depends(get_audit_repo),
):
    camera = await camera_repo.get_by_id_active(camera_id)
    if not camera:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")
    await check_site_access(camera.site_id, current_user)

    # Soft-deleted cameras drop out of the video handler's next registry sync
    await camera_repo.delete(camera_id, soft=True)
    await audit_repo.record(
        action="DELETE_CAMERA",
        entity_type="camera",
        entity_id=str(camera_id),
        user_id=current_user.id,
    )
    return StatusMessage(status="ok", message="Camera soft deleted successfully")


CAMERA_OPERATORS = [UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.SAFETY_OFFICER, UserRole.SITE_ENGINEER]


@router.post("/cameras/test-connection", response_model=CameraConnectionTestResponse)
async def test_camera_connection(
    req: CameraConnectionTestRequest,
    current_user: User = Depends(require_roles(CAMERA_OPERATORS)),
):
    """
    Open the stream from the server and read one frame, so a camera can be checked
    before it is registered. Restricted to operator roles because it makes the
    server connect to the given address.
    """
    result = await asyncio.to_thread(probe_stream, req.stream_url, 8.0)
    return CameraConnectionTestResponse(
        ok=result.ok,
        width=result.width,
        height=result.height,
        fps=result.fps,
        error=result.error,
        elapsed_ms=result.elapsed_ms,
    )


@router.post("/cameras/{camera_id}/start", response_model=StatusMessage)
async def start_camera_stream(
    camera_id: uuid.UUID,
    current_user: User = Depends(require_roles(CAMERA_OPERATORS)),
    camera_repo: CameraRepository = Depends(get_camera_repo),
):
    camera = await camera_repo.get_by_id_active(camera_id)
    if not camera:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")
    await check_site_access(camera.site_id, current_user)

    # The video handler process starts the worker on its next registry sync
    await camera_repo.update_status(camera_id, "active")
    return StatusMessage(status="ok", message=f"Camera {camera.camera_code} will start streaming within a few seconds")


@router.post("/cameras/{camera_id}/stop", response_model=StatusMessage)
async def stop_camera_stream(
    camera_id: uuid.UUID,
    current_user: User = Depends(require_roles(CAMERA_OPERATORS)),
    camera_repo: CameraRepository = Depends(get_camera_repo),
):
    camera = await camera_repo.get_by_id_active(camera_id)
    if not camera:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")
    await check_site_access(camera.site_id, current_user)

    await camera_repo.update_status(camera_id, "inactive")
    return StatusMessage(status="ok", message=f"Camera {camera.camera_code} will stop within a few seconds")


@router.get("/cameras/{camera_id}/status", response_model=CameraStatusResponse)
async def get_camera_status(
    camera_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    camera_repo: CameraRepository = Depends(get_camera_repo),
):
    camera = await camera_repo.get_by_id_active(camera_id)
    if not camera:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")
    await check_site_access(camera.site_id, current_user)

    is_active = await get_latest_frame(str(camera_id)) is not None
    return CameraStatusResponse(
        camera_id=camera.id,
        camera_code=camera.camera_code,
        status=camera.status,
        fps=camera.fps,
        is_cv_enabled=camera.is_cv_enabled,
        last_frame_at=camera.last_frame_at,
        stream_active=is_active,
        last_error=None if is_active else await get_last_error(str(camera_id)),
    )


@router.get("/cameras/{camera_id}/snapshot")
async def get_camera_snapshot(
    camera_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    camera_repo: CameraRepository = Depends(get_camera_repo),
):
    camera = await camera_repo.get_by_id_active(camera_id)
    if not camera:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")
    await check_site_access(camera.site_id, current_user)

    jpeg_bytes = await get_latest_frame(str(camera_id))
    if not jpeg_bytes:
        raise HTTPException(status_code=404, detail="No snapshot currently available for camera")

    return Response(content=jpeg_bytes, media_type="image/jpeg", headers={"Cache-Control": "no-store"})


@router.get("/cameras/{camera_id}/stream")
async def get_camera_mjpeg_stream(
    camera_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    camera_repo: CameraRepository = Depends(get_camera_repo),
):
    """
    MJPEG stream endpoint for real-time browser preview.
    """
    camera = await camera_repo.get_by_id_active(camera_id)
    if not camera:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")
    await check_site_access(camera.site_id, current_user)

    return StreamingResponse(
        generate_mjpeg_stream(str(camera_id)),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )
