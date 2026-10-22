import base64
import uuid
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from app.core.config import settings
from app.core.dependencies import get_cv_repo, get_storage_driver
from app.cv.service import cv_service
from app.db.models.user import User, UserRole
from app.db.repositories.cv_repo import CVRepository
from app.gateway.auth import get_current_user
from app.gateway.rbac import require_roles
from app.schemas.camera import CVConfigResponse, CVConfigUpdate
from app.schemas.cv import (
    CVAnalyzeRequest,
    CVAnalyzeResponse,
    CVDetectionResponse,
    PPESummaryResponse,
    PPEViolationItem,
)
from app.storage.base import StorageDriver

router = APIRouter(prefix="", tags=["Computer Vision & Safety"])


@router.post("/cv/analyze", response_model=CVAnalyzeResponse)
async def analyze_frame(
    req: CVAnalyzeRequest,
    current_user: User = Depends(get_current_user),
    storage: StorageDriver = Depends(get_storage_driver),
):
    """
    On-demand analysis of an uploaded image or camera frame.
    """
    image_bytes = None
    if req.image_base64:
        try:
            image_bytes = base64.b64decode(req.image_base64)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid base64 encoded image")

    # Ad-hoc analysis is not tied to a real site, so nothing is persisted
    result = await cv_service.process_frame(
        camera_id=req.camera_id or "adhoc",
        site_id="",
        frame_bytes=image_bytes,
        persist=False,
    )

    snapshot_url = None
    if result.get("snapshot_key"):
        snapshot_url = await storage.get_signed_url("cv-snapshots", result["snapshot_key"])

    return CVAnalyzeResponse(
        compliant=result["compliant"],
        persons_count=result["persons_count"],
        violating_persons=result["violating_persons"],
        detector=result["detector"],
        missing_ppe=result["missing_ppe"],
        detections=result["detections"],
        snapshot_key=result.get("snapshot_key"),
        snapshot_url=snapshot_url,
    )


@router.get("/cv/detections", response_model=List[CVDetectionResponse])
async def list_cv_detections(
    site_id: Optional[str] = None,
    camera_id: Optional[str] = None,
    from_ts: Optional[datetime] = Query(None, alias="from"),
    to_ts: Optional[datetime] = Query(None, alias="to"),
    violation_only: bool = False,
    limit: int = Query(50, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    cv_repo: CVRepository = Depends(get_cv_repo),
    storage: StorageDriver = Depends(get_storage_driver),
):
    docs = await cv_repo.list_detections(
        site_id=site_id,
        camera_id=camera_id,
        from_ts=from_ts,
        to_ts=to_ts,
        violation_only=violation_only,
        limit=limit,
    )

    results = []
    for d in docs:
        snapshot_url = None
        if d.get("snapshot_key"):
            snapshot_url = await storage.get_signed_url("cv-snapshots", d["snapshot_key"])
        results.append(
            CVDetectionResponse(
                site_id=d["site_id"],
                camera_id=d["camera_id"],
                ts=d["ts"],
                persons_count=d["persons_count"],
                compliant=d["compliant"],
                missing_ppe=d["missing_ppe"],
                snapshot_key=d.get("snapshot_key"),
                snapshot_url=snapshot_url,
                detections=d.get("detections", []),
                detector=d.get("detector"),
            )
        )
    return results


@router.get("/safety/ppe/summary", response_model=PPESummaryResponse)
async def get_ppe_summary(
    site_id: Optional[str] = None,
    from_ts: Optional[datetime] = Query(None, alias="from"),
    to_ts: Optional[datetime] = Query(None, alias="to"),
    current_user: User = Depends(get_current_user),
    cv_repo: CVRepository = Depends(get_cv_repo),
):
    summary = await cv_repo.get_ppe_summary(
        site_id=site_id,
        from_ts=from_ts,
        to_ts=to_ts,
    )
    return summary


@router.get("/safety/ppe/violations", response_model=List[PPEViolationItem])
async def list_ppe_violations(
    site_id: Optional[str] = None,
    camera_id: Optional[str] = None,
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    cv_repo: CVRepository = Depends(get_cv_repo),
    storage: StorageDriver = Depends(get_storage_driver),
):
    docs = await cv_repo.list_detections(
        site_id=site_id,
        camera_id=camera_id,
        violation_only=True,
        limit=limit,
    )
    results = []
    for d in docs:
        snapshot_url = None
        if d.get("snapshot_key"):
            snapshot_url = await storage.get_signed_url("cv-snapshots", d["snapshot_key"])
        results.append(
            PPEViolationItem(
                site_id=d["site_id"],
                camera_id=d["camera_id"],
                ts=d["ts"],
                persons_count=d["persons_count"],
                missing_ppe=d["missing_ppe"],
                snapshot_key=d.get("snapshot_key"),
                snapshot_url=snapshot_url,
            )
        )
    return results


@router.get("/cv/config", response_model=CVConfigResponse)
async def get_cv_config(current_user: User = Depends(get_current_user)):
    try:
        import ultralytics
        ml_available = True
    except ImportError:
        ml_available = False

    return CVConfigResponse(
        cv_mode=settings.CV_MODE,
        model_path=settings.CV_MODEL_PATH,
        confidence_threshold=settings.CV_CONFIDENCE_THRESHOLD,
        inference_fps=settings.CV_INFERENCE_FPS,
        is_ml_available=ml_available,
    )


@router.put("/cv/config", response_model=CVConfigResponse)
async def update_cv_config(
    req: CVConfigUpdate,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.SAFETY_OFFICER])),
):
    if req.confidence_threshold is not None:
        settings.CV_CONFIDENCE_THRESHOLD = req.confidence_threshold
    if req.inference_fps is not None:
        settings.CV_INFERENCE_FPS = req.inference_fps
    if req.mode is not None and req.mode in ["mock", "yolo"]:
        settings.CV_MODE = req.mode

    try:
        import ultralytics
        ml_available = True
    except ImportError:
        ml_available = False

    return CVConfigResponse(
        cv_mode=settings.CV_MODE,
        model_path=settings.CV_MODEL_PATH,
        confidence_threshold=settings.CV_CONFIDENCE_THRESHOLD,
        inference_fps=settings.CV_INFERENCE_FPS,
        is_ml_available=ml_available,
    )
