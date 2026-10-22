# BuildTrack — Real-Time IoT & Computer Vision Construction Monitoring Platform

An event-driven platform for monitoring construction sites in real time: environmental sensor telemetry over MQTT, computer-vision PPE checks on camera frames, rule-based alerting with a transactional outbox, and a Next.js control-room UI fed over Socket.IO (`/live`).

> **Before using this system to produce research results, read [§6 Research use: what is real and what is not](#6-research-use-what-is-real-and-what-is-not).** By default the computer-vision path runs a **mock detector** and all telemetry comes from **simulators**.

---

## 1. System Architecture

```
 [IoT Sensors]       [CCTV Cameras]       [Web / Mobile Clients]
       │                   │                        │
  MQTT (1883)         RTSP / HTTP            REST API / Socket.IO (/live)
       │                   │                        │
       ▼                   ▼                        ▼
 ┌───────────────┐   ┌────────────────┐     ┌───────────────────────┐
 │ MQTT Consumer │   │ Video Handler  │     │ FastAPI Gateway       │
 └───────┬───────┘   └────────┬───────┘     └───────────┬───────────┘
         │                    │                         │
         ▼                    ▼                         │
   Redis Stream ────► [Stream Worker]                   │
   (stream:ingest)    │  - Validation                   │
                      │  - Rule Engine (event time)     │
                      │  - MongoDB Time-Series Persist  │
                      │  - Outbox Events                │
                      ▼                                 │
     ┌────────────────────────────────────┐             │
     │       Data & Persistence Tier      │             │
     │  - PostgreSQL 16 (Relational Core) ◄─────────────┤
     │  - MongoDB 7 (Time-Series & Logs)  │             │
     │  - Redis 7 (Cache, Dedup, Streams) │             │
     │  - Local / S3 Object Store         │             │
     └────────────────┬───────────────────┘             │
                      ▼                                 ▼
         [Transactional Outbox Publisher] ────► [Socket.IO Server]
                      │                                 ▲
                      ▼                                 │
         [Notification Service] ────────────────────────┘
```

- **Relational core**: PostgreSQL 16 — 26 tables, Alembic migrations, full-text search (GIN), Shapely point-in-polygon zones.
- **Time series & logs**: MongoDB 7 — `sensor_readings` (time-series), `sensor_latest`, `cv_detections`, `rejected_messages`, `event_log`.
- **Streams & cache**: Redis 7 — `stream:ingest`, `stream:dlq`, reading/alert dedup keys, `tokens:revoked:{jti}` revocation list, `rl:{client}:{route}` rate limits.
- **Ingestion**: Mosquitto MQTT consumer, authenticated HTTP ingest (`POST /api/v1/telemetry/ingest`), OpenCV camera frame reader.
- **Computer vision**: per-person PPE evaluation (helmet + vest required) on detector output; mock detector by default, YOLO when PPE-trained weights are supplied (see §6).
- **Storage**: local filesystem (`./data/storage`) in development, S3/MinIO when `STORAGE_BACKEND=s3`.
- **Containerisation**: not yet provided (`backend/docs/DOCKER_LATER.md` is a plan).

## 2. Processing semantics (what the pipeline guarantees)

- **Validation** rejects missing fields, non-numeric values, unparseable timestamps, readings > 5 min in the future or > 90 days old, and physically impossible values (per-type ranges incl. `tilt`). Rejected payloads are kept in Mongo `rejected_messages`. Duplicates are detected per sensor at millisecond event-time resolution. Readings without a timestamp are stamped on arrival and flagged `ts_assigned_on_arrival`.
- **Rule engine** evaluates in **event time** (the reading's timestamp), so replaying recorded telemetry reproduces the same alerts. A `duration_seconds` breach must be observed continuously; a gap longer than the window restarts the timer. `cooldown_seconds` is honoured exactly (0 = no cooldown). Each alert stores the rule's thresholds, cooldown, `rule_updated_at` and the reading time for provenance.
- **Delivery**: a failed message stays pending and is retried (reclaimed with `XAUTOCLAIM` after 10 s idle) until it has been delivered 3 times, then moves to `stream:dlq`. Retries are idempotent for the raw reading insert.
- **Notifications** go to active admins plus safety officers / project managers who are members of the alert's project.
- **Missing data is reported as missing**: PPE compliance and sensor uptime are `null` (not 100%) when there are no frames or sensors; forecasts return `insufficient_data` with fewer than 3 observations.

## 3. Quick start (development)

### 3.1 Prerequisites
Backing services on their default ports: PostgreSQL 16 (`construction_db`), MongoDB 7, Redis 7, Mosquitto MQTT.

### 3.2 Migrate and seed
```bash
cd backend
source .venv/bin/activate
python -m app.cli migrate   # also applies new migrations after upgrades
python -m app.cli seed
```

### 3.3 Launch
```bash
./start.sh            # API, stream worker, MQTT consumer, video handler
./start.sh --with-sim # plus the MQTT sensor simulator
```

### 3.4 Demo credentials
| Role | Email | Password |
|---|---|---|
| **Admin** | `admin@buildtrack.com` | `Admin@123456` |
| **Safety Officer** | `safety@buildtrack.com` | `Safety@123456` |
| **Project Manager** | `pm@buildtrack.com` | `Manager@123456` |

Set a random `SECRET_KEY` (≥ 32 chars) for any non-development `APP_ENV`; the app refuses to start otherwise. Set `INGEST_API_KEY` to let devices post to the HTTP ingest endpoint.

## 4. Tests

```bash
cd backend && source .venv/bin/activate && pytest -q   # backend: 63 tests
cd frontend && npm test                                 # frontend: 9 tests
```

Backend tests are **hermetic**: they create and drop `<POSTGRES_DB>_test`, use Mongo `<MONGO_DB>_test`, Redis DB 15 and a temporary storage directory, and refuse to run against a non-`_test` database. They need the backing services running but never touch development data.

## 5. API & real-time endpoints
- Swagger UI `http://localhost:8000/docs`, ReDoc `/redoc`, OpenAPI `/openapi.json` (exported to `backend/docs/openapi.json`)
- Socket.IO `ws://localhost:8000/socket.io` namespace `/live` — requires an access token; clients can only join rooms for projects they are members of (admins: all).
- Prometheus `/metrics`; health `/health/live`, `/health/ready`

## 6. Research use: what is real and what is not

| Component | Status | Implication for research |
|---|---|---|
| CV detector | **Mock by default** (`CV_MODE=mock`): ignores the image, reports one person, injects a missing-helmet violation on every 4th frame. Every detection is labelled with its `detector` (`mock`, `mock-fallback`, `yolo:<weights>`), and the UI flags mock output. | Mock output must never be reported as detection accuracy or real compliance. |
| YOLO path | Works with any Ultralytics model, but **no PPE weights are included**. The default `yolov8n.pt` is a COCO model with no helmet/vest classes; the app logs an error if the loaded model cannot express the required PPE. | Train or obtain PPE weights (e.g. on a public construction-PPE dataset) and evaluate them (mAP, per-class precision/recall) before using CV results. |
| Telemetry | Produced by `scripts/mqtt_sensor_simulator.py`. Spike values are chosen to exceed the seeded rule thresholds. | End-to-end pipeline test, not an independent benchmark of the rules. Use real or public sensor data for claims about alert quality. |
| Risk score | Hand-weighted heuristic (alerts × fixed weights × zone multiplier). | Ordinal indicator only; not a validated model. |
| Forecast | OLS linear trend on hourly rollups with a 95% Student-t prediction interval. | A baseline, not "machine learning". Compare against naive/seasonal baselines with backtesting before drawing conclusions. |
| Video feeds | Seeded cameras point to local stock video files in `videos/`. | Check the licence of any footage you redistribute; real site footage of workers is personal data (consent, retention, anonymisation, ethics approval). |

### Reproducible runs with ground truth
```bash
# Sensor stream: seeded, 100 cycles, one CSV row per reading with injected_spike = 0/1
python scripts/mqtt_sensor_simulator.py --seed 2026 --cycles 100 --labels-out runs/sensors_seed2026.csv

# CV loop: per-frame ground truth vs prediction (synthetic frames carry ground truth)
python scripts/video_loop_simulator.py --frames 500 --labels-out runs/cv_frames.csv
```
Join the sensor labels with alerts (`details.reading_ts`, `sensor_id`) to compute precision, recall and detection delay. Record the commit hash, `.env` settings (`CV_MODE`, `CV_MODEL_PATH`, `CV_CONFIDENCE_THRESHOLD`) and simulator seed with every result.

## 7. Known gaps
- No load/throughput benchmarks yet (latency p50/p95/p99, sustained msg/s).
- No end-to-end browser tests (Playwright/Cypress); frontend has 9 unit tests.
- Frontend uses `any` for API responses (~180 lint errors); `src/types/api-schema.d.ts` is generated but not yet used.
- MQTT broker runs without authentication in development.
- No Docker Compose / CI pipeline yet.
