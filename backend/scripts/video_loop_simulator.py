import argparse
import asyncio
import csv
import logging
import signal
import sys
import time
from typing import Optional
import cv2
import numpy as np
from sqlalchemy import select
from pathlib import Path

# Allow `python scripts/<name>.py` from backend/ (as start.sh and the Makefile do)
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings
from app.core.logging import setup_logging
from app.cv.service import cv_service
from app.db.models.camera import Camera
from app.db.models.project import Site
from app.db.postgres import AsyncSessionLocal


def _open_labels(path):
    if not path:
        return None
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    return open(path, "w", newline="")


logger = logging.getLogger("video_simulator")


def generate_synthetic_frame(frame_num: int, has_violation: bool) -> bytes:
    """
    Generates a realistic synthetic CCTV frame with simulated construction workers.
    """
    width, height = 640, 480
    # Background (concrete / construction dirt gray-brown)
    frame = np.full((height, width, 3), (70, 75, 80), dtype=np.uint8)

    # Draw scaffolding grid / girders
    for x in range(50, width, 100):
        cv2.line(frame, (x, 50), (x, 430), (120, 120, 130), 3)
    for y in range(80, height, 80):
        cv2.line(frame, (50, y), (590, y), (120, 120, 130), 2)
    # Diagonal braces
    cv2.line(frame, (50, 80), (150, 160), (100, 100, 110), 2)
    cv2.line(frame, (150, 80), (50, 160), (100, 100, 110), 2)

    # Worker 1 (Always compliant: Helmet + Vest)
    w1_x = 180 + int(np.sin(frame_num * 0.1) * 20)
    w1_y = 220
    # Head & Helmet (Yellow)
    cv2.circle(frame, (w1_x, w1_y), 22, (0, 220, 255), -1)
    # Body with Vest (High-vis fluorescent yellow-green)
    cv2.rectangle(frame, (w1_x - 25, w1_y + 22), (w1_x + 25, w1_y + 110), (0, 255, 180), -1)
    # Legs
    cv2.line(frame, (w1_x - 12, w1_y + 110), (w1_x - 12, w1_y + 190), (40, 40, 40), 6)
    cv2.line(frame, (w1_x + 12, w1_y + 110), (w1_x + 12, w1_y + 190), (40, 40, 40), 6)

    # Worker 2 (Violator if has_violation is True: Missing Helmet or Vest)
    w2_x = 380 + int(np.cos(frame_num * 0.1) * 20)
    w2_y = 210
    if has_violation:
        # Bare head (skin tone, NO HELMET)
        cv2.circle(frame, (w2_x, w2_y), 20, (140, 180, 210), -1)
        # Regular blue shirt (NO HIGH-VIS VEST)
        cv2.rectangle(frame, (w2_x - 25, w2_y + 20), (w2_x + 25, w2_y + 110), (180, 100, 50), -1)
    else:
        # Fully compliant Worker 2
        cv2.circle(frame, (w2_x, w2_y), 22, (0, 220, 255), -1)
        cv2.rectangle(frame, (w2_x - 25, w2_y + 22), (w2_x + 25, w2_y + 110), (0, 255, 180), -1)

    cv2.line(frame, (w2_x - 12, w2_y + 110), (w2_x - 12, w2_y + 190), (40, 40, 40), 6)
    cv2.line(frame, (w2_x + 12, w2_y + 110), (w2_x + 12, w2_y + 190), (40, 40, 40), 6)

    # Timestamp overlay
    timestamp_str = time.strftime("%Y-%m-%d %H:%M:%S")
    cv2.putText(frame, f"CAM-01 [LIVE] {timestamp_str}", (15, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)

    _, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
    return buf.tobytes()


async def run_video_loop(
    video_path: Optional[str] = None,
    fps: int = 2,
    violation_interval: int = 5,
    labels_out: Optional[str] = None,
    max_frames: Optional[int] = None,
):
    setup_logging(settings.LOG_LEVEL)
    logger.info("Initializing Video Loop Simulator for CV Inference...")

    # Load camera & site from database
    async with AsyncSessionLocal() as session:
        cam_res = await session.execute(select(Camera).limit(1))
        camera = cam_res.scalar_one_or_none()
        if not camera:
            logger.error("No camera found in database. Please run 'python -m app.cli seed' first.")
            sys.exit(1)
        camera_id = str(camera.id)
        site_id = str(camera.site_id)
        cam_code = camera.camera_code

    logger.info(f"Target camera: {cam_code} ({camera_id}), Site: {site_id}, FPS: {fps}")

    running = True

    def _sig_handler():
        nonlocal running
        logger.info("Stopping video simulator...")
        running = False

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _sig_handler)
        except (NotImplementedError, RuntimeError):
            pass

    cap = None
    if video_path:
        logger.info(f"Opening video file: {video_path}")
        cap = cv2.VideoCapture(video_path)

    frame_interval = 1.0 / max(fps, 1)
    frame_count = 0
    # Ground truth only exists for synthetic frames (we drew the violation ourselves)
    labels_file = _open_labels(labels_out)
    labels = csv.writer(labels_file) if labels_file else None
    if labels:
        labels.writerow(["frame", "source", "gt_violation", "pred_violation", "pred_missing_ppe", "detector"])

    try:
        while running and (max_frames is None or frame_count < max_frames):
            frame_count += 1
            has_violation = (frame_count % violation_interval == 0)

            source = "synthetic"
            if cap and cap.isOpened():
                source = "video"
                ret, frame = cap.read()
                if not ret:
                    # Loop video from start
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    ret, frame = cap.read()

                if ret:
                    _, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
                    frame_bytes = buf.tobytes()
                else:
                    source = "synthetic"
                    frame_bytes = generate_synthetic_frame(frame_count, has_violation)
            else:
                frame_bytes = generate_synthetic_frame(frame_count, has_violation)

            # Process frame through CV service
            res = await cv_service.process_frame(
                camera_id=camera_id,
                site_id=site_id,
                frame_bytes=frame_bytes,
                # Only force the mock's verdict for synthetic frames; real video has no label
                simulate_violation=has_violation if source == "synthetic" else None,
            )
            if labels:
                labels.writerow([
                    frame_count,
                    source,
                    int(has_violation) if source == "synthetic" else "",
                    int(not res.get("compliant")),
                    ";".join(res.get("missing_ppe", [])),
                    res.get("detector"),
                ])

            status = "VIOLATION" if not res.get("compliant") else "COMPLIANT"
            missing = res.get("missing_ppe", [])
            logger.info(f"Frame #{frame_count} processed -> Status: {status}, Missing PPE: {missing}")

            await asyncio.sleep(frame_interval)

    finally:
        if labels_file:
            labels_file.close()
        if cap:
            cap.release()
        logger.info("Video Loop Simulator terminated.")


def main():
    parser = argparse.ArgumentParser(description="Video Stream & CV Inference Simulator")
    parser.add_argument("--video-path", type=str, default=None, help="Path to video file (optional)")
    parser.add_argument("--fps", type=int, default=2, help="Sampling FPS (default: 2)")
    parser.add_argument("--violation-interval", type=int, default=5, help="Every N frames inject a violation (default: 5)")
    parser.add_argument("--labels-out", type=str, default=None, help="CSV path for per-frame ground truth vs prediction")
    parser.add_argument("--frames", type=int, default=None, help="Stop after N frames (default: run forever)")
    args = parser.parse_args()

    try:
        asyncio.run(run_video_loop(
            video_path=args.video_path,
            fps=args.fps,
            violation_interval=args.violation_interval,
            labels_out=args.labels_out,
            max_frames=args.frames,
        ))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
