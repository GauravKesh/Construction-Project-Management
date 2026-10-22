import asyncio
import json
import math
import socket
import struct
import threading
import uuid
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import httpx
import numpy as np
import pytest
from sqlalchemy import func, select
from app.core.config import settings
from app.db.models.alert import Alert
from app.db.models.camera import Camera
from app.db.models.sensor import Sensor
from app.db.redis import KEY_STREAM_INGEST, get_redis_client
from app.ingestion.audio_analyzer import AudioAnalyzerWorker, AudioSpec, analyse_second, probe_audio
from app.ingestion.sensor_sources import SensorSourceSpec, SensorSourceWorker, parse_readings, probe_source
from app.ingestion.video_stream_handler import SegmentRecorder, list_recordings, recording_path
from app.processing.anomaly import key_cooldown, key_window, score_reading
from app.processing.event_processor import event_correlation_service


# ----------------------------------------------------------------------------- helpers
def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _sine_pcm(seconds: float, amplitude: float = 0.5, freq: float = 440.0, rate: int = 16000) -> bytes:
    t = np.arange(int(rate * seconds)) / rate
    return (amplitude * 32767 * np.sin(2 * math.pi * freq * t)).astype("<i2").tobytes()


def _wav_header(rate: int = 16000) -> bytes:
    return (
        b"RIFF" + struct.pack("<I", 0xFFFFFFFF) + b"WAVE"
        + b"fmt " + struct.pack("<IHHIIHH", 16, 1, 1, rate, rate * 2, 2, 16)
        + b"data" + struct.pack("<I", 0xFFFFFFFF)
    )


@pytest.fixture(scope="module")
def device_server():
    """A tiny device: SSE readings, JSON readings, WAV audio and some broken endpoints."""

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_GET(self):
            if self.path == "/sse":
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.end_headers()
                for i in range(3):
                    reading = {"value": 10 + i, "unit": "ppm", "ts": f"2026-01-01T00:00:0{i}Z", "type": "gas"}
                    self.wfile.write(f"data: {json.dumps(reading)}\n\n".encode())
                    self.wfile.flush()
            elif self.path == "/json":
                body = json.dumps({"reading": {"value": 21.5, "unit": "°C"}}).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            elif self.path == "/novalue":
                body = b'{"status": "ok"}'
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            elif self.path == "/audio.wav":
                self.send_response(200)
                self.send_header("Content-Type", "audio/wav")
                self.end_headers()
                self.wfile.write(_wav_header() + _sine_pcm(3.0))
            else:
                self.send_response(404)
                self.end_headers()

    port = _free_port()
    httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{port}"
    httpd.shutdown()


async def _seed_camera(db_session):
    cam = (await db_session.execute(select(Camera).where(Camera.deleted_at.is_(None)).limit(1))).scalar_one()
    return str(cam.id), str(cam.site_id), str(cam.zone_id) if cam.zone_id else None


async def _count_alerts(db_session, alert_type: str, **where) -> int:
    await db_session.rollback()
    q = select(func.count(Alert.id)).where(Alert.alert_type == alert_type)
    for col, value in where.items():
        q = q.where(getattr(Alert, col) == value)
    return (await db_session.execute(q)).scalar()


# ------------------------------------------------------------------- pull-based sensors
def test_parse_readings_accepts_common_shapes():
    assert parse_readings({"value": "12.5", "unit": "ppm"})[0]["value"] == 12.5
    assert parse_readings({"data": {"value": 1}})[0]["value"] == 1.0
    assert [r["value"] for r in parse_readings([{"value": 1}, {"value": 2}])] == [1.0, 2.0]
    assert parse_readings({"value": "n/a"}) == []
    assert parse_readings({"value": True}) == []
    assert parse_readings("garbage") == []


@pytest.mark.asyncio
async def test_probe_source_validates_endpoints(device_server):
    sse = await probe_source(f"{device_server}/sse", sensor_type="gas")
    assert sse["ok"] and sse["format"] == "sse" and sse["value"] == 10.0 and sse["unit"] == "ppm"

    js = await probe_source(f"{device_server}/json", sensor_type="gas")
    assert js["ok"] and js["format"] == "json" and js["value"] == 21.5
    assert any("no 'ts'" in w for w in js["warnings"])

    for path, fragment in (("/novalue", "numeric 'value'"), ("/missing", "HTTP 404")):
        res = await probe_source(f"{device_server}{path}")
        assert not res["ok"] and fragment in res["error"]
    assert "http" in (await probe_source("ftp://example.com/x"))["error"]


@pytest.mark.asyncio
async def test_source_worker_pulls_into_ingest_stream(device_server):
    r = get_redis_client()
    sensor_id = str(uuid.uuid4())
    spec = SensorSourceSpec(sensor_id, str(uuid.uuid4()), "gas", "ppm", None, f"{device_server}/sse")
    worker = SensorSourceWorker(spec)
    worker.start()
    try:
        for _ in range(50):
            if worker.received >= 3:
                break
            await asyncio.sleep(0.1)
    finally:
        await worker.stop()
    assert worker.received >= 3
    entries = [e for e in await r.xrevrange(KEY_STREAM_INGEST, count=50) if e[1].get("sensor_id") == sensor_id]
    assert entries and all(e[1]["type"] == "gas" for e in entries)  # filed under the registered sensor
    await r.xdel(KEY_STREAM_INGEST, *[e[0] for e in entries])


# ------------------------------------------------------------------- anomaly detection
@pytest.mark.asyncio
async def test_rolling_zscore_flags_spikes_with_cooldown():
    sensor_id = f"anom-{uuid.uuid4().hex[:6]}"
    r = get_redis_client()
    t0 = datetime(2026, 1, 1, tzinfo=timezone.utc)
    rng = np.random.default_rng(1)
    for i in range(30):
        res = await score_reading(sensor_id, float(10 + rng.normal(0, 1)), t0 + timedelta(seconds=i))
        assert not res.is_anomaly
    spike = await score_reading(sensor_id, 30.0, t0 + timedelta(seconds=31))
    assert spike.is_anomaly and spike.should_alert and spike.z_score > settings.ANOMALY_Z_THRESHOLD
    again = await score_reading(sensor_id, 32.0, t0 + timedelta(seconds=40))
    assert again.is_anomaly and not again.should_alert  # within cooldown
    await r.delete(key_window(sensor_id), key_cooldown(sensor_id))


@pytest.mark.asyncio
async def test_stream_worker_raises_anomaly_alert_below_rule_thresholds(db_session):
    from app.workers.stream_worker import StreamIngestWorker

    sensor = (await db_session.execute(select(Sensor).where(Sensor.sensor_type == "gas").limit(1))).scalar_one()
    sensor_id, site_id = str(sensor.id), str(sensor.site_id)
    sensor_uuid = sensor.id
    r = get_redis_client()
    await r.delete(key_window(sensor_id), key_cooldown(sensor_id))
    before = await _count_alerts(db_session, "anomaly", sensor_id=sensor_uuid)

    worker = StreamIngestWorker(consumer_name=f"anom-{uuid.uuid4().hex[:6]}")
    t0 = datetime.now(timezone.utc) - timedelta(minutes=10)
    rng = np.random.default_rng(2)
    values = [8 + rng.normal(0, 0.5) for _ in range(25)] + [30.0]  # 30 ppm: below the 50 ppm rule
    for i, v in enumerate(values):
        fields = {"sensor_id": sensor_id, "site_id": site_id, "type": "gas", "value": f"{v:.3f}", "unit": "ppm",
                  "ts": (t0 + timedelta(seconds=i)).isoformat()}
        msg_id = await r.xadd(KEY_STREAM_INGEST, fields)
        await worker._process_stream_message(msg_id, fields)
        await r.xdel(KEY_STREAM_INGEST, msg_id)

    assert await _count_alerts(db_session, "anomaly", sensor_id=sensor_uuid) == before + 1
    await r.delete(key_window(sensor_id), key_cooldown(sensor_id))


# ------------------------------------------------------------------------- correlation
@pytest.mark.asyncio
async def test_correlation_requires_matching_sensor_type_and_includes_current_event():
    r = get_redis_client()
    site, ts = str(uuid.uuid4()), datetime.now(timezone.utc).isoformat()

    zone = str(uuid.uuid4())
    assert await event_correlation_service.correlate_events(site, zone, "ppe_violation", {"ts": ts}) is None
    corr = await event_correlation_service.correlate_events(site, zone, "sensor_threshold", {"type": "gas", "ts": ts})
    assert corr and corr["correlation_type"] == "gas_hazard_unprotected_workers"  # gas after PPE matches
    again = await event_correlation_service.correlate_events(site, zone, "sensor_threshold", {"type": "gas", "ts": ts})
    assert again is None  # cooldown

    other = str(uuid.uuid4())
    await event_correlation_service.correlate_events(site, other, "ppe_violation", {"ts": ts})
    noise = await event_correlation_service.correlate_events(site, other, "sensor_threshold", {"type": "noise", "ts": ts})
    assert noise is None  # a noise alert is not a gas hazard

    for z in (zone, other):
        await r.delete(f"corr:zone:{z}")
    await r.delete(f"corr:fired:{zone}:gas_hazard_unprotected_workers")


# -------------------------------------------------------------------- video security
@pytest.mark.asyncio
async def test_security_analyzer_detects_tamper_and_intrusion(db_session, monkeypatch):
    from app.cv.security import SecurityAnalyzer

    camera_id, site_id, zone_id = await _seed_camera(db_session)
    r = get_redis_client()
    await r.delete(f"dedup:security:tamper:{camera_id}", f"dedup:security:intrusion:{camera_id}")
    monkeypatch.setattr(settings, "SECURITY_HOURS", "00:00-23:59:59")  # always secured for the test
    camera_uuid = uuid.UUID(camera_id)
    tamper_before = await _count_alerts(db_session, "camera_tamper", camera_id=camera_uuid)
    intrusion_before = await _count_alerts(db_session, "intrusion", camera_id=camera_uuid)

    analyzer = SecurityAnalyzer(camera_id, site_id, zone_id)
    rng = np.random.default_rng(3)
    scene = (rng.random((360, 640, 3)) * 255).astype(np.uint8)
    for _ in range(15):  # learn the background
        await analyzer.analyse(scene)
    for _ in range(4):  # large changes in the scene
        await analyzer.analyse((rng.random((360, 640, 3)) * 255).astype(np.uint8))
    for _ in range(4):  # lens covered
        await analyzer.analyse(np.zeros((360, 640, 3), dtype=np.uint8))

    assert await _count_alerts(db_session, "intrusion", camera_id=camera_uuid) == intrusion_before + 1
    assert await _count_alerts(db_session, "camera_tamper", camera_id=camera_uuid) == tamper_before + 1
    await r.delete(f"dedup:security:tamper:{camera_id}", f"dedup:security:intrusion:{camera_id}")


# ------------------------------------------------------------------------------ audio
def test_audio_levels_follow_signal_amplitude():
    rate = 16000
    t = np.arange(rate) / rate
    loud = 0.5 * 32767 * np.sin(2 * math.pi * 440 * t)
    leq, peak = analyse_second(loud, rate)
    expected = 20 * math.log10(0.5 / math.sqrt(2)) + settings.AUDIO_DB_OFFSET
    assert abs(leq - expected) < 0.2 and abs(peak - expected) < 0.5
    quiet_leq, _ = analyse_second(loud / 10, rate)
    assert abs((leq - quiet_leq) - 20) < 0.2  # 10x amplitude = 20 dB
    assert analyse_second(np.zeros(rate), rate)[0] == 0.0  # silence floors at 0 dB


@pytest.mark.asyncio
async def test_probe_audio_reads_wav_stream(device_server):
    res = await probe_audio(f"{device_server}/audio.wav")
    assert res["ok"] and res["sample_rate"] == 16000
    assert abs(res["level_db"] - (20 * math.log10(0.5 / math.sqrt(2)) + settings.AUDIO_DB_OFFSET)) < 0.5
    assert not (await probe_audio("ftp://x/y"))["ok"]


@pytest.mark.asyncio
async def test_audio_impulse_raises_acoustic_event(db_session):
    camera_id, site_id, zone_id = await _seed_camera(db_session)
    r = get_redis_client()
    await r.delete(f"dedup:audio:impulse:{camera_id}")
    camera_uuid = uuid.UUID(camera_id)
    before = await _count_alerts(db_session, "acoustic_event", camera_id=camera_uuid)

    worker = AudioAnalyzerWorker(AudioSpec(camera_id, site_id, zone_id, "http://unused", str(uuid.uuid4())))
    rate = 16000
    rng = np.random.default_rng(4)
    for _ in range(6):
        await worker._handle_second(rng.normal(0, 300, rate), rate)  # steady background
    bang = rng.normal(0, 300, rate)
    bang[8000:8800] = rng.normal(0, 25000, 800)  # 50 ms impact
    await worker._handle_second(bang, rate)

    assert await _count_alerts(db_session, "acoustic_event", camera_id=camera_uuid) == before + 1
    entries = [e for e in await r.xrevrange(KEY_STREAM_INGEST, count=50) if e[1].get("sensor_id") == worker.spec.sensor_id]
    assert len(entries) == 7 and all(e[1]["type"] == "noise" for e in entries)
    await r.xdel(KEY_STREAM_INGEST, *[e[0] for e in entries])
    await r.delete(f"dedup:audio:impulse:{camera_id}")


# ------------------------------------------------------------------------- recordings
@pytest.mark.asyncio
async def test_recordings_are_written_listed_and_served(async_client: httpx.AsyncClient, admin_headers, db_session, monkeypatch):
    camera_id, _, _ = await _seed_camera(db_session)
    monkeypatch.setattr(settings, "CAMERA_RECORDING_FPS", 1000)  # write every frame in this test
    rec = SegmentRecorder(camera_id)
    for i in range(10):
        rec.write(np.full((90, 160, 3), i * 20, dtype=np.uint8))
    rec.close()

    items = list_recordings(camera_id)
    assert items and items[0]["size_bytes"] > 0
    assert recording_path(camera_id, "../../etc/passwd") is None

    listing = await async_client.get(f"/api/v1/cameras/{camera_id}/recordings", headers=admin_headers)
    assert listing.status_code == 200 and listing.json()[0]["name"] == items[0]["name"]
    download = await async_client.get(f"/api/v1/cameras/{camera_id}/recordings/{items[0]['name']}", headers=admin_headers)
    assert download.status_code == 200 and download.headers["content-type"] == "video/mp4"
    bad = await async_client.get(f"/api/v1/cameras/{camera_id}/recordings/..%2F..%2Fsecret.mp4", headers=admin_headers)
    assert bad.status_code == 404


# ----------------------------------------------------------------------------- API
@pytest.mark.asyncio
async def test_device_url_validation_and_test_endpoints(async_client: httpx.AsyncClient, admin_headers, db_session, device_server):
    camera_id, site_id, _ = await _seed_camera(db_session)
    bad_sensor = await async_client.post(
        f"/api/v1/sites/{site_id}/sensors",
        json={"sensor_code": f"BAD-{uuid.uuid4().hex[:5]}", "name": "x", "sensor_type": "gas", "unit": "ppm", "source_url": "file:///etc/passwd"},
        headers=admin_headers,
    )
    assert bad_sensor.status_code == 422
    bad_cam = await async_client.patch(f"/api/v1/cameras/{camera_id}", json={"audio_url": "file:///x.wav"}, headers=admin_headers)
    assert bad_cam.status_code == 422

    src = await async_client.post("/api/v1/sensors/test-source", json={"url": f"{device_server}/sse", "sensor_type": "gas"}, headers=admin_headers)
    assert src.status_code == 200 and src.json()["ok"] is True
    aud = await async_client.post("/api/v1/cameras/test-audio", json={"stream_url": f"{device_server}/audio.wav"}, headers=admin_headers)
    assert aud.status_code == 200 and aud.json()["ok"] is True

    analytics = await async_client.get(f"/api/v1/cameras/{camera_id}/analytics", headers=admin_headers)
    assert analytics.status_code == 200 and "samples" in analytics.json()
