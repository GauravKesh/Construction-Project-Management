from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel


class CVDetectionItem(BaseModel):
    class_name: str
    confidence: float
    bbox: List[float]  # [x1, y1, x2, y2] normalized or pixels
    track_id: Optional[int] = None
    ppe_status: Optional[Dict[str, bool]] = None


class CVDetectionResponse(BaseModel):
    site_id: str
    camera_id: str
    ts: datetime
    persons_count: int
    compliant: bool
    missing_ppe: List[str]
    snapshot_key: Optional[str] = None
    snapshot_url: Optional[str] = None
    detections: List[Dict[str, Any]]
    detector: Optional[str] = None


class PPESummaryResponse(BaseModel):
    total_frames: int
    compliant_frames: int
    violations_frames: int
    compliance_rate: Optional[float] = None  # frame-level; None when no frames recorded
    total_persons: int
    violating_persons: int = 0
    person_compliance_rate: Optional[float] = None  # person-level; None when no persons seen
    detectors: List[str] = []


class PPEViolationItem(BaseModel):
    site_id: str
    camera_id: str
    ts: datetime
    persons_count: int
    missing_ppe: List[str]
    snapshot_key: Optional[str] = None
    snapshot_url: Optional[str] = None


class CVAnalyzeRequest(BaseModel):
    camera_id: Optional[str] = None
    image_base64: Optional[str] = None


class CVAnalyzeResponse(BaseModel):
    compliant: bool
    persons_count: int
    violating_persons: int = 0
    detector: Optional[str] = None  # "mock", "mock-fallback" or "yolo:<weights>"
    missing_ppe: List[str]
    detections: List[Dict[str, Any]]
    snapshot_key: Optional[str] = None
    snapshot_url: Optional[str] = None
