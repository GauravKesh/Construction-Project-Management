import asyncio
import gc
import logging
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple
from app.core.config import settings
from app.cv.mock_detector import mock_detector
from app.cv.ppe_rules import (
    EQUIPMENT_CLASSES,
    HAZARD_MACHINERY_CLASSES,
    evaluate_frame_ppe,
    normalize_class,
    required_classes_supported,
)

logger = logging.getLogger("cv_detector")


def compute_box_iou(boxA: Sequence[float], boxB: Sequence[float]) -> float:
    """Computes Intersection over Union (IoU) of two 2D boxes [x1, y1, x2, y2]."""
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])
    inter = max(0.0, xB - xA) * max(0.0, yB - yA)
    areaA = max(0.0, boxA[2] - boxA[0]) * max(0.0, boxA[3] - boxA[1])
    areaB = max(0.0, boxB[2] - boxB[0]) * max(0.0, boxB[3] - boxB[1])
    union = areaA + areaB - inter
    if union <= 0.0:
        return 0.0
    return inter / union


def merge_model_detections(
    raw_detections: List[Dict[str, Any]],
    iou_threshold: float = 0.45,
) -> List[Dict[str, Any]]:
    """
    Merges detections from multiple YOLO models.

    - Overlapping person boxes across models are deduplicated, keeping the highest confidence box.
    - Specific construction machinery (e.g. dump_truck, excavator) supersedes generic COCO 'truck'.
    - PPE items (helmet, vest, no_helmet, etc.) attached to person regions are never suppressed by person boxes.
    """
    if not raw_detections:
        return []

    # Sort all detections by confidence descending
    sorted_dets = sorted(raw_detections, key=lambda d: d.get("confidence", 0.0), reverse=True)
    merged: List[Dict[str, Any]] = []

    for det in sorted_dets:
        c_norm = normalize_class(det.get("class_name", ""))
        bbox = det.get("bbox", [])
        if len(bbox) != 4:
            continue

        suppressed = False
        for idx, existing in enumerate(merged):
            e_norm = normalize_class(existing.get("class_name", ""))
            e_box = existing.get("bbox", [])
            iou = compute_box_iou(bbox, e_box)

            if iou < iou_threshold:
                continue

            # Case 1: Same class detected by two models (e.g. Person detected by COCO and PPE model)
            if c_norm == e_norm:
                suppressed = True
                break

            # Case 2: Specific machinery vs generic vehicle (e.g., dump_truck vs truck)
            if c_norm in HAZARD_MACHINERY_CLASSES and e_norm == "truck" and c_norm != "truck":
                # Replace the generic truck with the more specific machinery
                merged[idx] = det
                suppressed = True
                break
            elif e_norm in HAZARD_MACHINERY_CLASSES and c_norm == "truck" and e_norm != "truck":
                suppressed = True
                break

        if not suppressed:
            merged.append(det)

    return merged


class CVDetector:
    def __init__(self):
        self.mode: Optional[str] = None
        self.model_paths: Optional[str] = None
        self.models: List[Tuple[Any, str]] = []  # List of (YOLO instance, model_filename)
        self.detector_name: str = "mock"
        self._init_models()

    def unload(self) -> None:
        """Unloads models and releases GPU/RAM memory."""
        self.models.clear()
        self.detector_name = "mock"
        self.mode = None
        self.model_paths = None
        gc.collect()
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
                torch.mps.empty_cache()
        except Exception:
            pass
        logger.info("CV models unloaded from memory.")

    def _init_models(self) -> None:
        """Initializes single or multi-model YOLO detectors according to settings."""
        self.mode = settings.CV_MODE
        self.model_paths = settings.CV_MODEL_PATHS or settings.CV_MODEL_PATH
        self.models.clear()
        self.detector_name = "mock"

        if self.mode != "yolo":
            return

        try:
            from ultralytics import YOLO
        except ImportError:
            logger.error("CV_MODE=yolo but ultralytics is not installed. Falling back to mock.")
            self.detector_name = "mock-fallback"
            return

        raw_paths = [p.strip() for p in self.model_paths.split(",") if p.strip()]
        loaded_names = []
        all_class_names = []

        for p_str in raw_paths:
            path = Path(p_str)
            if not path.exists():
                logger.warning(f"Model path '{p_str}' not found on disk. Skipping.")
                continue
            try:
                model = YOLO(str(path))
                self.models.append((model, path.name))
                loaded_names.append(path.stem)
                all_class_names.extend(list(getattr(model, "names", {}).values()))
                logger.info(f"Loaded YOLO model: {path.name} with {len(model.names)} classes.")
            except Exception as e:
                logger.error(f"Failed to load YOLO model from '{p_str}': {e}")

        if not self.models:
            logger.error("CV_MODE=yolo but no models could be loaded. Falling back to mock detector.")
            self.detector_name = "mock-fallback"
            return

        if not required_classes_supported(all_class_names):
            logger.warning(
                f"Loaded models ({loaded_names}) do not cover all required PPE classes. "
                "Workers may be reported as non-compliant unless PPE weights are included in CV_MODEL_PATHS."
            )

        self.detector_name = f"yolo:{'+'.join(loaded_names)}"
        logger.info(f"CVDetector initialized in multi-model mode: {self.detector_name}")

    async def detect(
        self,
        image_bytes: Optional[bytes] = None,
        frame_ndarray: Optional[Any] = None,
        simulate_violation: Optional[bool] = None,
    ) -> Dict[str, Any]:
        """
        Runs detection asynchronously in a thread pool. Supports direct numpy frames to skip
        redundant JPEG decoding.

        Returns dict: detections, compliant, missing_ppe, persons_count, violating_persons,
        persons, equipment_counts, machinery_hazards, has_machinery_hazard, annotated_bytes,
        detector, inference_seconds.
        """
        # Pick up runtime config updates (PUT /cv/config)
        curr_paths = settings.CV_MODEL_PATHS or settings.CV_MODEL_PATH
        if settings.CV_MODE != self.mode or curr_paths != self.model_paths:
            await asyncio.to_thread(self._init_models)

        started = time.perf_counter()

        if self.models:
            if frame_ndarray is None and not image_bytes:
                raise ValueError("No frame or image bytes provided for YOLO inference")
            result = await asyncio.to_thread(
                self._run_yolo_inference,
                image_bytes=image_bytes,
                frame_ndarray=frame_ndarray,
            )
            detector = self.detector_name
        else:
            detections, _, _, annotated = await asyncio.to_thread(
                mock_detector.detect_and_annotate,
                image_bytes=image_bytes,
                simulate_violation=simulate_violation,
            )
            # Evaluate mock detections using rules to keep return schema uniform
            result = evaluate_frame_ppe(detections, proximity_margin=settings.MACHINERY_PROXIMITY_MARGIN_PX)
            result.update(
                detections=detections,
                annotated_bytes=annotated,
            )
            detector = self.detector_name

        result.update(
            detector=detector,
            inference_seconds=time.perf_counter() - started,
        )
        return result

    def _run_yolo_inference(
        self,
        image_bytes: Optional[bytes] = None,
        frame_ndarray: Optional[Any] = None,
    ) -> Dict[str, Any]:
        import cv2
        import numpy as np

        # Use passed numpy frame directly or decode image bytes
        if frame_ndarray is not None:
            img = frame_ndarray.copy()
        elif image_bytes:
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if img is None:
                raise ValueError("Could not decode frame bytes as an image")
        else:
            raise ValueError("No valid frame supplied for inference")

        h, w = img.shape[:2]

        # Downscale large frames (e.g. 4K) for fast inference if needed
        infer_img = img
        scale_x, scale_y = 1.0, 1.0
        if w > 1280:
            target_w = 1280
            target_h = int(h * (1280.0 / w))
            infer_img = cv2.resize(img, (target_w, target_h))
            scale_x = w / float(target_w)
            scale_y = h / float(target_h)

        raw_detections: List[Dict[str, Any]] = []

        for model, model_name in self.models:
            results = model(infer_img, conf=settings.CV_CONFIDENCE_THRESHOLD, verbose=False)
            if results and len(results) > 0:
                for box in results[0].boxes:
                    cls_id = int(box.cls[0].item())
                    orig_bbox = [float(v) for v in box.xyxy[0].tolist()]
                    # Rescale coordinates back to original frame size
                    rescaled_bbox = [
                        round(orig_bbox[0] * scale_x, 2),
                        round(orig_bbox[1] * scale_y, 2),
                        round(orig_bbox[2] * scale_x, 2),
                        round(orig_bbox[3] * scale_y, 2),
                    ]
                    raw_detections.append({
                        "class_name": model.names.get(cls_id, str(cls_id)),
                        "confidence": round(float(box.conf[0].item()), 4),
                        "bbox": rescaled_bbox,
                        "source_model": model_name,
                    })

        # Merge and deduplicate detections from all active models
        merged_detections = merge_model_detections(raw_detections)

        # Evaluate PPE compliance, equipment counts, and machinery proximity
        eval_result = evaluate_frame_ppe(
            merged_detections,
            proximity_margin=settings.MACHINERY_PROXIMITY_MARGIN_PX,
        )

        # Annotate image
        annotated_img = self._render_annotations(img, eval_result, merged_detections)
        _, jpeg_buf = cv2.imencode(".jpg", annotated_img, [int(cv2.IMWRITE_JPEG_QUALITY), 80])

        eval_result.update(
            detections=merged_detections,
            annotated_bytes=jpeg_buf.tobytes(),
        )
        return eval_result

    def _render_annotations(
        self,
        img: Any,
        eval_result: Dict[str, Any],
        detections: List[Dict[str, Any]],
    ) -> Any:
        import cv2

        annotated = img.copy()

        # 1. Render machinery boxes (cyan / blue)
        for d in detections:
            c_norm = normalize_class(d.get("class_name", ""))
            if c_norm in EQUIPMENT_CLASSES:
                b = [int(v) for v in d["bbox"]]
                cv2.rectangle(annotated, (b[0], b[1]), (b[2], b[3]), (255, 191, 0), 2)  # Deep Sky Blue
                label = f"{c_norm.upper()} ({d['confidence']:.2f})"
                cv2.putText(annotated, label, (b[0], max(15, b[1] - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 191, 0), 2)

        # 2. Render person boxes with PPE status (green = compliant, red = violating)
        persons = eval_result.get("persons", [])
        for p in persons:
            b = [int(v) for v in p["bbox"]]
            is_violating = bool(p.get("missing_ppe"))
            color = (0, 0, 240) if is_violating else (0, 210, 0)
            cv2.rectangle(annotated, (b[0], b[1]), (b[2], b[3]), color, 2)
            if is_violating:
                label = f"VIOLATION: {','.join(p['missing_ppe'])}"
            else:
                label = "COMPLIANT WORKER"
            cv2.putText(annotated, label, (b[0], max(15, b[1] - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

        # 3. Render PPE item boxes (hardhat, vest, etc.)
        for d in detections:
            c_norm = normalize_class(d.get("class_name", ""))
            if c_norm in ("helmet", "vest", "boots", "gloves"):
                b = [int(v) for v in d["bbox"]]
                cv2.rectangle(annotated, (b[0], b[1]), (b[2], b[3]), (0, 255, 255), 1)  # Yellow
                cv2.putText(annotated, c_norm, (b[0], max(12, b[1] - 4)), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 255, 255), 1)

        # 4. Highlight Proximity Hazards (Worker near active machinery)
        hazards = eval_result.get("machinery_hazards", [])
        if hazards:
            for h_info in hazards:
                pb = [int(v) for v in h_info["person_bbox"]]
                mb = [int(v) for v in h_info["machinery_bbox"]]
                pc = ((pb[0] + pb[2]) // 2, (pb[1] + pb[3]) // 2)
                mc = ((mb[0] + mb[2]) // 2, (mb[1] + mb[3]) // 2)
                # Danger connection line
                cv2.line(annotated, pc, mc, (0, 0, 255), 2, cv2.LINE_AA)
                # Distance badge
                dist_txt = f"DANGER ZONE ({h_info['distance']}px)" if not h_info.get("overlapping") else "COLLISION HAZARD"
                cv2.putText(annotated, dist_txt, ((pc[0] + mc[0]) // 2, (pc[1] + mc[1]) // 2), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 255), 2)

            # Top warning banner
            cv2.rectangle(annotated, (10, 10), (450, 45), (0, 0, 220), -1)
            cv2.putText(annotated, f"CRITICAL HAZARD: {len(hazards)} WORKER(S) NEAR MACHINERY", (18, 33), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2)

        return annotated


cv_detector = CVDetector()
