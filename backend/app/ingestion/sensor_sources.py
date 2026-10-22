"""
Pull-based sensor ingestion: the backend connects to a device endpoint and feeds
its readings into the same Redis ingest stream as MQTT, so validation, storage,
rules and real-time analysis apply unchanged.

Supported endpoints (auto-detected from Content-Type):
  * Server-Sent Events  (text/event-stream): each `data:` line is a JSON reading
  * JSON                (application/json):  polled every SENSOR_SOURCE_POLL_SECONDS

A reading is a JSON object with a numeric `value` (also accepted: `reading`/`data`
wrappers or a list of readings) and optional `ts`, `unit`, `battery`, `type`.
"""
import asyncio
import json
import logging
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urlsplit
import httpx
from app.core.config import settings
from app.db.redis import KEY_STREAM_INGEST, get_redis_client

logger = logging.getLogger("sensor_sources")

ALLOWED_SCHEMES = ("http", "https")


def validate_source_url(url: str) -> Optional[str]:
    """Return an error message if the URL cannot be used as a sensor source."""
    parts = urlsplit(url.strip())
    if parts.scheme not in ALLOWED_SCHEMES or not parts.netloc:
        return "Use an http:// or https:// device endpoint"
    return None


def parse_readings(payload: Any) -> List[Dict[str, Any]]:
    """Normalise a device payload into reading dicts that have a numeric value."""
    if isinstance(payload, list):
        return [r for item in payload for r in parse_readings(item)]
    if not isinstance(payload, dict):
        return []
    for wrapper in ("reading", "data"):
        if isinstance(payload.get(wrapper), (dict, list)):
            return parse_readings(payload[wrapper])
    value = payload.get("value")
    if isinstance(value, bool) or value is None:
        return []
    try:
        value = float(value)
    except (TypeError, ValueError):
        return []
    return [{
        "value": value,
        "unit": payload.get("unit"),
        "ts": payload.get("ts") or payload.get("timestamp"),
        "battery": payload.get("battery"),
        "type": payload.get("type"),
    }]


def _is_sse(response: httpx.Response) -> bool:
    return "text/event-stream" in response.headers.get("content-type", "")


async def probe_source(url: str, sensor_type: Optional[str] = None, timeout: float = 8.0) -> Dict[str, Any]:
    """Connect once and parse the first reading, to validate an endpoint before saving it."""
    started = time.perf_counter()
    result: Dict[str, Any] = {"ok": False, "warnings": []}
    error = validate_source_url(url)
    if error:
        return {**result, "error": error}
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(timeout), follow_redirects=False) as client:
            async with client.stream("GET", url, headers={"Accept": "text/event-stream, application/json"}) as resp:
                if resp.status_code >= 400:
                    return {**result, "error": f"Endpoint returned HTTP {resp.status_code}"}
                readings: List[Dict[str, Any]] = []
                if _is_sse(resp):
                    result["format"] = "sse"

                    async def first_event():
                        async for line in resp.aiter_lines():
                            if line.startswith("data:"):
                                try:
                                    found = parse_readings(json.loads(line[5:].strip()))
                                except json.JSONDecodeError:
                                    found = []
                                if found:
                                    return found
                        return []

                    readings = await asyncio.wait_for(first_event(), timeout=timeout)
                else:
                    result["format"] = "json"
                    body = await resp.aread()
                    try:
                        readings = parse_readings(json.loads(body))
                    except json.JSONDecodeError:
                        return {**result, "error": "Endpoint did not return JSON or an event stream"}
    except asyncio.TimeoutError:
        return {**result, "error": f"No reading received within {timeout:.0f}s"}
    except httpx.HTTPError as e:
        return {**result, "error": f"Could not connect: {e.__class__.__name__}"}

    if not readings:
        return {**result, "error": "Connected, but the response contains no reading with a numeric 'value'"}
    first = readings[0]
    if sensor_type and first.get("type") and str(first["type"]).lower() != sensor_type.lower():
        result["warnings"].append(f"Device reports type '{first['type']}' but the sensor is '{sensor_type}'")
    if not first.get("ts"):
        result["warnings"].append("Readings have no 'ts'; arrival time will be used")
    return {
        **result,
        "ok": True,
        "value": first["value"],
        "unit": first.get("unit"),
        "ts": str(first["ts"]) if first.get("ts") else None,
        "reported_type": first.get("type"),
        "elapsed_ms": int((time.perf_counter() - started) * 1000),
    }


def key_source_status(sensor_id: str) -> str:
    return f"sensor:source:{sensor_id}"


async def get_source_status(sensor_id: str) -> Dict[str, Any]:
    try:
        return await get_redis_client().hgetall(key_source_status(sensor_id)) or {}
    except Exception:
        return {}


@dataclass
class SensorSourceSpec:
    sensor_id: str
    site_id: str
    sensor_type: str
    unit: str
    zone_id: Optional[str]
    source_url: str


class SensorSourceWorker:
    def __init__(self, spec: SensorSourceSpec):
        self.spec = spec
        self._task: Optional[asyncio.Task] = None
        self.received = 0

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
            key = key_source_status(self.spec.sensor_id)
            await r.hset(key, mapping={k: str(v) for k, v in fields.items() if v is not None})
            await r.expire(key, 3600)
        except Exception:
            pass

    async def _push(self, reading: Dict[str, Any]) -> None:
        """Queue a reading under the registered sensor's identity (device-reported ids are ignored)."""
        spec = self.spec
        await get_redis_client().xadd(KEY_STREAM_INGEST, {
            "sensor_id": spec.sensor_id,
            "site_id": spec.site_id,
            "type": spec.sensor_type,
            "value": str(reading["value"]),
            "unit": reading.get("unit") or spec.unit,
            "ts": str(reading.get("ts") or ""),
            "battery": "" if reading.get("battery") is None else str(reading["battery"]),
            "zone_id": spec.zone_id or "",
            "location": "",
        })
        self.received += 1
        await self._status(
            state="connected",
            last_reading_at=datetime.now(timezone.utc).isoformat(),
            readings_received=self.received,
            last_error="",
        )

    async def _run(self) -> None:
        backoff = 1.0
        while True:
            try:
                await self._status(state="connecting")
                await self._consume()
                backoff = 1.0  # stream ended cleanly; reconnect promptly
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.warning(f"Sensor {self.spec.sensor_id} source error: {e}")
                await self._status(state="error", last_error=str(e)[:300] or e.__class__.__name__)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30.0)

    async def _consume(self) -> None:
        timeout = httpx.Timeout(10.0, read=60.0)  # SSE servers send keep-alives well within 60s
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
            async with client.stream("GET", self.spec.source_url, headers={"Accept": "text/event-stream, application/json"}) as resp:
                if resp.status_code >= 400:
                    raise RuntimeError(f"HTTP {resp.status_code}")
                if _is_sse(resp):
                    await self._status(state="connected")
                    async for line in resp.aiter_lines():
                        if line.startswith("data:"):
                            try:
                                for reading in parse_readings(json.loads(line[5:].strip())):
                                    await self._push(reading)
                            except json.JSONDecodeError:
                                continue
                    return
            # Plain JSON endpoint: poll it
            last_ts = None
            while True:
                resp = await client.get(self.spec.source_url, headers={"Accept": "application/json"})
                if resp.status_code >= 400:
                    raise RuntimeError(f"HTTP {resp.status_code}")
                for reading in parse_readings(resp.json()):
                    # Skip a repeated reading (same device timestamp) between polls
                    if reading.get("ts") and reading["ts"] == last_ts:
                        continue
                    last_ts = reading.get("ts") or last_ts
                    await self._push(reading)
                await asyncio.sleep(settings.SENSOR_SOURCE_POLL_SECONDS)


class SensorSourceManager:
    def __init__(self):
        self._workers: Dict[str, SensorSourceWorker] = {}

    async def sync(self, specs: List[SensorSourceSpec]) -> None:
        """Start workers for new sources, stop removed ones, restart changed ones."""
        wanted = {s.sensor_id: s for s in specs}
        for sensor_id in list(self._workers):
            spec = wanted.get(sensor_id)
            if spec is None or spec != self._workers[sensor_id].spec:
                await self._workers.pop(sensor_id).stop()
                logger.info(f"Stopped sensor source {sensor_id}")
        for sensor_id, spec in wanted.items():
            if sensor_id not in self._workers:
                worker = SensorSourceWorker(spec)
                worker.start()
                self._workers[sensor_id] = worker
                logger.info(f"Pulling sensor {sensor_id} from {spec.source_url}")

    async def stop_all(self) -> None:
        for sensor_id in list(self._workers):
            await self._workers.pop(sensor_id).stop()


sensor_source_manager = SensorSourceManager()
