"""
Camera audio analysis.

Reads a camera's audio stream, and every second:
  * computes the equivalent level (Leq) and the loudest 50 ms peak,
  * pushes Leq into the ingest stream as a `noise` reading of the camera's audio
    sensor (auto-created), so noise rules, anomaly detection and the dashboards apply,
  * raises an `acoustic_event` alert when a peak jumps AUDIO_IMPULSE_DB above the
    rolling level (bangs, crashes, breaking glass, alarms).

Levels are dBFS + AUDIO_DB_OFFSET: an uncalibrated estimate of sound pressure level.

Sources: WAV over HTTP is parsed natively; anything else (RTSP audio, files, other
codecs) is decoded by ffmpeg when it is installed.
"""
import asyncio
import logging
import math
import shutil
import struct
import time
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import AsyncIterator, Dict, List, Optional, Tuple
from urllib.parse import urlsplit
import httpx
import numpy as np
from app.core.config import settings
from app.db.models.alert import AlertSeverity
from app.db.redis import KEY_STREAM_INGEST, get_redis_client
from app.processing.alerts import raise_alert

logger = logging.getLogger("audio_analyzer")

PEAK_BLOCK_SECONDS = 0.05
ALLOWED_SCHEMES = ("http", "https", "rtsp", "rtsps")


def validate_audio_url(url: str) -> Optional[str]:
    parts = urlsplit(url.strip())
    if parts.scheme not in ALLOWED_SCHEMES or not parts.netloc:
        return "Use an http(s):// or rtsp:// audio stream URL"
    return None


def level_db(samples: np.ndarray) -> float:
    """RMS level of int16-range float samples, in dBFS + calibration offset."""
    rms = float(np.sqrt(np.mean(np.square(samples)))) if samples.size else 0.0
    dbfs = 20 * math.log10(max(rms, 1e-9) / 32768.0)
    # Floor at 0 dB: silence is "quiet", not a negative level the noise validation would reject
    return round(max(dbfs + settings.AUDIO_DB_OFFSET, 0.0), 1)


def analyse_second(samples: np.ndarray, sample_rate: int) -> Tuple[float, float]:
    """(Leq, loudest 50 ms block level) for one second of mono samples."""
    block = max(1, int(sample_rate * PEAK_BLOCK_SECONDS))
    blocks = [samples[i : i + block] for i in range(0, len(samples) - block + 1, block)] or [samples]
    return level_db(samples), max(level_db(b) for b in blocks)


def _parse_wav_header(header: bytes) -> Tuple[int, int, int, int]:
    """Return (sample_rate, channels, bits, data_offset) from a RIFF/WAVE header."""
    if header[:4] != b"RIFF" or header[8:12] != b"WAVE":
        raise ValueError("not a WAV stream")
    pos, fmt = 12, None
    while pos + 8 <= len(header):
        chunk_id, size = header[pos : pos + 4], struct.unpack("<I", header[pos + 4 : pos + 8])[0]
        if chunk_id == b"fmt ":
            _, channels, rate, _, _, bits = struct.unpack("<HHIIHH", header[pos + 8 : pos + 24])
            fmt = (rate, channels, bits)
        if chunk_id == b"data":
            if not fmt:
                raise ValueError("WAV data before fmt chunk")
            return fmt[0], fmt[1], fmt[2], pos + 8
        pos += 8 + size + (size & 1)
    raise ValueError("incomplete WAV header")


async def pcm_stream(url: str) -> AsyncIterator[Tuple[np.ndarray, int]]:
    """Yield (mono float samples, sample_rate) chunks from the audio source."""
    if urlsplit(url).scheme in ("http", "https"):
        async with httpx.AsyncClient(timeout=httpx.Timeout(10.0, read=30.0)) as client:
            async with client.stream("GET", url) as resp:
                if resp.status_code >= 400:
                    raise RuntimeError(f"HTTP {resp.status_code}")
                ctype = resp.headers.get("content-type", "")
                if "wav" in ctype or url.lower().endswith(".wav"):
                    buf = b""
                    rate = channels = None
                    async for chunk in resp.aiter_bytes():
                        buf += chunk
                        if rate is None:
                            if len(buf) < 44:
                                continue
                            rate, channels, bits, offset = _parse_wav_header(buf[:4096])
                            if bits != 16:
                                raise RuntimeError(f"Unsupported WAV sample size {bits} bits (need 16)")
                            buf = buf[offset:]
                        frame = 2 * channels
                        usable = len(buf) - len(buf) % frame
                        if usable:
                            pcm = np.frombuffer(buf[:usable], dtype="<i2").astype(np.float64)
                            buf = buf[usable:]
                            yield pcm.reshape(-1, channels).mean(axis=1), rate
                    return
    # Everything else goes through ffmpeg
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("This audio format needs ffmpeg, which is not installed on the server")
    rate = settings.AUDIO_SAMPLE_RATE
    proc = await asyncio.create_subprocess_exec(
        ffmpeg, "-nostdin", "-loglevel", "error", "-i", url, "-vn", "-ac", "1", "-ar", str(rate), "-f", "s16le", "-",
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    try:
        while True:
            chunk = await proc.stdout.read(rate // 5 * 2)
            if not chunk:
                err = (await proc.stderr.read()).decode(errors="replace").strip()
                raise RuntimeError(err.splitlines()[-1] if err else "audio stream ended")
            chunk = chunk[: len(chunk) - len(chunk) % 2]
            yield np.frombuffer(chunk, dtype="<i2").astype(np.float64), rate
    finally:
        if proc.returncode is None:
            proc.kill()
            await proc.wait()


async def probe_audio(url: str, seconds: float = 1.5, timeout: float = 10.0) -> Dict:
    """Read a short stretch of audio to validate a URL and report its level."""
    error = validate_audio_url(url)
    if error:
        return {"ok": False, "error": error}

    async def collect():
        got: List[np.ndarray] = []
        rate = settings.AUDIO_SAMPLE_RATE
        async for samples, rate in pcm_stream(url):
            got.append(samples)
            if sum(len(g) for g in got) >= rate * seconds:
                break
        return (np.concatenate(got) if got else np.zeros(0)), rate

    try:
        samples, rate = await asyncio.wait_for(collect(), timeout=timeout)
    except asyncio.TimeoutError:
        return {"ok": False, "error": f"No audio received within {timeout:.0f}s"}
    except Exception as e:
        return {"ok": False, "error": str(e)[:300]}
    if not samples.size:
        return {"ok": False, "error": "Stream contained no audio samples"}
    leq, peak = analyse_second(samples, rate)
    return {"ok": True, "level_db": leq, "peak_db": peak, "sample_rate": rate}


def key_audio_status(camera_id: str) -> str:
    return f"camera:audio:{camera_id}"


async def get_audio_status(camera_id: str) -> Dict:
    try:
        return await get_redis_client().hgetall(key_audio_status(camera_id)) or {}
    except Exception:
        return {}


@dataclass
class AudioSpec:
    camera_id: str
    site_id: str
    zone_id: Optional[str]
    audio_url: str
    sensor_id: str  # the camera's audio sensor, readings are filed under it


class AudioAnalyzerWorker:
    def __init__(self, spec: AudioSpec):
        self.spec = spec
        self._task: Optional[asyncio.Task] = None
        self.levels = deque(maxlen=30)

    def start(self) -> None:
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def _status(self, **fields) -> None:
        try:
            r = get_redis_client()
            key = key_audio_status(self.spec.camera_id)
            await r.hset(key, mapping={k: str(v) for k, v in fields.items() if v is not None})
            await r.expire(key, 3600)
        except Exception:
            pass

    async def _run(self) -> None:
        backoff = 1.0
        while True:
            try:
                await self._status(state="connecting")
                await self._consume()
                backoff = 1.0
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.warning(f"Audio for camera {self.spec.camera_id}: {e}")
                await self._status(state="error", error=str(e)[:300])
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30.0)

    async def _consume(self) -> None:
        pending: List[np.ndarray] = []
        async for samples, rate in pcm_stream(self.spec.audio_url):
            pending.append(samples)
            buffered = np.concatenate(pending)
            while len(buffered) >= rate:
                second, buffered = buffered[:rate], buffered[rate:]
                await self._handle_second(second, rate)
            pending = [buffered] if len(buffered) else []

    async def _handle_second(self, samples: np.ndarray, rate: int) -> None:
        leq, peak = analyse_second(samples, rate)
        ts = datetime.now(timezone.utc)
        spec = self.spec
        await get_redis_client().xadd(KEY_STREAM_INGEST, {
            "sensor_id": spec.sensor_id,
            "site_id": spec.site_id,
            "type": "noise",
            "value": str(leq),
            "unit": "dB",
            "ts": ts.isoformat(),
            "battery": "",
            "zone_id": spec.zone_id or "",
            "location": "",
        })
        await self._status(state="connected", level_db=leq, peak_db=peak, last_at=ts.isoformat(), error="")

        baseline = float(np.median(self.levels)) if len(self.levels) >= 5 else None
        self.levels.append(leq)
        if baseline is not None and peak - baseline >= settings.AUDIO_IMPULSE_DB:
            await raise_alert(
                site_id=spec.site_id,
                zone_id=spec.zone_id,
                camera_id=spec.camera_id,
                alert_type="acoustic_event",
                severity=AlertSeverity.WARNING,
                message=f"Sudden loud sound near camera: peak {peak:.0f} dB, {peak - baseline:.0f} dB above the background level",
                details={
                    "peak_db": peak,
                    "level_db": leq,
                    "baseline_db": round(baseline, 1),
                    "impulse_threshold_db": settings.AUDIO_IMPULSE_DB,
                    "calibration": f"dBFS + {settings.AUDIO_DB_OFFSET} (uncalibrated estimate)",
                },
                cooldown_key=f"dedup:audio:impulse:{spec.camera_id}",
                cooldown_seconds=settings.AUDIO_EVENT_COOLDOWN_SECONDS,
                correlate_as="acoustic_event",
            )


class AudioManager:
    def __init__(self):
        self._workers: Dict[str, AudioAnalyzerWorker] = {}

    async def sync(self, specs: List[AudioSpec]) -> None:
        wanted = {s.camera_id: s for s in specs}
        for camera_id in list(self._workers):
            spec = wanted.get(camera_id)
            if spec is None or spec != self._workers[camera_id].spec:
                await self._workers.pop(camera_id).stop()
                logger.info(f"Stopped audio analysis for camera {camera_id}")
        for camera_id, spec in wanted.items():
            if camera_id not in self._workers:
                worker = AudioAnalyzerWorker(spec)
                worker.start()
                self._workers[camera_id] = worker
                logger.info(f"Analysing audio for camera {camera_id} from {spec.audio_url}")

    async def stop_all(self) -> None:
        for camera_id in list(self._workers):
            await self._workers.pop(camera_id).stop()


audio_manager = AudioManager()
