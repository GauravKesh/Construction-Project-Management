import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models.rule import Rule, AlertSeverity
from app.db.redis import (
    get_redis_client,
    key_alert_dedup,
    key_rule_state,
)
from app.db.repositories.rule_repo import RuleRepository

logger = logging.getLogger(__name__)


def evaluate_operator(
    op_str: str,
    val: float,
    threshold1: float,
    threshold2: Optional[float] = None,
) -> bool:
    op = op_str.strip().lower()
    if op in [">", "gt"]:
        return val > threshold1
    elif op in ["<", "lt"]:
        return val < threshold1
    elif op in [">=", "gte"]:
        return val >= threshold1
    elif op in ["<=", "lte"]:
        return val <= threshold1
    elif op in ["==", "=", "eq"]:
        return abs(val - threshold1) < 1e-5
    elif op in ["!=", "neq"]:
        return abs(val - threshold1) >= 1e-5
    elif op == "between":
        if threshold2 is None:
            return False
        low, high = min(threshold1, threshold2), max(threshold1, threshold2)
        return low <= val <= high
    elif op == "outside":
        if threshold2 is None:
            return False
        low, high = min(threshold1, threshold2), max(threshold1, threshold2)
        return val < low or val > high
    return False


def _parse_rule_state(state: Optional[str]):
    if not state:
        return None, None
    try:
        start, _, last = str(state).partition(":")
        start_ts = float(start)
        return start_ts, float(last) if last else start_ts
    except ValueError:
        return None, None


def _state_ttl(window_seconds: int) -> int:
    # Generous wall-clock TTL so keys survive replays that run slower than real time
    return max(int(window_seconds) * 10, 3600)


class RuleEngine:
    async def evaluate_reading(
        self,
        reading: Dict[str, Any],
        session: AsyncSession,
    ) -> List[Dict[str, Any]]:
        """
        Evaluates a validated sensor reading against enabled rules.
        Returns a list of triggered alerts to create.
        """
        sensor_type = reading["type"]
        sensor_id = reading["sensor_id"]
        site_id_str = reading["site_id"]
        val = float(reading["value"])
        zone_id_str = reading.get("zone_id")

        try:
            site_uuid = uuid.UUID(site_id_str)
        except ValueError:
            return []

        zone_uuid = uuid.UUID(zone_id_str) if zone_id_str else None

        rule_repo = RuleRepository(session)
        rules = await rule_repo.list_active_rules_for_sensor(
            sensor_type=sensor_type,
            site_id=site_uuid,
            zone_id=zone_uuid,
        )

        triggered_alerts = []
        r = get_redis_client()
        # Evaluate in event time (the reading's own timestamp) so that replaying
        # recorded telemetry produces the same alerts as the live run did.
        ts = reading.get("ts")
        if isinstance(ts, datetime):
            now = ts.timestamp()
        else:
            now = time.time()

        for rule in rules:
            rule_id_str = str(rule.id)
            matched = evaluate_operator(
                op_str=rule.operator,
                val=val,
                threshold1=rule.threshold_val1,
                threshold2=rule.threshold_val2,
            )

            state_key = key_rule_state(rule_id_str, sensor_id)
            dedup_key = key_alert_dedup(rule_id_str, sensor_id)

            if matched:
                # Duration requirement: the breach must be observed continuously for
                # duration_seconds. State is "<first_breach_ts>:<last_breach_ts>"; a gap
                # between breaching readings longer than the window restarts the timer,
                # so silence (e.g. an offline sensor) is never counted as a sustained breach.
                if rule.duration_seconds > 0:
                    state = await r.get(state_key)
                    start_ts, last_ts = _parse_rule_state(state)
                    if start_ts is None or now - last_ts > rule.duration_seconds:
                        start_ts = now
                    await r.set(state_key, f"{start_ts}:{now}", ex=_state_ttl(rule.duration_seconds))
                    if now - start_ts < rule.duration_seconds:
                        continue

                # Cooldown / deduplication, also in event time. The value is the event
                # time of the last alert; the Redis TTL only garbage-collects the key.
                if rule.cooldown_seconds and rule.cooldown_seconds > 0:
                    last_alert = await r.get(dedup_key)
                    try:
                        last_alert_ts = float(last_alert) if last_alert else None
                    except ValueError:
                        last_alert_ts = None
                    if last_alert_ts is not None and 0 <= now - last_alert_ts < rule.cooldown_seconds:
                        continue
                    await r.set(dedup_key, str(now), ex=_state_ttl(rule.cooldown_seconds))
                # Reset duration state after alert is triggered
                if rule.duration_seconds > 0:
                    await r.delete(state_key)

                message = (
                    f"Threshold breached: {rule.name} on sensor {sensor_id}. "
                    f"Value: {val} {reading.get('unit', '')} {rule.operator} {rule.threshold_val1}"
                )

                triggered_alerts.append({
                    "rule": rule,
                    "site_id": site_uuid,
                    "zone_id": zone_uuid,
                    "sensor_id": sensor_id,
                    "alert_type": "sensor_threshold",
                    "severity": rule.severity,
                    "message": message,
                    "reading_value": val,
                    "threshold_value": rule.threshold_val1,
                    "details": {
                        "rule_id": rule_id_str,
                        "rule_name": rule.name,
                        "operator": rule.operator,
                        "threshold": rule.threshold_val1,
                        "reading_value": val,
                        "unit": reading.get("unit"),
                        "duration_seconds": rule.duration_seconds,
                        # Provenance: enough to explain this alert even after the rule is edited
                        "threshold2": rule.threshold_val2,
                        "cooldown_seconds": rule.cooldown_seconds,
                        "rule_updated_at": rule.updated_at.isoformat() if rule.updated_at else None,
                        "reading_ts": datetime.fromtimestamp(now, timezone.utc).isoformat(),
                    },
                    "auto_create_incident": rule.auto_create_incident,
                })
            else:
                # Value is within normal threshold: reset duration state if it was tracking
                if rule.duration_seconds > 0:
                    await r.delete(state_key)

        return triggered_alerts


rule_engine = RuleEngine()
