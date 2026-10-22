"""
Camera audio feeds, served as a live WAV stream (16 kHz, mono, 16-bit PCM).

Source per camera:
  * the video's own soundtrack, looped in real time, when it has one and ffmpeg is
    installed (optional external tool), or
  * a generated construction soundscape: machinery hum and broadband noise during
    working hours, reversing beepers, and random impact bangs.

Generated bangs are logged as ground truth (`events`) so acoustic-event detection can
be evaluated. Audio is produced once per feed and shared by all listeners, and only
while someone is listening.
"""
import logging
import math
import shutil
import struct
import subprocess
import threading
import time
from collections import deque
from datetime import datetime, timezone
from typing import Deque, List, Optional, Tuple
import numpy as np

logger = logging.getLogger("simulator.audio")

SAMPLE_RATE = 16000
CHUNK_SECONDS = 0.1
CHUNK = int(SAMPLE_RATE * CHUNK_SECONDS)
IDLE_GRACE_SECONDS = 10.0


def wav_stream_header(sample_rate: int = SAMPLE_RATE) -> bytes:
    """RIFF header for an open-ended stream (sizes set to the maximum)."""
    byte_rate = sample_rate * 2
    return (
        b"RIFF" + struct.pack("<I", 0xFFFFFFFF) + b"WAVE"
        + b"fmt " + struct.pack("<IHHIIHH", 16, 1, 1, sample_rate, byte_rate, 2, 16)
        + b"data" + struct.pack("<I", 0xFFFFFFFF)
    )


def has_audio_track(path: str) -> bool:
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return False
    try:
        out = subprocess.run(
            [ffprobe, "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", path],
            capture_output=True, text=True, timeout=10,
        )
        return bool(out.stdout.strip())
    except Exception:
        return False


class Soundscape:
    """Deterministic synthetic site audio."""

    def __init__(self, seed: int = 0, impact_rate_per_minute: float = 0.7):
        self.rng = np.random.default_rng(seed)
        self.t = 0
        self.impact_rate = impact_rate_per_minute / 60.0
        self.beeper_until = 0.0
        self.pending_impact: Optional[np.ndarray] = None

    def _activity(self) -> float:
        h = datetime.now().hour + datetime.now().minute / 60
        return 1.0 if 7 <= h < 19 else 0.2

    def next_chunk(self) -> Tuple[np.ndarray, bool]:
        n = CHUNK
        t = (self.t + np.arange(n)) / SAMPLE_RATE
        self.t += n
        act = self._activity()
        # machinery: 58 Hz engine + harmonics with slow wobble, plus broadband noise
        wobble = 1 + 0.05 * np.sin(2 * math.pi * 0.3 * t)
        hum = sum(a * np.sin(2 * math.pi * f * wobble * t) for f, a in ((58, 0.5), (116, 0.25), (174, 0.12)))
        noise = self.rng.normal(0, 0.35, n)
        signal = act * (0.12 * hum + 0.08 * noise) + 0.01 * self.rng.normal(0, 1, n)

        # reversing beeper: 1 kHz, 0.5 s on/off, for a few seconds at a time
        now = self.t / SAMPLE_RATE
        if now > self.beeper_until and self.rng.random() < act * 0.004:
            self.beeper_until = now + self.rng.uniform(3, 6)
        if now < self.beeper_until:
            gate = (np.floor(t * 2) % 2 == 0).astype(float)
            signal += 0.15 * gate * np.sin(2 * math.pi * 1000 * t)

        # impact bang: loud decaying burst
        impact = False
        if self.pending_impact is None and self.rng.random() < self.impact_rate * CHUNK_SECONDS:
            length = int(SAMPLE_RATE * 0.6)
            env = np.exp(-np.arange(length) / (SAMPLE_RATE * 0.08))
            self.pending_impact = 0.9 * env * self.rng.normal(0, 1, length)
            impact = True
        if self.pending_impact is not None:
            take = self.pending_impact[:n]
            signal[: len(take)] += take
            self.pending_impact = self.pending_impact[n:] if len(self.pending_impact) > n else None

        pcm = np.clip(signal, -1, 1) * 32767
        return pcm.astype("<i2"), impact


class AudioFeed:
    def __init__(self, name: str, video_path: Optional[str] = None, seed: int = 0):
        self.name = name
        self.events: Deque[dict] = deque(maxlen=200)  # ground truth for generated impacts
        self.use_track = bool(video_path and shutil.which("ffmpeg") and has_audio_track(video_path))
        self.video_path = video_path
        self.kind = "video soundtrack" if self.use_track else "generated soundscape"
        self.soundscape = Soundscape(seed)
        self._chunks: Deque[Tuple[int, bytes]] = deque(maxlen=50)
        self._seq = 0
        self._cond = threading.Condition()
        self._demand_until = 0.0
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True, name=f"audio-{name}")

    def start(self) -> None:
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        with self._cond:
            self._cond.notify_all()

    def touch(self) -> None:
        self._demand_until = time.monotonic() + IDLE_GRACE_SECONDS
        with self._cond:
            self._cond.notify_all()

    def chunks_after(self, seq: int, timeout: float = 5.0) -> Tuple[int, List[bytes]]:
        self.touch()
        deadline = time.monotonic() + timeout
        with self._cond:
            while (not self._chunks or self._chunks[-1][0] <= seq) and not self._stop.is_set():
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    return seq, []
                self._cond.wait(remaining)
            # a new listener (seq 0) starts from the live edge rather than replaying the buffer
            fresh = [(s, c) for s, c in self._chunks if s > seq] if seq else [self._chunks[-1]]
            return fresh[-1][0], [c for _, c in fresh]

    def describe(self) -> dict:
        return {"source": self.kind, "recent_impacts": list(self.events)[-10:]}

    def _publish(self, pcm: bytes) -> None:
        with self._cond:
            self._seq += 1
            self._chunks.append((self._seq, pcm))
            self._cond.notify_all()

    def _idle(self) -> bool:
        return time.monotonic() >= self._demand_until

    def _run(self) -> None:
        proc = None
        while not self._stop.is_set():
            if self._idle():
                if proc:
                    proc.kill()
                    proc = None
                with self._cond:
                    self._cond.wait(1.0)
                continue
            started = time.monotonic()
            try:
                if self.use_track:
                    if proc is None:
                        proc = subprocess.Popen(
                            [shutil.which("ffmpeg"), "-nostdin", "-loglevel", "error", "-re", "-stream_loop", "-1",
                             "-i", self.video_path, "-vn", "-ac", "1", "-ar", str(SAMPLE_RATE), "-f", "s16le", "-"],
                            stdout=subprocess.PIPE,
                        )
                    data = proc.stdout.read(CHUNK * 2)
                    if not data:
                        proc = None
                        continue
                    self._publish(data)
                    continue  # ffmpeg -re already paces to real time
                pcm, impact = self.soundscape.next_chunk()
                if impact:
                    self.events.append({"ts": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"), "event": "impact"})
                    logger.info(f"[{self.name}] generated impact sound (ground truth)")
                self._publish(pcm.tobytes())
            except Exception:
                logger.exception(f"Audio feed '{self.name}' failed")
                self._stop.wait(1.0)
            self._stop.wait(max(0.0, CHUNK_SECONDS - (time.monotonic() - started)))
        if proc:
            proc.kill()
