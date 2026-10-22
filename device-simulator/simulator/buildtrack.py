"""
`register` command: create the simulated devices in BuildTrack (placed on the site map)
and store their ids in the config, so the simulator publishes to the right topics and
BuildTrack streams the right camera URLs. Safe to re-run: existing devices are reused.
"""
import json
import logging
import math
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("simulator.buildtrack")


class BuildTrackError(RuntimeError):
    pass


class BuildTrackClient:
    def __init__(self, api: str):
        self.api = api.rstrip("/")
        self.token: Optional[str] = None

    def _request(self, method: str, path: str, body: Optional[dict] = None) -> Any:
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(f"{self.api}/api/v1{path}", data=data, method=method)
        req.add_header("Content-Type", "application/json")
        if self.token:
            req.add_header("Authorization", f"Bearer {self.token}")
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                raw = resp.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as e:
            try:
                err = json.loads(e.read())
                message = (err.get("error") or {}).get("message") if isinstance(err.get("error"), dict) else err.get("detail")
            except Exception:
                message = None
            raise BuildTrackError(f"{method} {path} failed ({e.code}): {message or e.reason}") from None
        except urllib.error.URLError as e:
            raise BuildTrackError(f"Cannot reach BuildTrack at {self.api}: {e.reason}") from None

    def login(self, email: str, password: str) -> None:
        self.token = self._request("POST", "/auth/login", {"email": email, "password": password})["access_token"]

    def _items(self, payload: Any) -> List[dict]:
        return payload.get("items", []) if isinstance(payload, dict) else payload or []

    def find_site(self, site_id: Optional[str]) -> dict:
        """The given site, or the first site of the first project when none is given."""
        for project in self._items(self._request("GET", "/projects?page_size=200")):
            for site in self._items(self._request("GET", f"/projects/{project['id']}/sites?page_size=200")):
                if site_id is None or site["id"] == site_id:
                    return site
        raise BuildTrackError(f"Site {site_id} not found" if site_id else "No sites exist in BuildTrack")

    def sensors(self, site_id: str) -> List[dict]:
        return self._items(self._request("GET", f"/sites/{site_id}/sensors?page_size=500"))

    def cameras(self, site_id: str) -> List[dict]:
        return self._items(self._request("GET", f"/sites/{site_id}/cameras?page_size=500"))

    def create_sensor(self, site_id: str, body: dict) -> dict:
        return self._request("POST", f"/sites/{site_id}/sensors", body)

    def create_camera(self, site_id: str, body: dict) -> dict:
        return self._request("POST", f"/sites/{site_id}/cameras", body)

    def update_sensor(self, sensor_id: str, body: dict) -> dict:
        return self._request("PATCH", f"/sensors/{sensor_id}", body)

    def update_camera(self, camera_id: str, body: dict) -> dict:
        return self._request("PATCH", f"/cameras/{camera_id}", body)


def _device_code(prefix: str, name: str) -> str:
    code = "".join(ch if ch.isalnum() else "-" for ch in name.upper()).strip("-")
    return f"{prefix}-{code}"[:64]


def _ring_positions(center: Tuple[float, float], count: int, radius_m: float = 35.0) -> List[Tuple[float, float]]:
    """Spread devices on a circle around the site centre ([lat, lng] pairs)."""
    lat0, lng0 = center
    out = []
    for i in range(count):
        angle = 2 * math.pi * i / max(count, 1)
        dlat = (radius_m * math.cos(angle)) / 111_320
        dlng = (radius_m * math.sin(angle)) / (111_320 * math.cos(math.radians(lat0)))
        out.append((round(lat0 + dlat, 6), round(lng0 + dlng, 6)))
    return out


def register_devices(cfg: Dict[str, Any], email: str, password: str, site_id: Optional[str] = None) -> Dict[str, Any]:
    client = BuildTrackClient(cfg["buildtrack"]["api"])
    client.login(email, password)
    site = client.find_site(site_id or cfg["buildtrack"].get("site_id"))
    cfg["buildtrack"]["site_id"] = site["id"]
    center = (site.get("latitude") or 0.0, site.get("longitude") or 0.0)
    logger.info(f"Registering devices on site '{site['name']}' ({site['id']})")

    # Cameras for every video in the library folder that is not registered yet
    from .library import library_videos

    registered = cfg["video_library"].setdefault("registered", {})
    library_new = [{"name": n, "_library": True} for n in library_videos(cfg) if n not in registered]

    devices = cfg["sensors"] + cfg["cameras"] + library_new
    unplaced = [d for d in devices if not d.get("location")]
    for dev, pos in zip(unplaced, _ring_positions(center, len(unplaced))):
        dev["location"] = list(pos)

    server = cfg["server"]
    base = f"http://{server['advertise_host']}:{server['port']}"
    # pull: BuildTrack connects to this simulator's endpoints (default)
    # push: the simulator publishes to BuildTrack's MQTT broker
    pull = cfg["buildtrack"].get("mode", "pull") == "pull"

    existing_sensors = {s["sensor_code"]: s for s in client.sensors(site["id"])}
    for s in cfg["sensors"]:
        source_url = f"{base}/sensors/{s['name']}/stream" if pull else None
        if s.get("sensor_id"):
            client.update_sensor(s["sensor_id"], {"source_url": source_url})
            continue
        code = _device_code("SIM", s["name"])
        found = existing_sensors.get(code)
        if not found:
            from .profiles import PROFILES

            lat, lng = s["location"]
            found = client.create_sensor(site["id"], {
                "sensor_code": code,
                "name": s.get("display_name") or f"Simulated {s['type']} ({s['name']})",
                "sensor_type": s["type"],
                "unit": s.get("unit") or PROFILES[s["type"]].unit,
                "location_geojson": {"type": "Point", "coordinates": [lng, lat]},
                "source_url": source_url,
            })
            logger.info(f"Created sensor {code} -> {found['id']}")
        else:
            client.update_sensor(found["id"], {"source_url": source_url})
            logger.info(f"Reusing sensor {code} -> {found['id']}")
        s["sensor_id"] = found["id"]

    existing_cameras = {c["camera_code"]: c for c in client.cameras(site["id"])}
    for c in cfg["cameras"] + library_new:
        audio_url = f"{base}/cameras/{c['name']}/audio.wav" if c.get("audio", True) else None
        if c.get("buildtrack_camera_id"):
            client.update_camera(c["buildtrack_camera_id"], {"audio_url": audio_url})
            continue
        code = _device_code("SIMCAM", c["name"])
        found = existing_cameras.get(code)
        if not found:
            lat, lng = c["location"]
            found = client.create_camera(site["id"], {
                "camera_code": code,
                "name": c.get("display_name") or f"Simulated camera ({c['name']})",
                "stream_url": f"{base}/cameras/{c['name']}.mjpg",
                "audio_url": audio_url,
                "location_geojson": {"type": "Point", "coordinates": [lng, lat]},
                "fps": int(c.get("analysis_fps", 2)),
                "is_cv_enabled": bool(c.get("cv_enabled", True)),
            })
            logger.info(f"Created camera {code} -> {found['id']}")
        else:
            client.update_camera(found["id"], {"audio_url": audio_url})
            logger.info(f"Reusing camera {code} -> {found['id']}")
        if c.get("_library"):
            registered[c["name"]] = found["id"]
        else:
            c["buildtrack_camera_id"] = found["id"]
    return cfg
