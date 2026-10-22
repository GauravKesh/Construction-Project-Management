"""
Real-time statistical anomaly detection for sensor telemetry.

Each sensor keeps a rolling window of its most recent values in Redis. A new reading
is scored against that window *before* it is added (so a spike does not dampen its
own score). A reading whose |z| exceeds ANOMALY_Z_THRESHOLD, after at least
ANOMALY_MIN_SAMPLES readings, is flagged; alerts are rate-limited per sensor in event
time (ANOMALY_COOLDOWN_SECONDS), matching how the rule engine treats cooldowns.

This complements the threshold rules: it catches readings that are abnormal for
*this* sensor even when no fixed limit is crossed.
"""
import math
from dataclasses import dataclass
from datetime import datetime
from typing import Optional
from app.core.config import settings
from app.db.redis import get_redis_client


def key_window(sensor_id: str) -> str:
    return f"anomaly:window:{sensor_id}"


def key_cooldown(sensor_id: str) -> str:
    return f"anomaly:last_alert:{sensor_id}"


@dataclass
class AnomalyResult:
    samples: int
    mean: Optional[float]
    std: Optional[float]
    z_score: Optional[float]
    is_anomaly: bool
    should_alert: bool

    def as_dict(self) -> dict:
        return {
            "samples": self.samples,
            "rolling_mean": None if self.mean is None else round(self.mean, 4),
            "rolling_std": None if self.std is None else round(self.std, 4),
            "z_score": None if self.z_score is None else round(self.z_score, 2),
            "is_anomaly": self.is_anomaly,
        }


async def score_reading(sensor_id: str, value: float, ts: datetime) -> AnomalyResult:
    r = get_redis_client()
    window = settings.ANOMALY_WINDOW
    raw = await r.lrange(key_window(sensor_id), 0, window - 1)
    history = [float(x) for x in raw]

    mean = std = z = None
    is_anomaly = False
    if len(history) >= settings.ANOMALY_MIN_SAMPLES:
        mean = sum(history) / len(history)
        std = math.sqrt(sum((x - mean) ** 2 for x in history) / (len(history) - 1))
        if std > 1e-9:
            z = (value - mean) / std
            is_anomaly = abs(z) >= settings.ANOMALY_Z_THRESHOLD

    pipe = r.pipeline()
    pipe.lpush(key_window(sensor_id), value)
    pipe.ltrim(key_window(sensor_id), 0, window - 1)
    pipe.expire(key_window(sensor_id), 7 * 86400)
    await pipe.execute()

    should_alert = False
    if is_anomaly:
        now = ts.timestamp()
        last = await r.get(key_cooldown(sensor_id))
        if last is None or not (0 <= now - float(last) < settings.ANOMALY_COOLDOWN_SECONDS):
            await r.set(key_cooldown(sensor_id), str(now), ex=max(settings.ANOMALY_COOLDOWN_SECONDS * 10, 3600))
            should_alert = True

    return AnomalyResult(len(history), mean, std, z, is_anomaly, should_alert)
