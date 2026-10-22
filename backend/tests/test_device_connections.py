import json
import uuid
import httpx
import pytest
from sqlalchemy import select
from app.db.models.project import Site
from app.db.redis import get_redis_binary_client, get_redis_client, key_camera_error, key_camera_frame, KEY_STREAM_INGEST
from app.ingestion.video_stream_handler import CameraSpec, StreamManager, resolve_stream_url

SEEDED_VIDEO = "/videos/19241054-hd_1920_1080_30fps.mp4"


async def _site(db_session):
    return (await db_session.execute(select(Site).limit(1))).scalar_one()


def test_browser_video_paths_resolve_to_repo_files():
    resolved = resolve_stream_url(SEEDED_VIDEO)
    assert resolved != SEEDED_VIDEO and resolved.endswith("19241054-hd_1920_1080_30fps.mp4")
    assert resolve_stream_url("rtsp://cam.local/stream") == "rtsp://cam.local/stream"


@pytest.mark.asyncio
async def test_camera_connection_test(async_client: httpx.AsyncClient, admin_headers):
    ok = await async_client.post("/api/v1/cameras/test-connection", json={"stream_url": SEEDED_VIDEO}, headers=admin_headers)
    assert ok.status_code == 200
    body = ok.json()
    assert body["ok"] is True and body["width"] == 1920 and body["height"] == 1080
    assert "resolved_url" not in body  # server paths are not exposed

    bad = await async_client.post(
        "/api/v1/cameras/test-connection", json={"stream_url": "/videos/missing.mp4"}, headers=admin_headers
    )
    assert bad.status_code == 200 and bad.json()["ok"] is False and bad.json()["error"]


@pytest.mark.asyncio
async def test_camera_lifecycle_and_shared_frames(async_client: httpx.AsyncClient, admin_headers, db_session):
    site = await _site(db_session)
    create = await async_client.post(
        f"/api/v1/sites/{site.id}/cameras",
        json={
            "camera_code": f"CAM-T-{uuid.uuid4().hex[:6]}",
            "name": "Test gate camera",
            "stream_url": "rtsp://192.0.2.10/stream",
            "location_geojson": {"type": "Point", "coordinates": [77.1, 28.556]},
            "fps": 2,
        },
        headers=admin_headers,
    )
    assert create.status_code == 201
    cam = create.json()
    assert cam["status"] == "active"  # picked up by the video handler without a manual start
    cam_id = cam["id"]

    status = (await async_client.get(f"/api/v1/cameras/{cam_id}/status", headers=admin_headers)).json()
    assert status["stream_active"] is False
    snap = await async_client.get(f"/api/v1/cameras/{cam_id}/snapshot", headers=admin_headers)
    assert snap.status_code == 404

    # Simulate the video handler process publishing a frame and an error
    r = get_redis_binary_client()
    await r.set(key_camera_error(cam_id), b"Could not open the stream", ex=30)
    status = (await async_client.get(f"/api/v1/cameras/{cam_id}/status", headers=admin_headers)).json()
    assert status["last_error"] == "Could not open the stream"

    await r.set(key_camera_frame(cam_id), b"\xff\xd8fake-jpeg\xff\xd9", ex=30)
    status = (await async_client.get(f"/api/v1/cameras/{cam_id}/status", headers=admin_headers)).json()
    assert status["stream_active"] is True and status["last_error"] is None
    snap = await async_client.get(f"/api/v1/cameras/{cam_id}/snapshot", headers=admin_headers)
    assert snap.status_code == 200 and snap.content.startswith(b"\xff\xd8")

    # The MJPEG stream is no longer public
    assert (await async_client.get(f"/api/v1/cameras/{cam_id}/stream")).status_code == 401

    stop = await async_client.post(f"/api/v1/cameras/{cam_id}/stop", headers=admin_headers)
    assert stop.status_code == 200
    assert (await async_client.get(f"/api/v1/cameras/{cam_id}", headers=admin_headers)).json()["status"] == "inactive"

    await r.delete(key_camera_frame(cam_id), key_camera_error(cam_id))
    assert (await async_client.delete(f"/api/v1/cameras/{cam_id}", headers=admin_headers)).status_code == 200


@pytest.mark.asyncio
async def test_sensor_connection_info(async_client: httpx.AsyncClient, admin_headers, db_session):
    site = await _site(db_session)
    create = await async_client.post(
        f"/api/v1/sites/{site.id}/sensors",
        json={
            "sensor_code": f"S-T-{uuid.uuid4().hex[:6]}",
            "name": "Test dust sensor",
            "sensor_type": "Dust",
            "unit": "ug/m3",
            "location_geojson": {"type": "Point", "coordinates": [77.1, 28.556]},
        },
        headers=admin_headers,
    )
    assert create.status_code == 201
    sensor_id = create.json()["id"]

    info = (await async_client.get(f"/api/v1/sensors/{sensor_id}/connection", headers=admin_headers)).json()
    assert info["mqtt_topic"] == f"sites/{site.id}/sensors/dust/{sensor_id}"
    assert info["http_ingest_url"].endswith("/api/v1/telemetry/ingest")
    assert info["example_payload"]["sensor_id"] == sensor_id
    assert "password" not in json.dumps(info).lower()

    assert (await async_client.delete(f"/api/v1/sensors/{sensor_id}", headers=admin_headers)).status_code == 200


@pytest.mark.asyncio
async def test_stream_manager_sync_reconciles_registry(monkeypatch):
    manager = StreamManager()
    started, stopped = [], []

    async def fake_start(camera_id, site_id, stream_url, fps=2):
        started.append(camera_id)

        class W:
            pass

        w = W()
        w.stream_url, w.fps = stream_url, fps
        manager._workers[camera_id] = w
        return True

    async def fake_stop(camera_id):
        stopped.append(camera_id)
        manager._workers.pop(camera_id, None)

    monkeypatch.setattr(manager, "start_camera", fake_start)
    monkeypatch.setattr(manager, "stop_camera", fake_stop)

    await manager.sync([CameraSpec("a", "s", "rtsp://a", 2), CameraSpec("b", "s", "rtsp://b", 2)])
    assert sorted(started) == ["a", "b"] and stopped == []

    # b removed, a's URL changed, c added
    started.clear()
    await manager.sync([CameraSpec("a", "s", "rtsp://a2", 2), CameraSpec("c", "s", "rtsp://c", 2)])
    assert sorted(stopped) == ["a", "b"]
    assert sorted(started) == ["a", "c"]
    assert manager._workers["a"].stream_url == "rtsp://a2"


@pytest.mark.asyncio
async def test_mqtt_message_without_value_is_not_stored_as_zero():
    from app.ingestion.mqtt_consumer import MqttIngestionConsumer

    class Msg:
        topic = "sites/site-x/sensors/gas/sensor-missing-value"
        payload = json.dumps({"unit": "ppm"}).encode()

    r = get_redis_client()
    before = await r.xrevrange(KEY_STREAM_INGEST, count=1)
    await MqttIngestionConsumer()._process_mqtt_message(Msg())
    latest = await r.xrevrange(KEY_STREAM_INGEST, count=1)
    assert latest and latest != before
    fields = latest[0][1]
    assert fields["sensor_id"] == "sensor-missing-value"
    assert fields["value"] == ""  # validation will reject it instead of recording 0.0
    await r.xdel(KEY_STREAM_INGEST, latest[0][0])


@pytest.mark.asyncio
async def test_ppe_alerts_are_rate_limited_per_camera(db_session):
    from sqlalchemy import func
    from app.cv.service import cv_service
    from app.db.models.alert import Alert

    from app.db.models.camera import Camera

    camera = (await db_session.execute(select(Camera).limit(1))).scalar_one()
    camera_id, site_id = str(camera.id), str(camera.site_id)
    await get_redis_client().delete(f"dedup:ppe:{camera_id}")
    await db_session.rollback()

    for _ in range(3):
        result = await cv_service.process_frame(camera_id=camera_id, site_id=site_id, simulate_violation=True)
        assert result["compliant"] is False

    await db_session.rollback()
    count = (
        await db_session.execute(select(func.count(Alert.id)).where(Alert.alert_type == "ppe_violation", Alert.details["camera_id"].astext == camera_id))
    ).scalar()
    assert count == 1  # three violating frames, one alert within the cooldown
