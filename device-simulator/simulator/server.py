"""
HTTP server exposing the simulated devices.

  GET /                          index page with every feed and its URLs
  GET /health                    {"status": "ok", "mqtt_connected": ...}
  GET /api/devices               all sensors and cameras (JSON)
  GET /sensors/<name>            sensor description + recent history (JSON)
  GET /sensors/<name>/latest     latest reading (JSON)
  GET /sensors/<name>/stream     live readings as Server-Sent Events
  GET /cameras/<name>.mjpg       live MJPEG stream (paste into BuildTrack "Add camera")
  GET /cameras/<name>.jpg        single JPEG snapshot
"""
import json
import logging
import queue
import socket
import threading
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Dict, Optional
from urllib.parse import unquote, urlsplit
from .audio import wav_stream_header
from .cameras import CameraFeed
from .sensors import MqttPublisher, SensorStream

logger = logging.getLogger("simulator.server")

BOUNDARY = "frame"


class DeviceRegistry:
    """Devices served over HTTP. Cameras can be added/removed at runtime (video library rescans)."""

    def __init__(self, sensors: Dict[str, SensorStream], cameras: Dict[str, CameraFeed], publisher: Optional[MqttPublisher]):
        self.sensors = sensors
        self._cameras = dict(cameras)
        self._lock = threading.Lock()
        self.publisher = publisher

    def camera(self, name: str) -> Optional[CameraFeed]:
        with self._lock:
            return self._cameras.get(name)

    def camera_list(self):
        with self._lock:
            return list(self._cameras.values())

    def camera_names(self):
        with self._lock:
            return set(self._cameras)

    def add_camera(self, cam: CameraFeed) -> None:
        with self._lock:
            self._cameras[cam.name] = cam

    def remove_camera(self, name: str) -> Optional[CameraFeed]:
        with self._lock:
            return self._cameras.pop(name, None)


def make_handler(registry: DeviceRegistry):
    class Handler(BaseHTTPRequestHandler):
        server_version = "BuildTrackDeviceSimulator/1.0"

        def log_message(self, fmt, *args):
            logger.debug("%s - %s", self.address_string(), fmt % args)

        # ------------------------------------------------------------------ helpers
        def _json(self, payload, status: int = 200) -> None:
            body = json.dumps(payload, default=str).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)

        def _not_found(self, what: str) -> None:
            self._json({"error": f"{what} not found"}, HTTPStatus.NOT_FOUND)

        def _base_url(self) -> str:
            host = self.headers.get("Host") or f"{self.server.server_address[0]}:{self.server.server_address[1]}"
            return f"http://{host}"

        # ------------------------------------------------------------------ routing
        def do_GET(self):
            path = unquote(urlsplit(self.path).path).rstrip("/") or "/"
            parts = [p for p in path.split("/") if p]
            try:
                if path == "/":
                    return self._index()
                if path == "/health":
                    return self._json({
                        "status": "ok",
                        "sensors": len(registry.sensors),
                        "cameras": len(registry.camera_names()),
                        "mqtt_connected": bool(registry.publisher and registry.publisher.connected),
                    })
                if path == "/api/devices":
                    return self._json(self._devices())
                if parts[0] == "sensors" and len(parts) >= 2:
                    return self._sensor(parts[1], parts[2] if len(parts) > 2 else None)
                if parts[0] == "cameras" and len(parts) == 2:
                    name, _, ext = parts[1].rpartition(".")
                    return self._camera(name, ext)
                if parts[0] == "cameras" and len(parts) == 3 and parts[2] == "audio.wav":
                    return self._audio(parts[1])
                self._not_found("Route")
            except (BrokenPipeError, ConnectionResetError, socket.timeout):
                pass  # client went away mid-stream

        # ------------------------------------------------------------------ handlers
        def _devices(self) -> dict:
            base = self._base_url()
            return {
                "sensors": [
                    {**s.describe(), "stream_url": f"{base}/sensors/{s.name}/stream", "latest_url": f"{base}/sensors/{s.name}/latest"}
                    for s in registry.sensors.values()
                ],
                "cameras": [
                    {
                        **c.describe(),
                        "mjpeg_url": f"{base}/cameras/{c.name}.mjpg",
                        "snapshot_url": f"{base}/cameras/{c.name}.jpg",
                        "audio_url": f"{base}/cameras/{c.name}/audio.wav",
                    }
                    for c in registry.camera_list()
                ],
                "mqtt": {
                    "host": registry.publisher.host if registry.publisher else None,
                    "port": registry.publisher.port if registry.publisher else None,
                    "connected": bool(registry.publisher and registry.publisher.connected),
                },
            }

        def _sensor(self, name: str, action: Optional[str]) -> None:
            sensor = registry.sensors.get(name)
            if not sensor:
                return self._not_found(f"Sensor '{name}'")
            if action is None:
                return self._json({**sensor.describe(), "history": list(sensor.history)[-50:]})
            if action == "latest":
                return self._json(sensor.latest or {"error": "no reading yet"}, 200 if sensor.latest else 404)
            if action == "stream":
                return self._sensor_sse(sensor)
            self._not_found("Route")

        def _sensor_sse(self, sensor: SensorStream) -> None:
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Connection", "keep-alive")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            q: "queue.Queue[dict]" = queue.Queue(maxsize=100)
            unsubscribe = sensor.subscribe(lambda r: q.put_nowait(r) if not q.full() else None)
            try:
                if sensor.latest:
                    self.wfile.write(f"data: {json.dumps(sensor.latest)}\n\n".encode())
                    self.wfile.flush()
                while True:
                    try:
                        reading = q.get(timeout=15)
                        self.wfile.write(f"data: {json.dumps(reading)}\n\n".encode())
                    except queue.Empty:
                        self.wfile.write(b": keep-alive\n\n")
                    self.wfile.flush()
            finally:
                unsubscribe()

        def _camera(self, name: str, ext: str) -> None:
            cam = registry.camera(name)
            if not cam:
                return self._not_found(f"Camera '{name}'")
            if ext == "jpg":
                jpeg = cam.snapshot()
                if not jpeg:
                    return self._json({"error": "no frame available"}, HTTPStatus.SERVICE_UNAVAILABLE)
                self.send_response(200)
                self.send_header("Content-Type", "image/jpeg")
                self.send_header("Content-Length", str(len(jpeg)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(jpeg)
                return
            if ext == "mjpg":
                return self._mjpeg(cam)
            self._not_found("Route")

        def _audio(self, name: str) -> None:
            cam = registry.camera(name)
            if not cam:
                return self._not_found(f"Camera '{name}'")
            self.send_response(200)
            self.send_header("Content-Type", "audio/wav")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(wav_stream_header())
            seq = 0
            while True:
                seq, chunks = cam.audio.chunks_after(seq, timeout=5.0)
                for chunk in chunks:
                    self.wfile.write(chunk)
                self.wfile.flush()

        def _mjpeg(self, cam: CameraFeed) -> None:
            self.send_response(200)
            self.send_header("Content-Type", f"multipart/x-mixed-replace; boundary={BOUNDARY}")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Connection", "close")
            self.end_headers()
            last_id = 0
            while True:
                last_id, jpeg = cam.wait_frame(last_id, timeout=5.0)
                if jpeg is None:
                    continue
                self.wfile.write(
                    f"--{BOUNDARY}\r\nContent-Type: image/jpeg\r\nContent-Length: {len(jpeg)}\r\n\r\n".encode()
                    + jpeg
                    + b"\r\n"
                )
                self.wfile.flush()

        def _index(self) -> None:
            body = INDEX_HTML.encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    return Handler


def serve(registry: DeviceRegistry, host: str, port: int) -> ThreadingHTTPServer:
    httpd = ThreadingHTTPServer((host, port), make_handler(registry))
    httpd.daemon_threads = True
    return httpd


INDEX_HTML = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Device Simulator</title>
<style>
  :root { color-scheme: light dark; --bg:#fafafa; --card:#fff; --text:#18181b; --muted:#71717a; --line:#e4e4e7; --accent:#f59e0b; }
  @media (prefers-color-scheme: dark) { :root { --bg:#09090b; --card:#18181b; --text:#f4f4f5; --muted:#a1a1aa; --line:#27272a; } }
  body { margin:0; font:14px/1.5 system-ui, sans-serif; background:var(--bg); color:var(--text); }
  main { max-width:1100px; margin:0 auto; padding:24px 16px; }
  h1 { font-size:22px; margin:0 0 4px; } h2 { font-size:15px; margin:28px 0 10px; }
  .muted { color:var(--muted); } code { font:12px ui-monospace, monospace; word-break:break-all; }
  .grid { display:grid; gap:12px; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); }
  .card { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:12px; }
  .value { font-size:26px; font-weight:600; font-variant-numeric:tabular-nums; }
  .anomaly { color:#ef4444; } img { width:100%; aspect-ratio:16/9; object-fit:cover; border-radius:6px; background:#000; }
  .row { display:flex; justify-content:space-between; gap:8px; align-items:baseline; }
  .dot { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:6px; }
</style></head>
<body><main>
  <h1>Device Simulator</h1>
  <p class="muted" id="status">Loading…</p>
  <h2>Cameras</h2><div class="grid" id="cameras"></div>
  <h2>Sensors</h2><div class="grid" id="sensors"></div>
</main>
<script>
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
let cameraKey = null;
async function refresh() {
  const d = await (await fetch("/api/devices")).json();
  document.getElementById("status").innerHTML =
    `<span class="dot" style="background:${d.mqtt.connected ? "#22c55e" : "#a1a1aa"}"></span>` +
    (d.mqtt.host ? `MQTT ${esc(d.mqtt.host)}:${d.mqtt.port} ${d.mqtt.connected ? "connected" : "not connected"}` : "MQTT disabled") +
    ` · ${d.sensors.length} sensors · ${d.cameras.length} cameras`;
  const key = d.cameras.map((c) => c.name).join("|");
  if (key !== cameraKey) {
    document.getElementById("cameras").innerHTML = d.cameras.map((c) => `
      <div class="card"><img src="/cameras/${encodeURIComponent(c.name)}.mjpg" alt="${esc(c.name)} live feed">
      <div class="row"><strong>${esc(c.name)}</strong><span class="muted">${c.fps} fps</span></div>
      <code>${esc(c.mjpeg_url)}</code>
      <div class="muted">Audio: ${esc(c.audio.source)}</div><code>${esc(c.audio_url)}</code></div>`).join("") || '<p class="muted">No cameras configured.</p>';
    cameraKey = key;
  }
  document.getElementById("sensors").innerHTML = d.sensors.map((s) => {
    const r = s.latest;
    return `<div class="card"><div class="row"><strong>${esc(s.name)}</strong><span class="muted">${esc(s.type)}</span></div>
      <div class="value ${r && r.injected_anomaly ? "anomaly" : ""}">${r ? r.value : "—"} <span class="muted" style="font-size:14px">${esc(s.unit)}</span></div>
      <div class="muted">${r ? new Date(r.ts).toLocaleTimeString() : "waiting"}${r && r.injected_anomaly ? " · injected anomaly" : ""}</div>
      ${s.mqtt_topic ? `<code>${esc(s.mqtt_topic)}</code>` : '<span class="muted">No MQTT topic (HTTP only)</span>'}</div>`;
  }).join("") || '<p class="muted">No sensors configured.</p>';
}
refresh(); setInterval(refresh, 2000);
</script>
</body></html>
"""
