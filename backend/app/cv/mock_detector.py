import io
import time
from typing import Any, Dict, List, Optional, Tuple
import cv2
import numpy as np


class MockCVDetector:
    """
    Deterministic mock detector providing simulated PPE and person detections
    with bounding box annotations.

    It does NOT look at the image: it always reports one person and injects a
    missing-helmet violation on every 4th call (or when simulate_violation is set).
    Its output is labelled detector="mock" and must not be used as evidence of
    detection accuracy or real compliance rates.
    """

    def __init__(self):
        self._counter = 0

    def detect_and_annotate(
        self,
        image_bytes: Optional[bytes] = None,
        simulate_violation: Optional[bool] = None,
    ) -> Tuple[List[Dict[str, Any]], bool, List[str], bytes]:
        self._counter += 1

        # Determine violation: if not explicitly specified, trigger every 4th frame
        is_violation = (self._counter % 4 == 0) if simulate_violation is None else simulate_violation

        # Decode image or create a synthetic test canvas
        if image_bytes:
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if img is None:
                img = self._create_synthetic_frame()
        else:
            img = self._create_synthetic_frame()

        h, w = img.shape[:2]

        detections = []
        missing_ppe = []

        # Person bounding box
        p_box = [int(w * 0.25), int(h * 0.2), int(w * 0.75), int(h * 0.9)]
        detections.append({
            "class_name": "person",
            "confidence": 0.92,
            "bbox": p_box,
        })

        if not is_violation:
            # Fully compliant person
            detections.append({
                "class_name": "helmet",
                "confidence": 0.88,
                "bbox": [int(w * 0.38), int(h * 0.22), int(w * 0.62), int(h * 0.38)],
            })
            detections.append({
                "class_name": "vest",
                "confidence": 0.91,
                "bbox": [int(w * 0.30), int(h * 0.38), int(w * 0.70), int(h * 0.75)],
            })
            compliant = True
        else:
            # Person missing helmet
            detections.append({
                "class_name": "vest",
                "confidence": 0.89,
                "bbox": [int(w * 0.30), int(h * 0.38), int(w * 0.70), int(h * 0.75)],
            })
            missing_ppe.append("missing_helmet")
            compliant = False

        # Annotate image
        annotated_img = img.copy()
        # Draw person box (green if compliant, red if violation)
        color = (0, 200, 0) if compliant else (0, 0, 255)
        cv2.rectangle(annotated_img, (p_box[0], p_box[1]), (p_box[2], p_box[3]), color, 2)
        status_label = "COMPLIANT" if compliant else "VIOLATION: MISSING HELMET"
        cv2.putText(
            annotated_img,
            f"Worker-1: {status_label}",
            (p_box[0], p_box[1] - 10),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            color,
            2,
        )

        for d in detections:
            if d["class_name"] != "person":
                b = d["bbox"]
                cv2.rectangle(annotated_img, (b[0], b[1]), (b[2], b[3]), (255, 165, 0), 1)
                cv2.putText(
                    annotated_img,
                    f"{d['class_name']} ({d['confidence']:.2f})",
                    (b[0], b[1] - 5),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.5,
                    (255, 165, 0),
                    1,
                )

        # Timestamp banner
        ts_text = time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())
        cv2.putText(annotated_img, ts_text, (15, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

        _, jpeg_buf = cv2.imencode(".jpg", annotated_img, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
        return detections, compliant, missing_ppe, jpeg_buf.tobytes()

    def _create_synthetic_frame(self) -> np.ndarray:
        # 640x480 dark grey canvas
        canvas = np.zeros((480, 640, 3), dtype=np.uint8)
        canvas[:] = (35, 35, 35)
        # Draw construction site background lines
        cv2.line(canvas, (0, 360), (640, 360), (70, 70, 70), 2)
        cv2.putText(canvas, "LIVE CAMERA FEED - BUILDTRACK CV", (15, 460), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (180, 180, 180), 1)
        return canvas


mock_detector = MockCVDetector()
