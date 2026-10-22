import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple
from app.core.metrics import CV_INFERENCE_FPS
from app.cv.detector import cv_detector
from app.db.models.alert import Alert, AlertStatus, AlertSeverity
from app.db.postgres import AsyncSessionLocal
from app.db.repositories.alert_repo import AlertRepository
from app.db.repositories.cv_repo import CVRepository
from app.db.repositories.outbox_repo import OutboxRepository
from app.storage import get_storage

logger = logging.getLogger("cv_service")


class CVService:
    def __init__(self):
        self.cv_repo = CVRepository()
        self.storage = get_storage()

    async def process_frame(
        self,
        camera_id: str,
        site_id: str,
        frame_bytes: Optional[bytes] = None,
        simulate_violation: Optional[bool] = None,
        persist: bool = True,
    ) -> Dict[str, Any]:
        """
        Runs CV detection on frame and coordinates storage, alerts, and outbox.
        With persist=False (ad-hoc analysis) nothing is stored and no alert is raised.
        """
        ts = datetime.now(timezone.utc)
        result = await cv_detector.detect(
            image_bytes=frame_bytes,
            simulate_violation=simulate_violation,
        )
        detections = result["detections"]
        compliant = result["compliant"]
        missing_ppe = result["missing_ppe"]
        annotated_bytes = result["annotated_bytes"]
        persons_count = result["persons_count"]
        detector = result["detector"]

        if result["inference_seconds"] > 0:
            CV_INFERENCE_FPS.labels(camera_id=camera_id).set(1.0 / result["inference_seconds"])

        if not persist:
            return {
                "site_id": site_id,
                "camera_id": camera_id,
                "ts": ts,
                "persons_count": persons_count,
                "violating_persons": result["violating_persons"],
                "compliant": compliant,
                "missing_ppe": missing_ppe,
                "snapshot_key": None,
                "snapshot_url": None,
                "detections": detections,
                "detector": detector,
                "annotated_bytes": annotated_bytes,
            }

        snapshot_key = None
        if not compliant:
            # Save annotated snapshot to object storage
            file_name = f"{site_id}/{uuid.uuid4()}.jpg"
            snapshot_key = await self.storage.save_file(
                bucket="cv-snapshots",
                key=file_name,
                data=annotated_bytes,
                content_type="image/jpeg",
            )

        # Record detection in MongoDB
        doc = await self.cv_repo.insert_detection(
            site_id=site_id,
            camera_id=camera_id,
            ts=ts,
            detections=detections,
            persons_count=persons_count,
            compliant=compliant,
            missing_ppe=missing_ppe,
            snapshot_key=snapshot_key,
            violating_persons=result["violating_persons"],
            detector=detector,
        )

        # If PPE violation, create Alert and Outbox event
        if not compliant:
            async with AsyncSessionLocal() as session:
                try:
                    alert_repo = AlertRepository(session)
                    outbox_repo = OutboxRepository(session)

                    site_uuid = uuid.UUID(site_id)
                    camera_uuid = uuid.UUID(camera_id) if camera_id else None

                    missing_str = ", ".join(missing_ppe)
                    msg = f"PPE Violation detected on camera {camera_id}: {missing_str}"

                    alert = Alert(
                        site_id=site_uuid,
                        camera_id=camera_uuid,
                        alert_type="ppe_violation",
                        severity=AlertSeverity.WARNING,
                        status=AlertStatus.ACTIVE,
                        message=msg,
                        details={
                            "missing_ppe": missing_ppe,
                            "persons_count": persons_count,
                            "violating_persons": result["violating_persons"],
                            "camera_id": camera_id,
                            "snapshot_key": snapshot_key,
                            "detector": detector,
                        },
                    )
                    session.add(alert)
                    await session.flush()

                    # Outbox event
                    await outbox_repo.add_event(
                        event_type="ppe:violation",
                        aggregate_type="alert",
                        aggregate_id=str(alert.id),
                        payload={
                            "alert_id": str(alert.id),
                            "site_id": site_id,
                            "camera_id": camera_id,
                            "severity": "warning",
                            "missing_ppe": missing_ppe,
                            "snapshot_key": snapshot_key,
                            "ts": ts.isoformat(),
                        },
                    )
                    await session.commit()
                except Exception as e:
                    await session.rollback()
                    logger.error(f"Failed to record PPE violation alert: {e}")

        # Get signed snapshot URL if snapshot exists
        snapshot_url = None
        if snapshot_key:
            snapshot_url = await self.storage.get_signed_url("cv-snapshots", snapshot_key)

        return {
            "site_id": site_id,
            "camera_id": camera_id,
            "ts": ts,
            "persons_count": persons_count,
            "violating_persons": result["violating_persons"],
            "compliant": compliant,
            "missing_ppe": missing_ppe,
            "snapshot_key": snapshot_key,
            "snapshot_url": snapshot_url,
            "detections": detections,
            "detector": detector,
            "annotated_bytes": annotated_bytes,
        }


cv_service = CVService()
