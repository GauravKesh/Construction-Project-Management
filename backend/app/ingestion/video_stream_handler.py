import asyncio
import logging
import time
from typing import AsyncGenerator, Dict, Optional
import cv2
import numpy as np
from app.cv.mock_detector import mock_detector
from app.cv.service import cv_service

logger = logging.getLogger("video_stream_handler")


class CameraStreamWorker:
    def __init__(self, camera_id: str, site_id: str, stream_url: str, fps: int = 2):
        self.camera_id = camera_id
        self.site_id = site_id
        self.stream_url = stream_url
        self.fps = fps
        self.frame_interval = 1.0 / max(fps, 1)
        self.latest_frame_jpeg: Optional[bytes] = None
        self._running = False
        self._task: Optional[asyncio.Task] = None

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._run_loop())

    async def stop(self) -> None:
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def _run_loop(self) -> None:
        logger.info(f"CameraWorker {self.camera_id} loop starting for {self.stream_url}")
        is_synthetic = (
            self.stream_url.startswith("mock://")
            or self.stream_url.startswith("test://")
            or "demo" in self.stream_url.lower()
        )

        cap = None
        while self._running:
            try:
                if is_synthetic:
                    # Synthetic / simulator stream
                    _, _, _, jpeg_bytes = mock_detector.detect_and_annotate()
                    self.latest_frame_jpeg = jpeg_bytes

                    # Push frame to CV service
                    await cv_service.process_frame(
                        camera_id=self.camera_id,
                        site_id=self.site_id,
                        frame_bytes=jpeg_bytes,
                    )
                    await asyncio.sleep(self.frame_interval)
                else:
                    # OpenCV VideoCapture for RTSP / HTTP stream
                    if cap is None or not cap.isOpened():
                        cap = cv2.VideoCapture(self.stream_url)
                        if not cap.isOpened():
                            logger.warning(f"Could not open stream {self.stream_url}, retrying in 2s...")
                            await asyncio.sleep(2.0)
                            continue

                    ret, frame = cap.read()
                    if not ret:
                        logger.warning(f"Failed to read frame from {self.stream_url}. Reconnecting...")
                        cap.release()
                        cap = None
                        await asyncio.sleep(2.0)
                        continue

                    _, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
                    jpeg_bytes = buf.tobytes()
                    self.latest_frame_jpeg = jpeg_bytes

                    # Push frame to CV service
                    await cv_service.process_frame(
                        camera_id=self.camera_id,
                        site_id=self.site_id,
                        frame_bytes=jpeg_bytes,
                    )
                    await asyncio.sleep(self.frame_interval)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in camera {self.camera_id} loop: {e}", exc_info=True)
                await asyncio.sleep(2.0)

        if cap is not None:
            cap.release()
        logger.info(f"CameraWorker {self.camera_id} loop stopped.")


class StreamManager:
    def __init__(self):
        self._workers: Dict[str, CameraStreamWorker] = {}

    async def start_camera(self, camera_id: str, site_id: str, stream_url: str, fps: int = 2) -> bool:
        if camera_id in self._workers:
            await self.stop_camera(camera_id)

        worker = CameraStreamWorker(
            camera_id=camera_id,
            site_id=site_id,
            stream_url=stream_url,
            fps=fps,
        )
        worker.start()
        self._workers[camera_id] = worker
        return True

    async def stop_camera(self, camera_id: str) -> None:
        worker = self._workers.pop(camera_id, None)
        if worker:
            await worker.stop()

    def is_streaming(self, camera_id: str) -> bool:
        worker = self._workers.get(camera_id)
        return worker is not None and worker._running

    async def get_latest_frame_jpeg(self, camera_id: str) -> Optional[bytes]:
        worker = self._workers.get(camera_id)
        if worker and worker.latest_frame_jpeg:
            return worker.latest_frame_jpeg
        # No live frame: return nothing rather than a synthetic image posing as a feed
        return None

    async def generate_mjpeg_stream(self, camera_id: str) -> AsyncGenerator[bytes, None]:
        """
        Yields multipart/x-mixed-replace boundary chunks for real-time video preview.
        """
        while True:
            jpeg = await self.get_latest_frame_jpeg(camera_id)
            if jpeg:
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n" + jpeg + b"\r\n"
                )
            await asyncio.sleep(0.5)


stream_manager = StreamManager()
