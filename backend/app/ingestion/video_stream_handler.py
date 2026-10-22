import asyncio
import logging
import time
from dataclasses import dataclass
from pathlib import Path
from typing import AsyncGenerator, Dict, List, Optional
import cv2
from app.core.config import settings
from app.cv.mock_detector import mock_detector
from app.cv.service import cv_service
from app.db.redis import get_redis_binary_client, key_camera_error, key_camera_frame

logger = logging.getLogger("video_stream_handler")

# A frame older than this means the camera is no longer streaming
FRAME_TTL_SECONDS = 10


def is_synthetic_url(url: str) -> bool:
    return url.startswith("mock://") or url.startswith("test://")


def resolve_stream_url(url: str) -> str:
    """
    Map browser-style "/videos/<file>" URLs (served by the frontend) to the file on
    disk so OpenCV can open them. Anything else (rtsp://, http://, absolute paths
    that exist) is passed through unchanged.
    """
    if url.startswith("/videos/") and not Path(url).exists():
        candidate = settings.local_video_dir / url[len("/videos/"):]
        if candidate.exists():
            return str(candidate)
    return url


@dataclass
class ProbeResult:
    ok: bool
    resolved_url: str
    width: Optional[int] = None
    height: Optional[int] = None
    fps: Optional[float] = None
    error: Optional[str] = None
    elapsed_ms: Optional[int] = None


def probe_stream(url: str, timeout_seconds: float = 8.0) -> ProbeResult:
    """Blocking: open the source and read one frame. Run in a thread."""
    started = time.perf_counter()
    if is_synthetic_url(url):
        return ProbeResult(ok=True, resolved_url=url, width=640, height=480, elapsed_ms=0)
    resolved = resolve_stream_url(url)
    timeout_ms = int(timeout_seconds * 1000)
    # Timeouts only apply when passed at construction (network sources, FFmpeg backend)
    cap = cv2.VideoCapture(
        resolved,
        cv2.CAP_ANY,
        [cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, timeout_ms, cv2.CAP_PROP_READ_TIMEOUT_MSEC, timeout_ms],
    )
    try:
        if not cap.isOpened():
            return ProbeResult(ok=False, resolved_url=resolved, error="Could not open the stream (check URL, credentials and network)")
        ret, frame = cap.read()
        if not ret or frame is None:
            return ProbeResult(ok=False, resolved_url=resolved, error="Connected, but no frame could be read")
        h, w = frame.shape[:2]
        fps = cap.get(cv2.CAP_PROP_FPS) or None
        return ProbeResult(
            ok=True,
            resolved_url=resolved,
            width=int(w),
            height=int(h),
            fps=round(float(fps), 1) if fps else None,
            elapsed_ms=int((time.perf_counter() - started) * 1000),
        )
    finally:
        cap.release()


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

    async def _publish(self, jpeg_bytes: bytes) -> None:
        """Share the latest frame with other processes (the API serves snapshots/MJPEG from it)."""
        self.latest_frame_jpeg = jpeg_bytes
        try:
            r = get_redis_binary_client()
            await r.set(key_camera_frame(self.camera_id), jpeg_bytes, ex=FRAME_TTL_SECONDS)
            await r.delete(key_camera_error(self.camera_id))
        except Exception as e:
            logger.warning(f"Could not publish frame for camera {self.camera_id}: {e}")

    async def _report_error(self, message: str) -> None:
        try:
            await get_redis_binary_client().set(key_camera_error(self.camera_id), message.encode(), ex=300)
        except Exception:
            pass

    async def _run_loop(self) -> None:
        logger.info(f"CameraWorker {self.camera_id} loop starting for {self.stream_url}")
        synthetic = is_synthetic_url(self.stream_url)
        source = self.stream_url if synthetic else resolve_stream_url(self.stream_url)

        cap = None
        while self._running:
            try:
                if synthetic:
                    _, _, _, jpeg_bytes = mock_detector.detect_and_annotate()
                else:
                    if cap is None or not cap.isOpened():
                        cap = cv2.VideoCapture(source)
                        if not cap.isOpened():
                            logger.warning(f"Could not open stream {source}, retrying in 5s...")
                            await self._report_error("Could not open the stream")
                            cap = None
                            await asyncio.sleep(5.0)
                            continue

                    ret, frame = cap.read()
                    if not ret:
                        # End of a file source (loop it) or a dropped network stream (reconnect)
                        cap.release()
                        cap = None
                        await asyncio.sleep(1.0)
                        continue
                    _, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
                    jpeg_bytes = buf.tobytes()

                await self._publish(jpeg_bytes)
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
                await self._report_error(str(e))
                await asyncio.sleep(2.0)

        if cap is not None:
            cap.release()
        logger.info(f"CameraWorker {self.camera_id} loop stopped.")


@dataclass
class CameraSpec:
    camera_id: str
    site_id: str
    stream_url: str
    fps: int


class StreamManager:
    def __init__(self):
        self._workers: Dict[str, CameraStreamWorker] = {}

    async def start_camera(self, camera_id: str, site_id: str, stream_url: str, fps: int = 2) -> bool:
        if camera_id in self._workers:
            await self.stop_camera(camera_id)

        worker = CameraStreamWorker(camera_id=camera_id, site_id=site_id, stream_url=stream_url, fps=fps)
        worker.start()
        self._workers[camera_id] = worker
        return True

    async def stop_camera(self, camera_id: str) -> None:
        worker = self._workers.pop(camera_id, None)
        if worker:
            await worker.stop()

    async def sync(self, specs: List[CameraSpec]) -> None:
        """Reconcile running workers with the camera registry: start new, stop removed, restart changed."""
        wanted = {s.camera_id: s for s in specs}
        for camera_id in list(self._workers):
            spec = wanted.get(camera_id)
            worker = self._workers[camera_id]
            if spec is None or spec.stream_url != worker.stream_url or spec.fps != worker.fps:
                logger.info(f"Stopping camera worker {camera_id}")
                await self.stop_camera(camera_id)
        for camera_id, spec in wanted.items():
            if camera_id not in self._workers:
                logger.info(f"Starting camera worker {camera_id} ({spec.stream_url})")
                await self.start_camera(camera_id, spec.site_id, spec.stream_url, spec.fps)

    def camera_ids(self) -> List[str]:
        return list(self._workers)


async def get_latest_frame(camera_id: str) -> Optional[bytes]:
    """Latest frame published by the video handler process, or None if the camera is not streaming."""
    try:
        return await get_redis_binary_client().get(key_camera_frame(camera_id))
    except Exception:
        return None


async def get_last_error(camera_id: str) -> Optional[str]:
    try:
        raw = await get_redis_binary_client().get(key_camera_error(camera_id))
        return raw.decode() if raw else None
    except Exception:
        return None


async def generate_mjpeg_stream(camera_id: str) -> AsyncGenerator[bytes, None]:
    """Multipart MJPEG chunks for browser preview, fed from the shared latest frame."""
    while True:
        jpeg = await get_latest_frame(camera_id)
        if jpeg:
            yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + jpeg + b"\r\n"
        await asyncio.sleep(0.5)


stream_manager = StreamManager()
