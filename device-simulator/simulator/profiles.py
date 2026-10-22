"""
Signal models for simulated IoT sensors, one per sensor type.

Each model produces a plausible baseline (daily cycles, slow drift, measurement
noise) and occasionally injects an anomaly (a spike or sustained excursion). Every
reading reports whether an anomaly was injected, so the output doubles as ground
truth for evaluating alerting.

Ranges stay inside BuildTrack's physical validation bounds so readings are accepted.
"""
import math
import random
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, Optional, Tuple


@dataclass
class Profile:
    unit: str
    baseline: float          # typical value
    daily_amplitude: float   # +/- swing over a day (peaks mid-afternoon)
    noise: float             # std dev of measurement noise
    low: float               # physical floor (clamped)
    high: float              # physical ceiling (clamped)
    anomaly_level: float     # value reached during an injected anomaly
    anomaly_probability: float = 0.02   # chance per reading that an anomaly starts
    anomaly_duration: Tuple[int, int] = (3, 8)  # readings an anomaly lasts
    work_hours_only: bool = False       # activity-driven signals (noise, vibration, dust)


# Units match BuildTrack's defaults; anomaly levels exceed its seeded rule thresholds
PROFILES: Dict[str, Profile] = {
    "temperature": Profile("°C", 28.0, 6.0, 0.3, -20.0, 60.0, 45.0, 0.01, (6, 15)),
    "humidity": Profile("%", 55.0, -15.0, 1.0, 5.0, 100.0, 95.0, 0.01, (5, 10)),
    "gas": Profile("ppm", 8.0, 2.0, 0.8, 0.0, 1000.0, 110.0, 0.02, (3, 8)),
    "noise": Profile("dB", 62.0, 10.0, 2.0, 30.0, 140.0, 95.0, 0.03, (2, 6), work_hours_only=True),
    "vibration": Profile("mm/s", 2.5, 1.5, 0.4, 0.0, 200.0, 25.0, 0.02, (1, 4), work_hours_only=True),
    "dust": Profile("ug/m3", 45.0, 20.0, 4.0, 0.0, 2000.0, 300.0, 0.02, (4, 10), work_hours_only=True),
    "tilt": Profile("deg", 0.2, 0.05, 0.02, -10.0, 10.0, 3.5, 0.005, (10, 30)),
}


def supported_types():
    return sorted(PROFILES)


@dataclass
class SignalGenerator:
    """Stateful generator for one sensor; deterministic for a given seed."""

    sensor_type: str
    seed: int = 0
    overrides: Dict[str, float] = field(default_factory=dict)

    def __post_init__(self):
        if self.sensor_type not in PROFILES:
            raise ValueError(f"Unknown sensor type '{self.sensor_type}'. Supported: {', '.join(supported_types())}")
        base = PROFILES[self.sensor_type]
        self.profile = Profile(**{**base.__dict__, **self.overrides})
        self.rng = random.Random(self.seed)
        self.drift = 0.0
        self.anomaly_left = 0
        self.battery = 100.0

    @property
    def unit(self) -> str:
        return self.profile.unit

    def _diurnal(self, ts: datetime) -> float:
        """Smooth daily cycle peaking around 15:00 local time."""
        hours = ts.hour + ts.minute / 60.0
        return math.cos((hours - 15.0) / 24.0 * 2 * math.pi)

    def _activity(self, ts: datetime) -> float:
        """0 outside working hours (07:00-19:00), ramping to 1 during the shift."""
        hours = ts.hour + ts.minute / 60.0
        if hours < 7 or hours > 19:
            return 0.15
        return 0.6 + 0.4 * math.sin((hours - 7) / 12 * math.pi)

    def next(self, ts: datetime) -> Tuple[float, bool, Optional[float]]:
        """Return (value, anomaly_injected, battery_pct) for a reading taken at ts."""
        p = self.profile
        self.drift = 0.98 * self.drift + self.rng.gauss(0, p.noise * 0.2)

        if p.work_hours_only:
            level = p.baseline * self._activity(ts) + p.daily_amplitude * self._activity(ts) * 0.5
        else:
            level = p.baseline + p.daily_amplitude * self._diurnal(ts)
        value = level + self.drift + self.rng.gauss(0, p.noise)

        if self.anomaly_left == 0 and self.rng.random() < p.anomaly_probability:
            self.anomaly_left = self.rng.randint(*p.anomaly_duration)
        anomaly = self.anomaly_left > 0
        if anomaly:
            self.anomaly_left -= 1
            value = p.anomaly_level + self.rng.gauss(0, max(p.noise, abs(p.anomaly_level) * 0.03))

        value = min(max(value, p.low), p.high)
        self.battery = max(5.0, self.battery - self.rng.uniform(0.0005, 0.002))
        return round(value, 2), anomaly, round(self.battery, 1)
