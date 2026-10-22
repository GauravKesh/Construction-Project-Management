"""
Camera feeds served as MJPEG over HTTP.

A feed reads a video file (looped, paced to real time) or draws a synthetic site
scene, and encodes JPEG frames at the configured rate. Frames are only produced
while someone is watching, so idle cameras cost no CPU.
"""
import logging
import math
import threading
import time
from pathlib import Path
from typing import Optional
import cv2
import numpy as np

logger = logging.getLogger("simulator.cameras")

# Keep producing for this long after the last client request
IDLE_GRACE_SECONDS = 10.0


class CameraFeed:
    def __init__(self, name: str, source: str, fps: float = 10.0, width: int = 960, quality: int = 80, label: bool = True):
        self.name = name
        self.source = source
        self.fps = max(1.0, float(fps))
        self.width = int(width)
        self.quality = int(quality)
        self.label = label
        self.synthetic = source.startswith("synthetic")
        from .audio import AudioFeed

        # Companion audio: the video's soundtrack when it has one, otherwise a generated soundscape
        self.audio = AudioFeed(name, None if self.synthetic else source, seed=sum(map(ord, name)))
        if not self.synthetic and not Path(source).exists():
            raise FileNotFoundError(f"Camera '{name}': video file not found: {source}")

        self._frame: Optional[bytes] = None
        self._frame_id = 0
        self._cond = threading.Condition()
        self._demand_until = 0.0
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True, name=f"camera-{name}")
        self.resolution: Optional[str] = None

    # --- consumer side -------------------------------------------------------------
    def start(self) -> None:
        self._thread.start()
        self.audio.start()

    def stop(self) -> None:
        self.audio.stop()
        self._stop.set()
        with self._cond:
            self._cond.notify_all()

    def touch(self) -> None:
        """Signal demand; the producer runs while requests keep arriving."""
        self._demand_until = time.monotonic() + IDLE_GRACE_SECONDS
        with self._cond:
            self._cond.notify_all()

    def wait_frame(self, after_id: int, timeout: float = 5.0):
        """Block until a frame newer than after_id exists; returns (frame_id, jpeg) or (after_id, None)."""
        self.touch()
        deadline = time.monotonic() + timeout
        with self._cond:
            while self._frame_id <= after_id and not self._stop.is_set():
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    return after_id, None
                self._cond.wait(remaining)
            return self._frame_id, self._frame

    def snapshot(self, timeout: float = 5.0) -> Optional[bytes]:
        # An idle feed's last frame may be stale, so wait for a fresh one; a live feed's current frame is fine
        fresh_needed = self._idle() or self._frame is None
        _, jpeg = self.wait_frame(self._frame_id if fresh_needed else self._frame_id - 1, timeout)
        return jpeg

    def describe(self) -> dict:
        return {
            "name": self.name,
            "source": "synthetic" if self.synthetic else Path(self.source).name,
            "fps": self.fps,
            "width": self.width,
            "resolution": self.resolution,
            "streaming": time.monotonic() < self._demand_until,
            "audio": self.audio.describe(),
        }

    # --- producer side -------------------------------------------------------------
    def _publish(self, frame: np.ndarray) -> None:
        h, w = frame.shape[:2]
        if w > self.width:
            frame = cv2.resize(frame, (self.width, int(h * self.width / w)), interpolation=cv2.INTER_AREA)
        if self.label:
            stamp = f"{self.name}  {time.strftime('%Y-%m-%d %H:%M:%S')}"
            cv2.putText(frame, stamp, (12, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), 4, cv2.LINE_AA)
            cv2.putText(frame, stamp, (12, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 1, cv2.LINE_AA)
        ok, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), self.quality])
        if not ok:
            return
        self.resolution = f"{frame.shape[1]}x{frame.shape[0]}"
        with self._cond:
            self._frame = buf.tobytes()
            self._frame_id += 1
            self._cond.notify_all()

    def _idle(self) -> bool:
        return time.monotonic() >= self._demand_until

    def _run(self) -> None:
        cap = None
        step = 1
        tick = 1.0 / self.fps
        t = 0
        while not self._stop.is_set():
            if self._idle():
                if cap is not None:
                    cap.release()
                    cap = None
                with self._cond:
                    self._cond.wait(1.0)
                continue

            started = time.monotonic()
            try:
                if self.synthetic:
                    frame = synthetic_frame(t, self.width)
                    t += 1
                else:
                    if cap is None:
                        cap = cv2.VideoCapture(self.source)
                        native = cap.get(cv2.CAP_PROP_FPS) or self.fps
                        # Skip frames so playback stays real-time at the output rate
                        step = max(1, round(native / self.fps))
                    for _ in range(step - 1):
                        cap.grab()
                    ok, frame = cap.read()
                    if not ok:
                        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)  # loop
                        ok, frame = cap.read()
                        if not ok:
                            logger.error(f"Camera '{self.name}': cannot read {self.source}")
                            self._stop.wait(2.0)
                            continue
                self._publish(frame)
            except Exception:
                logger.exception(f"Camera '{self.name}' frame error")
            self._stop.wait(max(0.0, tick - (time.monotonic() - started)))

        if cap is not None:
            cap.release()


def camera_name_for(path: Path) -> str:
    """Stable, URL-safe camera name derived from a video file name."""
    slug = "".join(ch if ch.isalnum() else "-" for ch in path.stem.lower())
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug.strip("-") or "video"


def discover_videos(directory: str, extensions) -> dict:
    """{camera_name: absolute_path} for every video file directly inside directory."""
    root = Path(directory)
    if not root.is_dir():
        return {}
    exts = {e.lower() for e in extensions}
    found = {}
    for path in sorted(root.iterdir()):
        if path.is_file() and path.suffix.lower() in exts and not path.name.startswith("."):
            name = camera_name_for(path)
            base, n = name, 2
            while name in found:  # same stem, different extension
                name, n = f"{base}-{n}", n + 1
            found[name] = str(path.resolve())
    return found


def synthetic_frame(t: int, width: int = 960) -> np.ndarray:
    """A simple animated site scene: scaffolding, a crane and walking workers (some without PPE)."""
    height = int(width * 9 / 16)
    img = np.full((height, width, 3), (64, 72, 80), dtype=np.uint8)
    cv2.rectangle(img, (0, int(height * 0.72)), (width, height), (52, 70, 88), -1)  # ground
    for x in range(int(width * 0.08), int(width * 0.55), int(width * 0.07)):  # scaffolding
        cv2.line(img, (x, int(height * 0.2)), (x, int(height * 0.72)), (140, 140, 150), 3)
    for y in range(int(height * 0.25), int(height * 0.72), int(height * 0.12)):
        cv2.line(img, (int(width * 0.08), y), (int(width * 0.53), y), (140, 140, 150), 2)
    # crane with swinging hook
    cx = int(width * 0.78)
    cv2.line(img, (cx, int(height * 0.72)), (cx, int(height * 0.12)), (0, 170, 230), 6)
    cv2.line(img, (int(width * 0.55), int(height * 0.14)), (int(width * 0.95), int(height * 0.14)), (0, 170, 230), 5)
    hook_x = int(width * 0.62 + math.sin(t / 25) * width * 0.08)
    cv2.line(img, (hook_x, int(height * 0.14)), (hook_x, int(height * 0.45)), (200, 200, 200), 1)
    cv2.rectangle(img, (hook_x - 18, int(height * 0.45)), (hook_x + 18, int(height * 0.5)), (60, 60, 160), -1)
    # workers: (phase, has_helmet, has_vest)
    for i, (phase, helmet, vest) in enumerate([(0, True, True), (2.1, True, False), (4.2, False, True), (1.3, True, True)]):
        x = int((width * (0.15 + 0.2 * i) + math.sin(t / 30 + phase) * width * 0.05) % width)
        y = int(height * 0.62)
        body = (0, 230, 180) if vest else (170, 90, 40)
        cv2.rectangle(img, (x - 14, y - 40), (x + 14, y + 20), body, -1)
        cv2.line(img, (x - 7, y + 20), (x - 7, y + 55), (35, 35, 35), 5)
        cv2.line(img, (x + 7, y + 20), (x + 7, y + 55), (35, 35, 35), 5)
        cv2.circle(img, (x, y - 54), 13, (150, 185, 215), -1)
        if helmet:
            cv2.ellipse(img, (x, y - 60), (15, 10), 0, 180, 360, (0, 215, 255), -1)
    return img
