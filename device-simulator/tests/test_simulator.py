import json
import socket
import threading
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
import cv2
import numpy as np
import pytest
from simulator.cameras import CameraFeed, camera_name_for, discover_videos
from simulator.config import load_config
from simulator.library import VideoLibraryWatcher
from simulator.profiles import PROFILES, SignalGenerator
from simulator.sensors import SensorStream
from simulator.server import DeviceRegistry, serve


def make_video(path: Path, frames: int = 20, size=(160, 90)) -> None:
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), 10, size)
    for i in range(frames):
        img = np.full((size[1], size[0], 3), (i * 10) % 255, dtype=np.uint8)
        writer.write(img)
    writer.release()


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


# --- signal models -------------------------------------------------------------------
@pytest.mark.parametrize("sensor_type", sorted(PROFILES))
def test_signals_are_reproducible_bounded_and_labelled(sensor_type):
    t0 = datetime(2026, 1, 1, 6, tzinfo=timezone.utc)
    a, b = SignalGenerator(sensor_type, seed=7), SignalGenerator(sensor_type, seed=7)
    p = PROFILES[sensor_type]
    anomalies = 0
    for i in range(2000):
        ts = t0 + timedelta(minutes=i)
        va, an, _ = a.next(ts)
        vb, _, _ = b.next(ts)
        assert va == vb  # same seed, same series
        assert p.low <= va <= p.high
        anomalies += an
    assert anomalies > 0  # injected anomalies occur and are flagged


def test_anomaly_values_exceed_normal_range():
    g = SignalGenerator("gas", seed=1, overrides={"anomaly_probability": 1.0})
    value, anomaly, _ = g.next(datetime(2026, 1, 1, 12, tzinfo=timezone.utc))
    assert anomaly and value > 50  # above BuildTrack's seeded gas warning threshold


def test_unknown_sensor_type_is_rejected():
    with pytest.raises(ValueError):
        SignalGenerator("radiation")


def test_sensor_topic_follows_buildtrack_convention():
    s = SensorStream("gas-1", "gas", site_id="SITE", sensor_id="SENSOR")
    assert s.topic == "sites/SITE/sensors/gas/SENSOR"
    assert SensorStream("gas-2", "gas").topic is None  # no site -> HTTP only


# --- video library ------------------------------------------------------------------------
def test_discover_videos_names_files(tmp_path):
    (tmp_path / "Crane Lift 01.MP4").write_bytes(b"x")
    (tmp_path / "crane-lift-01.mov").write_bytes(b"x")
    (tmp_path / "notes.txt").write_bytes(b"x")
    (tmp_path / ".hidden.mp4").write_bytes(b"x")
    found = discover_videos(str(tmp_path), [".mp4", ".mov"])
    assert set(found) == {"crane-lift-01", "crane-lift-01-2"}
    assert camera_name_for(Path("19241054-hd_1920_1080_30fps.mp4")) == "19241054-hd-1920-1080-30fps"


def test_config_resolves_library_relative_to_config(tmp_path):
    (tmp_path / "videos").mkdir()
    cfg_file = tmp_path / "sim" / "config.json"
    cfg_file.parent.mkdir()
    cfg_file.write_text(json.dumps({"video_library": {"dir": "../videos"}}))
    cfg = load_config(str(cfg_file))
    assert cfg["video_library"]["_resolved_dir"] == str((tmp_path / "videos").resolve())
    assert cfg["mqtt"]["port"] == 1883  # defaults merged


def test_library_watcher_adds_and_removes_cameras(tmp_path):
    lib = tmp_path / "videos"
    lib.mkdir()
    cfg_file = tmp_path / "config.json"
    cfg_file.write_text(json.dumps({"video_library": {"dir": "videos", "rescan_seconds": 2}}))
    cfg = load_config(str(cfg_file))
    registry = DeviceRegistry({}, {}, None)
    watcher = VideoLibraryWatcher(cfg, registry, set())
    watcher.start()
    try:
        make_video(lib / "new-site-video.mp4")
        deadline = time.time() + 8
        while "new-site-video" not in registry.camera_names() and time.time() < deadline:
            time.sleep(0.2)
        assert "new-site-video" in registry.camera_names()

        (lib / "new-site-video.mp4").unlink()
        deadline = time.time() + 8
        while "new-site-video" in registry.camera_names() and time.time() < deadline:
            time.sleep(0.2)
        assert "new-site-video" not in registry.camera_names()
    finally:
        watcher.stop_event.set()


# --- HTTP server ------------------------------------------------------------------------
@pytest.fixture
def running_server(tmp_path):
    video = tmp_path / "clip.mp4"
    make_video(video, frames=30)
    sensor = SensorStream("gas-1", "gas", interval_seconds=0.2, site_id="SITE", sensor_id="SENSOR")
    cams = {
        "clip": CameraFeed("clip", str(video), fps=10, width=160),
        "yard": CameraFeed("yard", "synthetic", fps=10, width=320),
    }
    for c in cams.values():
        c.start()
    registry = DeviceRegistry({"gas-1": sensor}, cams, None)
    port = free_port()
    httpd = serve(registry, "127.0.0.1", port)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    stop = threading.Event()

    def tick():
        while not stop.is_set():
            sensor.emit(datetime.now(timezone.utc))
            stop.wait(0.2)

    threading.Thread(target=tick, daemon=True).start()
    time.sleep(0.5)
    yield f"http://127.0.0.1:{port}"
    stop.set()
    httpd.shutdown()
    for c in cams.values():
        c.stop()


def get_json(url):
    with urllib.request.urlopen(url, timeout=10) as r:
        return json.loads(r.read())


def test_health_and_device_listing(running_server):
    assert get_json(f"{running_server}/health")["status"] == "ok"
    devices = get_json(f"{running_server}/api/devices")
    assert {c["name"] for c in devices["cameras"]} == {"clip", "yard"}
    assert devices["cameras"][0]["mjpeg_url"].endswith(".mjpg")
    assert devices["sensors"][0]["mqtt_topic"] == "sites/SITE/sensors/gas/SENSOR"


def test_sensor_latest_and_sse(running_server):
    latest = get_json(f"{running_server}/sensors/gas-1/latest")
    assert latest["type"] == "gas" and latest["unit"] == "ppm" and "injected_anomaly" in latest
    with urllib.request.urlopen(f"{running_server}/sensors/gas-1/stream", timeout=10) as r:
        assert r.headers["Content-Type"] == "text/event-stream"
        line = r.readline().decode()
        assert line.startswith("data: ") and json.loads(line[6:])["sensor_id"] == "SENSOR"


@pytest.mark.parametrize("name", ["clip", "yard"])
def test_camera_snapshot_and_mjpeg(running_server, name):
    with urllib.request.urlopen(f"{running_server}/cameras/{name}.jpg", timeout=10) as r:
        jpeg = r.read()
    assert r.headers["Content-Type"] == "image/jpeg" and jpeg[:2] == b"\xff\xd8"
    with urllib.request.urlopen(f"{running_server}/cameras/{name}.mjpg", timeout=10) as r:
        assert r.headers["Content-Type"].startswith("multipart/x-mixed-replace")
        assert r.readline().strip() == b"--frame"


def test_mjpeg_is_readable_by_opencv(running_server):
    # This is how BuildTrack's video handler consumes the feed
    cap = cv2.VideoCapture(f"{running_server}/cameras/yard.mjpg")
    try:
        ok, frame = cap.read()
        assert ok and frame.shape[1] == 320
    finally:
        cap.release()


def test_unknown_routes_404(running_server):
    for path in ("/cameras/nope.mjpg", "/sensors/nope/latest", "/whatever"):
        with pytest.raises(urllib.error.HTTPError) as e:
            urllib.request.urlopen(f"{running_server}{path}", timeout=5)
        assert e.value.code == 404
