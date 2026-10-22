import asyncio
import logging
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
from app.core.config import settings
from app.cv.mock_detector import mock_detector
from app.cv.ppe_rules import evaluate_frame_ppe, required_classes_supported

logger = logging.getLogger("cv_detector")


class CVDetector:
    def __init__(self):
        self.mode: Optional[str] = None
        self.model_path: Optional[str] = None
        self.model = None
        # Recorded on every detection so mock output can never pass as model output
        self.detector_name = "mock"
        self._init_model()

    def _init_model(self) -> None:
        self.mode = settings.CV_MODE
        self.model_path = settings.CV_MODEL_PATH
        self.model = None
        self.detector_name = "mock"
        if self.mode != "yolo":
            return
        try:
            from ultralytics import YOLO
            self.model = YOLO(settings.CV_MODEL_PATH)
        except Exception as e:
            logger.error(
                f"CV_MODE=yolo but the model at {settings.CV_MODEL_PATH} could not be loaded ({e}). "
                "Falling back to the MOCK detector; detections will be labelled 'mock-fallback'."
            )
            self.detector_name = "mock-fallback"
            return

        class_names = list(getattr(self.model, "names", {}).values())
        if not required_classes_supported(class_names):
            logger.error(
                f"Model {settings.CV_MODEL_PATH} has no PPE classes (labels: {class_names[:10]}...). "
                "A COCO model such as yolov8n.pt cannot detect helmets or vests, so every person "
                "will be reported as non-compliant. Train or download PPE weights."
            )
        self.detector_name = f"yolo:{Path(settings.CV_MODEL_PATH).name}"
        logger.info(f"Loaded YOLO model from {settings.CV_MODEL_PATH}")

    async def detect(
        self,
        image_bytes: Optional[bytes] = None,
        simulate_violation: Optional[bool] = None,
    ) -> Dict[str, Any]:
        """
        Runs detection in a thread pool to avoid blocking the asyncio event loop.

        Returns dict: detections, compliant, missing_ppe, persons_count,
        violating_persons, annotated_bytes, detector, inference_seconds.
        """
        # Pick up runtime config changes (PUT /cv/config)
        if settings.CV_MODE != self.mode or settings.CV_MODEL_PATH != self.model_path:
            await asyncio.to_thread(self._init_model)

        started = time.perf_counter()
        if self.model is not None:
            if not image_bytes:
                raise ValueError("No frame provided for model inference")
            detections, annotated = await asyncio.to_thread(self._run_yolo_inference, image_bytes)
            detector = self.detector_name
        else:
            detections, _, _, annotated = await asyncio.to_thread(
                mock_detector.detect_and_annotate,
                image_bytes=image_bytes,
                simulate_violation=simulate_violation,
            )
            detector = self.detector_name

        result = evaluate_frame_ppe(detections)
        result.update(
            detections=detections,
            annotated_bytes=annotated,
            detector=detector,
            inference_seconds=time.perf_counter() - started,
        )
        return result

    def _run_yolo_inference(self, image_bytes: bytes):
        import cv2
        import numpy as np

        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Could not decode frame bytes as an image")

        results = self.model(img, conf=settings.CV_CONFIDENCE_THRESHOLD, verbose=False)
        detections: List[Dict[str, Any]] = []

        if results and len(results) > 0:
            for box in results[0].boxes:
                cls_id = int(box.cls[0].item())
                detections.append({
                    "class_name": self.model.names.get(cls_id, str(cls_id)),
                    "confidence": round(float(box.conf[0].item()), 4),
                    "bbox": [float(v) for v in box.xyxy[0].tolist()],
                })

        annotated_img = results[0].plot() if results and len(results) > 0 else img
        _, jpeg_buf = cv2.imencode(".jpg", annotated_img, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
        return detections, jpeg_buf.tobytes()


cv_detector = CVDetector()
