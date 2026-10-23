import asyncio
import logging
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import AsyncGenerator, Dict, List, Optional
import cv2
import numpy as np
from app.core.config import settings
from app.cv.mock_detector import mock_detector
from app.cv.service import cv_service
from app.db.redis import get_redis_binary_client, key_camera_error, key_camera_frame, key_camera_frame_seq

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


RECORDING_NAME = re.compile(r"^\d{8}-\d{6}\.mp4$")


def recordings_dir(camera_id: str) -> Path:
    return Path(settings.STORAGE_LOCAL_PATH).resolve() / "recordings" / camera_id


class SegmentRecorder:
    """Writes frames to rolling MP4 segments on local disk and prunes old ones."""

    def __init__(self, camera_id: str):
        self.dir = recordings_dir(camera_id)
        self.fps = max(1, settings.CAMERA_RECORDING_FPS)
        self._writer = None
        self._size = None
        self._segment_started = 0.0
        self._last_write = 0.0

    def write(self, frame: np.ndarray) -> None:
        now = time.monotonic()
        if now - self._last_write < 1.0 / self.fps:
            return
        h, w = frame.shape[:2]
        if (
            self._writer is None
            or (w, h) != self._size
            or now - self._segment_started >= settings.CAMERA_RECORDING_SEGMENT_SECONDS
        ):
            self._rotate(w, h)
        self._writer.write(frame)
        self._last_write = now

    def _rotate(self, w: int, h: int) -> None:
        self.close()
        self.dir.mkdir(parents=True, exist_ok=True)
        name = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S") + ".mp4"
        self._writer = cv2.VideoWriter(str(self.dir / name), cv2.VideoWriter_fourcc(*"mp4v"), self.fps, (w, h))
        self._size = (w, h)
        self._segment_started = time.monotonic()
        self._prune()

    def _prune(self) -> None:
        cutoff = time.time() - settings.CAMERA_RECORDING_RETENTION_HOURS * 3600
        for f in self.dir.glob("*.mp4"):
            try:
                if f.stat().st_mtime < cutoff:
                    f.unlink()
            except OSError:
                pass

    def close(self) -> None:
        if self._writer is not None:
            self._writer.release()
            self._writer = None


def list_recordings(camera_id: str) -> List[dict]:
    d = recordings_dir(camera_id)
    if not d.is_dir():
        return []
    items = []
    for f in sorted(d.glob("*.mp4"), reverse=True):
        if not RECORDING_NAME.match(f.name):
            continue
        st = f.stat()
        started = datetime.strptime(f.stem, "%Y%m%d-%H%M%S").replace(tzinfo=timezone.utc)
        items.append({
            "name": f.name,
            "started_at": started,
            "ended_at": datetime.fromtimestamp(st.st_mtime, timezone.utc),
            "size_bytes": st.st_size,
        })
    return items


def recording_path(camera_id: str, name: str) -> Optional[Path]:
    """Path of a recording, or None for invalid names (prevents path traversal)."""
    if not RECORDING_NAME.match(name):
        return None
    path = recordings_dir(camera_id) / name
    return path if path.is_file() else None


class CameraStreamWorker:
    def __init__(self, camera_id: str, site_id: str, stream_url: str, fps: int = 2, zone_id: Optional[str] = None):
        self.camera_id = camera_id
        self.site_id = site_id
        self.zone_id = zone_id
        self.stream_url = stream_url
        # fps = PPE analysis rate; frames are pulled and served faster for viewing
        self.fps = fps
        self.view_fps = max(settings.CAMERA_VIEW_FPS, fps)
        self.frame_interval = 1.0 / self.view_fps
        self.analyze_every = max(1, round(self.view_fps / max(fps, 1)))
        self.latest_frame_jpeg: Optional[bytes] = None
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._analysis_task: Optional[asyncio.Task] = None
        self._analysis_queue: asyncio.Queue = asyncio.Queue(maxsize=1)
        self._recorder = SegmentRecorder(camera_id) if settings.CAMERA_RECORDING_ENABLED else None
        self._security = None
        if settings.SECURITY_ANALYSIS_ENABLED:
            from app.cv.security import SecurityAnalyzer

            self._security = SecurityAnalyzer(camera_id, site_id, zone_id)

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._run_loop())
        self._analysis_task = asyncio.create_task(self._run_analysis_loop())

    async def stop(self) -> None:
        self._running = False
        for t in (self._task, self._analysis_task):
            if t and not t.done():
                t.cancel()
                try:
                    await t
                except asyncio.CancelledError:
                    pass

    async def _run_analysis_loop(self) -> None:
        """Decoupled CV analysis loop with dropped-frame queue of size 1 so streaming never stalls."""
        while self._running:
            try:
                frame_item = await self._analysis_queue.get()
                frame, jpeg_bytes, frame_no = frame_item
                try:
                    result = await cv_service.process_frame(
                        camera_id=self.camera_id,
                        site_id=self.site_id,
                        frame_bytes=jpeg_bytes,
                        frame_ndarray=frame,
                    )
                    if self._security:
                        persons = result["persons_count"] if str(result.get("detector", "")).startswith("yolo") else None
                        await self._security.analyse(frame, persons)
                except Exception as e:
                    logger.error(f"Error in CV analysis for camera {self.camera_id}: {e}", exc_info=True)
                finally:
                    self._analysis_queue.task_done()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Unexpected error in analysis queue worker for camera {self.camera_id}: {e}")
                await asyncio.sleep(0.5)

    async def _publish(self, jpeg_bytes: bytes) -> None:
        """Share the latest frame with other processes (the API serves snapshots/MJPEG from it)."""
        self.latest_frame_jpeg = jpeg_bytes
        try:
            r = get_redis_binary_client()
            pipe = r.pipeline()
            pipe.set(key_camera_frame(self.camera_id), jpeg_bytes, ex=FRAME_TTL_SECONDS)
            pipe.incr(key_camera_frame_seq(self.camera_id))
            pipe.expire(key_camera_frame_seq(self.camera_id), FRAME_TTL_SECONDS * 6)
            pipe.delete(key_camera_error(self.camera_id))
            await pipe.execute()
        except Exception as e:
            logger.warning(f"Could not publish frame for camera {self.camera_id}: {e}")

    async def _report_error(self, message: str) -> None:
        try:
            await get_redis_binary_client().set(key_camera_error(self.camera_id), message.encode(), ex=300)
        except Exception:
            pass

    def _prepare(self, frame: np.ndarray) -> np.ndarray:
        h, w = frame.shape[:2]
        max_w = settings.CAMERA_VIEW_MAX_WIDTH
        if w > max_w:
            frame = cv2.resize(frame, (max_w, int(h * max_w / w)), interpolation=cv2.INTER_AREA)
        return frame

    async def _run_loop(self) -> None:
        logger.info(f"CameraWorker {self.camera_id} loop starting for {self.stream_url}")
        synthetic = is_synthetic_url(self.stream_url)
        source = self.stream_url if synthetic else resolve_stream_url(self.stream_url)
        is_file = not synthetic and "://" not in source

        cap = None
        skip = 0
        frame_no = 0
        while self._running:
            started = time.monotonic()
            try:
                if synthetic:
                    _, _, _, jpeg_bytes = mock_detector.detect_and_annotate()
                    frame = cv2.imdecode(np.frombuffer(jpeg_bytes, np.uint8), cv2.IMREAD_COLOR)
                else:
                    if cap is None or not cap.isOpened():
                        cap = await asyncio.to_thread(cv2.VideoCapture, source)
                        if not cap.isOpened():
                            logger.warning(f"Could not open stream {source}, retrying in 5s...")
                            await self._report_error("Could not open the stream")
                            cap = None
                            await asyncio.sleep(5.0)
                            continue
                        # Files are read faster than real time unless frames are skipped
                        native = cap.get(cv2.CAP_PROP_FPS) or self.view_fps
                        skip = max(0, round(native / self.view_fps) - 1) if is_file else 0

                    def read_frame():
                        for _ in range(skip):
                            cap.grab()
                        return cap.read()

                    ret, frame = await asyncio.to_thread(read_frame)
                    if not ret:
                        # End of a file source (loop it) or a dropped network stream (reconnect)
                        cap.release()
                        cap = None
                        await asyncio.sleep(0.5)
                        continue

                frame = self._prepare(frame)
                ok, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
                if not ok:
                    continue
                jpeg_bytes = buf.tobytes()
                await self._publish(jpeg_bytes)
                if self._recorder:
                    await asyncio.to_thread(self._recorder.write, frame)

                # PPE and equipment analysis runs decoupled from video streaming
                if frame_no % self.analyze_every == 0:
                    if self._analysis_queue.full():
                        try:
                            self._analysis_queue.get_nowait()
                            self._analysis_queue.task_done()
                        except (asyncio.QueueEmpty, ValueError):
                            pass
                    try:
                        self._analysis_queue.put_nowait((frame.copy(), jpeg_bytes, frame_no))
                    except (asyncio.QueueFull, Exception):
                        pass
                frame_no += 1

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in camera {self.camera_id} loop: {e}", exc_info=True)
                await self._report_error(str(e))
                await asyncio.sleep(2.0)
                continue
            await asyncio.sleep(max(0.0, self.frame_interval - (time.monotonic() - started)))

        if cap is not None:
            cap.release()
        if self._recorder:
            self._recorder.close()
        logger.info(f"CameraWorker {self.camera_id} loop stopped.")


@dataclass
class CameraSpec:
    camera_id: str
    site_id: str
    stream_url: str
    fps: int
    zone_id: Optional[str] = None


class StreamManager:
    def __init__(self):
        self._workers: Dict[str, CameraStreamWorker] = {}

    async def start_camera(self, camera_id: str, site_id: str, stream_url: str, fps: int = 2, zone_id: Optional[str] = None) -> bool:
        if camera_id in self._workers:
            await self.stop_camera(camera_id)

        worker = CameraStreamWorker(camera_id=camera_id, site_id=site_id, stream_url=stream_url, fps=fps, zone_id=zone_id)
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
            if (
                spec is None
                or spec.stream_url != worker.stream_url
                or spec.fps != worker.fps
                or spec.zone_id != getattr(worker, "zone_id", None)
            ):
                logger.info(f"Stopping camera worker {camera_id}")
                await self.stop_camera(camera_id)
        for camera_id, spec in wanted.items():
            if camera_id not in self._workers:
                logger.info(f"Starting camera worker {camera_id} ({spec.stream_url})")
                await self.start_camera(camera_id, spec.site_id, spec.stream_url, spec.fps, zone_id=spec.zone_id)

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
    """Multipart MJPEG for browsers, sending each new frame the video handler publishes."""
    r = get_redis_binary_client()
    last_seq = None
    idle_since = time.monotonic()
    while True:
        try:
            seq = await r.get(key_camera_frame_seq(camera_id))
        except Exception:
            seq = None
        if seq is not None and seq != last_seq:
            jpeg = await get_latest_frame(camera_id)
            if jpeg:
                last_seq = seq
                idle_since = time.monotonic()
                yield (
                    b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: "
                    + str(len(jpeg)).encode()
                    + b"\r\n\r\n"
                    + jpeg
                    + b"\r\n"
                )
        elif time.monotonic() - idle_since > 60:
            return  # camera stopped producing; let the client reconnect
        await asyncio.sleep(1.0 / max(settings.CAMERA_VIEW_FPS, 1))


stream_manager = StreamManager()
