"""
Video security analytics that need no trained model:

  * Intrusion: sustained motion (background subtraction) during secured hours
    (SECURITY_HOURS, e.g. "19:00-07:00" in SECURITY_TIMEZONE).
  * Tampering: the view goes dark (lens covered) or loses most of its detail
    (blocked, defocused or sprayed) compared with the camera's own baseline.

Each analysed frame yields a sample (motion, brightness, sharpness) stored in
Mongo `camera_analytics`; detections raise alerts through processing.alerts.
"""
import logging
from collections import deque
from datetime import datetime, time as dtime, timezone
from typing import Optional, Tuple
from zoneinfo import ZoneInfo
import cv2
import numpy as np
from app.core.config import settings
from app.db.models.alert import AlertSeverity
from app.db.mongo import get_mongo_db
from app.processing.alerts import raise_alert

logger = logging.getLogger("cv_security")

ANALYSIS_WIDTH = 320
DARK_BRIGHTNESS = 18.0          # mean gray level below which the view is considered covered
SHARPNESS_DROP_RATIO = 0.15     # sharpness below this fraction of baseline = blocked/defocused


def parse_hours(window: str) -> Optional[Tuple[dtime, dtime]]:
    """'19:00-07:00' -> (19:00, 07:00); '' or invalid -> None."""
    try:
        start, end = (part.strip() for part in window.split("-"))
        return dtime.fromisoformat(start), dtime.fromisoformat(end)
    except (ValueError, AttributeError):
        return None


def in_window(now: dtime, window: Tuple[dtime, dtime]) -> bool:
    start, end = window
    return start <= now < end if start <= end else (now >= start or now < end)


class SecurityAnalyzer:
    def __init__(self, camera_id: str, site_id: str, zone_id: Optional[str] = None):
        self.camera_id = camera_id
        self.site_id = site_id
        self.zone_id = zone_id
        self.bg = cv2.createBackgroundSubtractorMOG2(history=300, varThreshold=32, detectShadows=False)
        self.window = parse_hours(settings.SECURITY_HOURS)
        try:
            self.tz = ZoneInfo(settings.SECURITY_TIMEZONE)
        except Exception:
            self.tz = timezone.utc
        self.sharpness_history = deque(maxlen=120)
        self.motion_streak = 0
        self.tamper_streak = 0
        self.frames = 0

    def measure(self, frame: np.ndarray) -> dict:
        h, w = frame.shape[:2]
        small = cv2.resize(frame, (ANALYSIS_WIDTH, max(1, int(h * ANALYSIS_WIDTH / w))))
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
        mask = self.bg.apply(gray)
        self.frames += 1
        # The subtractor needs a few frames to learn the background before motion is meaningful
        motion = float(np.count_nonzero(mask > 0)) / mask.size if self.frames > 10 else 0.0
        return {
            "motion_ratio": round(motion, 4),
            "brightness": round(float(gray.mean()), 1),
            "sharpness": round(float(cv2.Laplacian(gray, cv2.CV_64F).var()), 1),
        }

    async def analyse(self, frame: np.ndarray, persons: Optional[int] = None) -> dict:
        ts = datetime.now(timezone.utc)
        m = self.measure(frame)
        secured = bool(self.window) and in_window(ts.astimezone(self.tz).time(), self.window)

        baseline = float(np.median(self.sharpness_history)) if len(self.sharpness_history) >= 30 else None
        dark = m["brightness"] < DARK_BRIGHTNESS
        blurred = baseline is not None and m["sharpness"] < baseline * SHARPNESS_DROP_RATIO
        tamper = dark or blurred
        if not tamper:
            self.sharpness_history.append(m["sharpness"])  # baseline learns only from normal frames

        self.tamper_streak = self.tamper_streak + 1 if tamper else 0
        moving = m["motion_ratio"] >= settings.SECURITY_MOTION_THRESHOLD
        self.motion_streak = self.motion_streak + 1 if (secured and moving) else 0

        sample = {
            "camera_id": self.camera_id,
            "site_id": self.site_id,
            "ts": ts,
            **m,
            "persons": persons,
            "security_hours": secured,
            "tamper": tamper,
        }
        try:
            await get_mongo_db().camera_analytics.insert_one(dict(sample))
        except Exception as e:
            logger.warning(f"Could not store camera analytics: {e}")

        n = settings.SECURITY_CONSECUTIVE_SAMPLES
        if self.motion_streak == n:
            await raise_alert(
                site_id=self.site_id,
                zone_id=self.zone_id,
                camera_id=self.camera_id,
                alert_type="intrusion",
                severity=AlertSeverity.CRITICAL,
                message=f"Movement detected during secured hours ({settings.SECURITY_HOURS}) on camera {self.camera_id}",
                details={**m, "persons": persons, "method": "background_subtraction", "secured_hours": settings.SECURITY_HOURS},
                cooldown_key=f"dedup:security:intrusion:{self.camera_id}",
                cooldown_seconds=settings.SECURITY_ALERT_COOLDOWN_SECONDS,
                correlate_as="intrusion",
            )
        if self.tamper_streak == n:
            reason = "view is dark or covered" if dark else "view lost most detail (blocked or defocused)"
            await raise_alert(
                site_id=self.site_id,
                zone_id=self.zone_id,
                camera_id=self.camera_id,
                alert_type="camera_tamper",
                severity=AlertSeverity.WARNING,
                message=f"Possible camera tampering: {reason}",
                details={**m, "sharpness_baseline": baseline},
                cooldown_key=f"dedup:security:tamper:{self.camera_id}",
                cooldown_seconds=settings.SECURITY_ALERT_COOLDOWN_SECONDS,
            )
        return sample
