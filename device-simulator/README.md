# BuildTrack Device Simulator

A standalone Python server that acts as site hardware: it streams **sensor readings**
(over MQTT, the way real IoT devices talk to BuildTrack, and over HTTP) and **camera
feeds** (MJPEG over HTTP, which BuildTrack's video handler opens like an IP camera).

- One signal model per sensor type: `temperature`, `humidity`, `gas`, `noise`,
  `vibration`, `dust`, `tilt` (daily cycles, drift, noise, occasional injected anomalies).
- Every video in the `videos/` folder becomes a camera. Drop in more construction
  videos and they start streaming within seconds, no restart needed.
- Readings are reproducible (`seed`) and carry `injected_anomaly`, so a run doubles as
  ground truth for evaluating BuildTrack's alerting.

Only Python is needed. Dependencies are the standard library plus OpenCV/NumPy (video)
and paho-mqtt (MQTT), the same versions the backend uses.

## Run it

```bash
cd device-simulator
# Reuse the backend's virtualenv (already has everything) ...
../backend/.venv/bin/python -m simulator types
# ... or create one: python3 -m venv .venv && .venv/bin/pip install -r requirements.txt

cp config.example.json config.json
../backend/.venv/bin/python -m simulator register   # create the devices in BuildTrack (once)
../backend/.venv/bin/python -m simulator run        # stream
```

Open <http://localhost:8090> to see every feed with its URLs and live values.

`register` logs in to BuildTrack (default `admin@buildtrack.com`; password via
`--password`, `BUILDTRACK_PASSWORD` or a prompt), picks the site (`--site`, the config,
or the first site), creates each sensor and camera on the site map around the site
centre, and writes their ids into `config.json`. It is safe to re-run: existing
devices are reused, and only new videos are added.

## Connecting by hand instead

**Cameras.** In BuildTrack go to Site Map, then Add camera, and paste a feed URL such as
`http://localhost:8090/cameras/north-gate.mjpg`, then click Test. BuildTrack's video
handler must be running (`start.sh` starts it).

**Sensors.** In BuildTrack go to Site Map, then Add sensor; the connect panel shows the
sensor's MQTT topic. Put that sensor's id in the config (`"sensor_id": "<uuid>"`) and set
`buildtrack.site_id`, and the simulator publishes to exactly that topic:
`sites/{site_id}/sensors/{type}/{sensor_id}`.

## Endpoints

| Path | What |
|---|---|
| `/` | Overview page |
| `/health` | Status, device counts, MQTT connection |
| `/api/devices` | All devices with their URLs (JSON) |
| `/cameras/<name>.mjpg` | Live MJPEG stream |
| `/cameras/<name>.jpg` | One JPEG snapshot |
| `/sensors/<name>/latest` | Latest reading (JSON) |
| `/sensors/<name>/stream` | Live readings (Server-Sent Events) |
| `/sensors/<name>` | Description plus the last 50 readings |

Camera frames are only produced while someone is watching, so idle feeds use no CPU.

## Configuration (`config.json`)

| Key | Meaning |
|---|---|
| `server.host` / `port` | Bind address (default `127.0.0.1:8090`; use `0.0.0.0` to expose on your network) |
| `server.advertise_host` | Host BuildTrack should use for camera URLs (`localhost` when on the same machine) |
| `mqtt.*` | Broker to publish to (BuildTrack's Mosquitto by default); `enabled: false` for HTTP only |
| `buildtrack.api` / `site_id` | Used by `register` and to build MQTT topics |
| `seed` | Makes readings reproducible; `run --seed N` overrides it |
| `labels_csv` | Write every reading with its `injected_anomaly` flag (also `run --labels runs/x.csv`) |
| `video_library.dir` | Folder whose videos become cameras (`../videos`); rescanned every `rescan_seconds` |
| `video_library.fps` / `width` | Output frame rate and width for library cameras |
| `sensors[]` | `name`, `type`, `interval_seconds`, optional `unit`, `location` `[lat, lng]`, `overrides` |
| `cameras[]` | Extra cameras: `name`, `source` (`synthetic` or a video path), `fps`, `width` |

`overrides` adjusts a sensor's signal model, for example
`{"baseline": 12, "anomaly_probability": 0.1}` (see `simulator/profiles.py`).

Camera names come from file names (`Tower Crane.mp4` becomes `tower-crane`). After adding
videos, re-run `register` so BuildTrack gets a camera record for each one.

## Notes

- Each registered camera runs PPE detection in BuildTrack at its analysis rate (2 fps
  by default). With many videos, expect more CPU use and more detection records.
- Readings are synthetic. They exercise the pipeline end to end; they are not field data.

## Tests

```bash
../backend/.venv/bin/python -m pytest -q
```
