# BuildTrack — Report and Research Paper Content Bank

**How to use this file.** Part A is the project report, chapter by chapter. Part B is the research paper. Part C lists the experiments we still have to run. Part D is reference material. Copy text out of here, rewrite it in your own words, and replace every `[TODO]`.

**Conventions**

- `code font` names a real file, setting, table, key or function in the repo. Paths are relative to the repo root.
- `[TODO: …]` means a fact or measurement we do not have yet. Do not invent it.
- ⚠ marks a limitation that must appear in the text.
- Facts below were read from the code on 2026-10-23 (commit `5fa9a75` plus uncommitted frontend/audio changes). Re-check anything that may have changed.

---

# PART A — PROJECT REPORT

## A.0 Front matter

**Title (working):** *BuildTrack: An Event-Driven Platform for Real-Time Safety Monitoring of Construction Sites Using IoT Telemetry and Computer Vision*

Alternative titles:
- *Real-Time Monitoring and Management System for Construction Projects*
- *A Multi-Store, Event-Time Architecture for Construction-Site Hazard Detection*

Pages to include: title page, certificate, declaration, acknowledgements, abstract, table of contents, list of figures, list of tables, list of abbreviations.

### Abstract (report version, about 250 words — edit after the results exist)

Construction is one of the most hazardous industries, and site safety still relies largely on manual inspection and delayed reporting. This project presents BuildTrack, a web-based platform that monitors a construction site in real time. Environmental sensors (gas, temperature, vibration, noise, dust, humidity, tilt) publish readings over MQTT or HTTP; cameras supply video that is analysed for personal-protective-equipment (PPE) compliance, motion during secured hours, camera tampering and audio events. A stream-processing pipeline built on Redis Streams validates each reading, evaluates configurable safety rules in event time, applies rolling z-score anomaly detection, and correlates events within a zone. Alerts and incidents are written to PostgreSQL atomically with outbox events, then pushed to a Next.js control-room interface over Socket.IO and to notification channels. Time series and detection logs are held in MongoDB, and hot state in Redis. The platform provides role-based access control, an audit log, incident workflow, a site map with hazard zones, KPI roll-ups, a linear-trend forecast and exportable reports. The backend has [82] automated tests (pytest) and the frontend has [9] (Vitest). We evaluate [TODO: end-to-end latency p95 = … ms; sustained throughput = … msg/s; alert precision/recall on labelled synthetic streams = … / …; PPE detector mAP@0.5 = … on dataset …]. The computer-vision component uses a mock detector unless PPE-trained weights are supplied, so detection accuracy is reported only for [TODO: the trained model]. BuildTrack is a decision-support prototype validated with simulated data; field validation is future work.

**Keywords:** construction safety, IoT, MQTT, computer vision, PPE detection, event-driven architecture, stream processing, transactional outbox, anomaly detection, real-time dashboard.

**List of abbreviations** — see Glossary, D.2.

---

## A.1 Chapter 1 — Introduction

### 1.1 Background
- Construction has a high rate of fatal and non-fatal accidents compared with most industries. `[TODO: cite current statistics from ILO / OSHA / national agency for your country; give year and source.]`
- Common hazards the project targets: toxic or flammable gas in excavations and confined spaces, heat stress, excessive vibration (piling, adjacent structures), noise exposure, dust, missing PPE (helmet, high-visibility vest), unauthorised access out of hours, and structural movement (tilt).
- Current practice: periodic walk-round inspections, paper or spreadsheet logs, separate CCTV and sensor systems that nobody watches continuously.
- Opportunity: low-cost IoT sensors, IP cameras, and commodity stream-processing software make continuous monitoring feasible.

### 1.2 Problem statement
Safety signals on a construction site are scattered across disconnected devices and are reviewed late. A site manager needs one place that (1) ingests heterogeneous signals reliably, (2) detects hazardous conditions within seconds, (3) tells the right people, (4) tracks the response to closure, and (5) leaves an auditable record.

### 1.3 Objectives
1. Ingest multi-type sensor telemetry over MQTT and HTTP, and camera video/audio over HTTP/RTSP.
2. Validate data and reject or flag bad readings without losing the evidence.
3. Evaluate configurable safety rules (threshold, range, sustained-duration, cooldown) and statistical anomalies in near real time.
4. Check PPE compliance per person from camera frames.
5. Correlate related events in a zone into higher-severity incidents.
6. Deliver alerts to a live dashboard and notification channels with at-least-once guarantees.
7. Support the incident lifecycle: open → acknowledged → investigating → resolved → closed.
8. Provide role-based access, an audit trail, KPI analytics, a short-horizon forecast and exportable reports.
9. Provide simulators so the whole pipeline can be exercised without hardware.

### 1.4 Scope
**In scope:** the backend services, the web control room, the device simulators, the data model, automated tests, and the evaluation of the pipeline on simulated and (if available) public data.

**Out of scope / not done** ⚠ (state these honestly):
- Field deployment on a real site; real sensor hardware.
- A trained PPE model (none ships with the repo).
- Load testing at production scale, browser end-to-end tests, CI/CD, containerisation (a plan exists in `backend/docs/DOCKER_LATER.md` and `frontend/docs/DOCKER_LATER.md`).
- Formal safety certification.

### 1.5 Contributions (report level)
- A working end-to-end pipeline from device to dashboard with reliability patterns (consumer groups, retries, dead-letter queue, idempotent writes, transactional outbox).
- A rule engine that works in **event time**, so recorded data can be replayed to reproduce alerts.
- A per-person PPE compliance algorithm that avoids the frame-level error where one worker's helmet hides another's missing helmet.
- Detectors that need no trained model (rolling z-score, background-subtraction intrusion, tamper detection, audio impulse detection).
- Simulators that emit ground-truth labels, so alert quality can be measured.

### 1.6 Report organisation
One paragraph per chapter. Write last.

---

## A.2 Chapter 2 — Literature review

Write about 3 to 5 pages. Organise by theme, not by paper. For each theme: what is known, what is missing, how BuildTrack relates. Verify every citation (D.4 has candidates).

| Theme | What to cover | BuildTrack link |
|---|---|---|
| 2.1 Construction safety statistics and hazards | Causes of injury (falls, struck-by, electrocution, caught-in), regulatory PPE rules | Motivates gas, vibration, PPE, intrusion monitoring |
| 2.2 IoT and sensor monitoring on sites | Wireless sensors, MQTT as lightweight pub/sub, edge vs cloud | MQTT + HTTP ingest, topic scheme `sites/{site_id}/sensors/{type}/{sensor_id}` |
| 2.3 Computer-vision PPE detection | YOLO family; helmet and vest detection papers; datasets; failure modes (occlusion, small objects, lighting) | `app/cv/`, per-person rules in `ppe_rules.py` |
| 2.4 Anomaly detection in streams | Statistical (z-score, EWMA), model-based; false-alarm trade-offs | Rolling z-score in `anomaly.py` |
| 2.5 Stream-processing and reliability patterns | Event time vs processing time; at-least-once; idempotence; transactional outbox; dead-letter queues | Redis Streams worker, outbox publisher |
| 2.6 Polyglot persistence | Relational for entities; document/time-series for telemetry; cache for hot state | PostgreSQL + MongoDB + Redis |
| 2.7 Digital twins / dashboards / BIM-linked monitoring | What commercial and academic systems offer | Control-room UI, site map |
| 2.8 Forecasting and risk scoring | Linear trend baselines vs ML; why heuristics need validation | `predict_forecast`, `calculate_risk_scores` |

**Gap statement (draft):** Existing work either focuses on a single modality (usually vision) or describes systems without evaluating reliability and replayability; few report ground-truth-labelled streams or make the pipeline reproducible. BuildTrack combines modalities and documents its guarantees and limits. `[TODO: confirm against your literature search before claiming a gap.]`

**Comparison table to fill** (competitor/related systems × features): multi-sensor, vision PPE, rule engine, event-time replay, incident workflow, open source, evaluated on real data. `[TODO]`

---

## A.3 Chapter 3 — Requirements analysis

### 3.1 Stakeholders and roles
The role enum in `backend/app/db/models/user.py` is `admin`, `project_manager`, `safety_officer`, `site_engineer`, `viewer`. (An older audit mentions a `CONTRACTOR` role; it is not in the code.)

| Role | Needs |
|---|---|
| Admin | User management, audit log, system health, all projects |
| Project manager | Project and schedule overview, incidents, notifications for their projects |
| Safety officer | Alerts, incidents, PPE compliance, rules, notifications |
| Site engineer | Site map, sensors/cameras, schedule and daily data |
| Viewer | Read-only dashboards |

Demo accounts exist for admin, safety officer and project manager (do not print passwords in a published paper).

### 3.2 Functional requirements (use IDs in later traceability)

| ID | Requirement | Where implemented |
|---|---|---|
| FR-1 | Ingest sensor readings over MQTT | `app/ingestion/mqtt_consumer.py` |
| FR-2 | Ingest readings over authenticated HTTP | `POST /api/v1/telemetry/ingest` (X-API-Key) in `app/api/v1/sensors.py` |
| FR-3 | Pull readings from device URLs (JSON polling, SSE) | `app/ingestion/sensor_sources.py` |
| FR-4 | Validate type, range, timestamp, duplicates; keep rejected messages | `app/processing/validation.py` |
| FR-5 | Store time series and latest value | `app/processing/telemetry.py` (MongoDB + Redis) |
| FR-6 | Configurable rules with operators, duration and cooldown | `app/processing/rule_engine.py`, `app/api/v1/rules.py` |
| FR-7 | Statistical anomaly detection per sensor | `app/processing/anomaly.py` |
| FR-8 | Correlate events in a zone | `app/processing/event_processor.py` |
| FR-9 | Ingest and analyse camera video, per-person PPE check | `app/ingestion/video_stream_handler.py`, `app/cv/` |
| FR-10 | Detect intrusion and camera tampering | `app/cv/security.py` |
| FR-11 | Analyse camera audio (level, impulse events) | `app/ingestion/audio_analyzer.py` |
| FR-12 | Create alerts, auto-create incidents with sequential codes (`INC-YYYY-NNNN`) | `app/processing/alerts.py`, `app/db/repositories/incident_repo.py` |
| FR-13 | Incident workflow, timeline, comments, attachments | `app/api/v1/incidents.py` |
| FR-14 | Real-time push to browsers, room-scoped by project/site/user | `app/realtime/socketio_server.py` |
| FR-15 | Notifications to relevant users | `app/notifications/engine.py` |
| FR-16 | Site map with zones, geofencing, sensor/camera markers | `app/api/v1/sites.py`, `zones.py`; `SiteMapLeaflet.tsx` |
| FR-17 | KPIs, risk score, trends, forecast | `app/processing/analytics.py`, `app/api/v1/analytics.py` |
| FR-18 | Report export (PDF, CSV, XLSX) | `AnalyticsEngine.generate_report_file` |
| FR-19 | Authentication, refresh, revocation, RBAC | `app/api/v1/auth.py`, `app/core/security.py`, `app/gateway/` |
| FR-20 | Audit log | `app/db/models/audit.py` |
| FR-21 | Full-text search over alerts and incidents | `app/api/v1/search.py` (PostgreSQL `tsvector` + GIN) |
| FR-22 | Project management data: schedule, BOQ, manpower, materials, drawings | `app/api/v1/projects.py` |
| FR-23 | File storage with signed URLs | `app/storage/`, `app/api/v1/storage.py` |
| FR-24 | Device simulation and registration | `device-simulator/`, `backend/scripts/` |

### 3.3 Non-functional requirements

| ID | Quality | Target | Evidence |
|---|---|---|---|
| NFR-1 | Latency: reading → alert | `[TODO: set a target, e.g. p95 < 2 s]` | Experiment E3 |
| NFR-2 | Throughput | `[TODO: e.g. 500 msg/s sustained]` | Experiment E4 |
| NFR-3 | Reliability: no loss of accepted readings on worker crash | 0 lost | Experiment E6, `test_stream_retry_dlq.py` |
| NFR-4 | Reproducibility: replay gives identical alerts | identical set | Experiment E5 |
| NFR-5 | Security: tokens, RBAC, rate limit, signed URLs, secret-key check outside dev | see 4.8 | Tests in `test_auth_*`, `test_signed_urls.py` |
| NFR-6 | Observability | Prometheus metrics, health probes, structured logs | `/metrics`, `/health/*` |
| NFR-7 | Maintainability | Layered code, migrations, repositories, settings from environment | Structure |
| NFR-8 | Portability | Runs without Docker today; containerisation planned | `start.sh` |
| NFR-9 | Usability | Control-room UI, command palette, themes, TV-wall mode | `[TODO: SUS survey, E12]` |

### 3.4 Constraints and assumptions
- Single-machine development deployment; backing services on default ports.
- MQTT broker without authentication in development (`MQTT_USERNAME/PASSWORD` supported but unset).
- Camera frames are processed at a configured analysis rate (`CV_INFERENCE_FPS=2`, per-camera `fps`), not every frame.

### 3.5 Use cases (draw as UML)
UC-1 Monitor live site; UC-2 Respond to alert; UC-3 Manage incident; UC-4 Configure rule; UC-5 Review PPE compliance; UC-6 Register a device; UC-7 Export a report; UC-8 Administer users and view audit log. For each: actor, precondition, main flow, alternative flow, postcondition.

**Worked example (UC-2).** A gas sensor in the excavation zone reports 105 ppm. The pipeline raises a *critical* alert, opens incident `INC-2026-0001`, notifies admins and the project's safety officers and managers, and the control room shows the alert immediately. The safety officer acknowledges it, investigates, and resolves it with a root cause. The timeline records every step.

---

## A.4 Chapter 4 — System design

### 4.1 Architecture overview
Redraw the diagram from root `README.md` §1 as a proper figure (draw.io / Mermaid). Describe six layers:

1. **Sources:** IoT sensors (MQTT 1883), IP cameras (RTSP/HTTP), web clients (REST, Socket.IO).
2. **Ingestion:** MQTT consumer (`aiomqtt`, reconnect with backoff), HTTP ingest endpoint, pull-based sensor poller, video stream handler (OpenCV).
3. **Processing:** stream worker (Redis consumer group `processors`), validation, rule engine, anomaly scorer, correlation service, CV service, audio and security analysers, 1-minute KPI roll-up scheduler.
4. **Storage:** PostgreSQL 16 (entities, alerts, incidents, roll-ups), MongoDB 7 (time series, detections, rejected messages, event log), Redis 7 (stream, dedup, caches, revocation, rate limits), object storage (local filesystem or S3/MinIO).
5. **Real-time delivery:** transactional outbox → publisher → Socket.IO namespace `/live`; notification engine.
6. **Gateway and client:** FastAPI (REST, OpenAPI at `/docs`), Next.js 16 control room with a backend-for-frontend proxy.

**Process model.** `./start.sh` starts four backend roles (API + Socket.IO, stream worker + scheduler, MQTT consumer, video handler), selected by `python -m app.cli api | worker | mqtt-consumer | video-handler`. Roles scale independently because they communicate only through the data stores.

### 4.2 Technology choices and justification

| Concern | Choice | Version (from `requirements.txt`/`package.json`) | Why |
|---|---|---|---|
| API | FastAPI + Uvicorn, Pydantic v2 | fastapi 0.159.1 | Async, typed, auto OpenAPI |
| Relational | PostgreSQL 16, SQLAlchemy 2 (async), asyncpg, Alembic | SQLAlchemy 2.1.6 | ACID for alerts/incidents/outbox, FTS, migrations |
| Time series / logs | MongoDB 7 via Motor | motor 3.7.1 | High write rate, flexible documents, time-series collection |
| Stream / cache | Redis 7 (Streams, sorted sets, TTL keys) | redis 8.1.0 | Consumer groups, XAUTOCLAIM, low-latency state |
| MQTT | Mosquitto broker, `aiomqtt` | aiomqtt 2.5.1 | Standard IoT pub/sub |
| CV | OpenCV (headless), Ultralytics YOLO (optional extra) | opencv-python-headless 5.0.0.93; ultralytics 8.3.82 | Frame decode, detection |
| Spatial | Shapely, GeoJSON | shapely 2.2.0 | Point-in-polygon zones (PostGIS is a feature flag, off) |
| Analytics | NumPy, pandas, reportlab, openpyxl | pandas 3.0.6 | Roll-ups, forecast, report files |
| Scheduling | APScheduler | 3.11.3 | 1-minute roll-ups |
| Auth | PyJWT (HS256), bcrypt | PyJWT 2.15.1, bcrypt 5.0.0 | Stateless tokens + Redis revocation |
| Metrics | prometheus_client | 0.26.0 | Scrapable metrics |
| Frontend | Next.js (App Router), React, TypeScript, Tailwind v4 | next 16.4.2, react 19.3.0 | SSR/BFF, typed UI |
| UI state/data | Zustand, TanStack Query, Recharts, Leaflet, Radix UI, socket.io-client, Zod | see `frontend/package.json` | Live state, caching, charts, map |
| Testing | pytest (+asyncio), Vitest, MSW | pytest 9.1.1; vitest ^5.0.5 | |

Run-time environment used for the audits: macOS, Python 3.12, PostgreSQL 16, MongoDB 7, Redis 7, Mosquitto 2.1. `[TODO: record the exact machine used for experiments.]`

**Why three data stores (argue this, do not just assert it).** Alerts, incidents and outbox events need transactions and joins, so they live in PostgreSQL. Readings arrive continuously and are queried by time, so they live in a MongoDB time-series collection with a `sensor_latest` projection. Redis holds data that is hot, short-lived, or needs atomic set-if-absent and TTL (dedup keys, rolling windows, revocation list, rate limits). Cost: operational complexity and no cross-store transaction, which is why the outbox pattern and idempotent writes are used. `[TODO: discuss what you would do with TimescaleDB as a single-store alternative; the flag FEATURE_TIMESCALE exists but is off.]`

### 4.3 Data design

**PostgreSQL — 26 tables** (count of `__tablename__` in `backend/app/db/models/`), grouped:

| Group | Tables |
|---|---|
| Identity and audit (4) | `users`, `device_tokens`, `notification_preferences`, `audit_logs` |
| Projects (9) | `projects`, `project_members`, `sites`, `zones`, `schedules`, `boq_items`, `manpower`, `materials`, `drawings` |
| Devices (2) | `sensors`, `cameras` |
| Safety (5) | `rules`, `alerts`, `incidents`, `incident_updates`, `incident_attachments` |
| Messaging (2) | `notifications`, `outbox_events` |
| Analytics (4) | `kpi_rollups`, `ppe_compliance_ts`, `alert_counts_ts`, `report_metadata` |

Other facts: 4 Alembic migrations (`6b28f9fe19f1_initial_schema`, nullable KPI roll-up metrics, sensor `source_url`, camera `audio_url`); soft deletion via `deleted_at`; `tsvector` columns with GIN indexes for alert and incident search; idempotent roll-up upsert `ON CONFLICT (site_id, bucket_ts, kpi_name) DO UPDATE`.
`[TODO: generate an ER diagram (e.g. with an ERD tool from the live database) and include it.]`

**MongoDB collections:** `sensor_readings` (time series), `sensor_latest` (current value per sensor), `cv_detections`, `rejected_messages` (bad payloads and reasons), `event_log` (normalised events with correlation ids), `camera_analytics` (motion, brightness, sharpness samples).

**Redis keys:**

| Key | Purpose |
|---|---|
| `stream:ingest`, `stream:dlq` | Ingest stream and dead-letter queue; consumer groups `validators`, `processors` |
| `dedup:reading:{sensor}:{epoch_ms}` | Duplicate-reading guard (TTL 300 s) |
| `dedup:alert:{rule}:{sensor}` | Rule cooldown (value = event time of last alert) |
| rule state key per `(rule, sensor)` | `"<first_breach_ts>:<last_breach_ts>"` for duration rules |
| `latest:sensor:{id}` | Hot cache of latest reading |
| `anomaly:window:{sensor}`, `anomaly:last_alert:{sensor}` | Rolling window and cooldown |
| `corr:zone:{zone}`, `corr:fired:{zone}:{type}` | Correlation window and cooldown |
| `dedup:security:intrusion:{camera}`, `dedup:security:tamper:{camera}` | Security alert cooldowns |
| `tokens:revoked:{jti}` | JWT revocation |
| `rl:{client}:{route}` | Sliding-window rate limit |

### 4.4 Message formats
Sensor payload (JSON): `sensor_id`, `site_id`, `type`, `value`, optional `unit`, `ts` (ISO-8601 or epoch), `battery`, `zone_id`, `location`.
Topic: `sites/{site_id}/sensors/{type}/{sensor_id}` (default subscription `sites/+/sensors/#`; an older audit text shows a different topic, ignore it).
Socket.IO events: `sensor:update`, `alert:new`, `alert:escalated`, `incident:new`, `notification:new`, `cv:detection`. Rooms: `site:{id}`, `user:{id}`, `broadcast`; clients can join only projects they belong to (admins all).

### 4.5 API design
REST under `/api/v1`, 79 paths and 112 operations in `backend/docs/openapi.json`, grouped into: auth, projects, sites, zones, sensors, cameras, cv, rules, alerts, incidents, analytics, notifications, search, storage, health. Interactive docs at `/docs`, `/redoc`. Pagination, filtering and error format: `[TODO: read schemas/common.py and describe.]`

### 4.6 Frontend architecture
- Next.js App Router with route groups `(auth)` and `(app)`; **backend-for-frontend**: browser calls `/api/proxy/[...path]`, which attaches tokens from `httpOnly`, `SameSite=Lax` cookies; single-flight refresh on 401; a short-lived token is exchanged at `/api/auth/socket-token` for the Socket.IO handshake.
- State: Zustand stores (`authStore`, `liveStore`, `projectStore`, `uiStore`); server data via TanStack Query; live events via `SocketProvider`.
- Mock mode: `NEXT_PUBLIC_USE_MOCKS` enables MSW handlers and a mock socket simulator. ⚠ Screenshots used as evidence must be taken with mocks **off** and the real backend running.
- Modules (pages under `frontend/src/app/(app)/`): dashboard, live, safety, site-map, alerts, incidents (+ detail), rules, projects (+ detail), analytics, notifications, admin, profile, offline, 403, dev/components.

### 4.7 Deployment view
Current: processes started by `start.sh`. Planned: containers (`DOCKER_LATER.md`, Next.js `output: 'standalone'`). Draw a deployment diagram for both: *today* and *target*.

### 4.8 Security design
- Passwords: bcrypt (input truncated to 72 bytes — mention as a known bcrypt property).
- JWT HS256: access token default 60 minutes, refresh 7 days; `jti` stored in Redis on revocation (`tokens:revoked:{jti}`); test `test_auth_revocation.py`.
- RBAC: `require_roles` dependency (admin always allowed); project membership check; room-scoped Socket.IO.
- Device ingest: shared secret `INGEST_API_KEY` via `X-API-Key` (constant-time comparison; a fallback key list and valid user tokens are also accepted, see `sensors.py:266-290`) ⚠ the repo ships a default key value for convenience; production must override it.
- Startup guard: refuses a placeholder or short `SECRET_KEY` unless `APP_ENV` is `development` or `test`.
- Signed URLs for stored files: HMAC-SHA256 tokens, 15 minutes by default.
- Rate limiting: Redis sorted-set sliding window.
- SSRF-style controls on user-supplied camera/audio URLs: scheme allow-list (`http, https, rtsp, rtsps`) in the audio module `[TODO: check cameras.py for equivalent validation before claiming it]`.
- ⚠ Not covered: MQTT broker authentication/TLS in dev, TLS termination, secrets management, penetration test.

---

## A.5 Chapter 5 — Implementation

For each subsection: purpose → algorithm (pseudo-code) → parameters → edge cases → code reference → small example. Keep each to 1 to 2 pages.

### 5.1 Ingestion
- **MQTT consumer** subscribes to the topic filter and pushes raw payloads into `stream:ingest` (no business logic, so the consumer stays fast). Counter `ingest_messages_total` is incremented here.
- **HTTP ingest** accepts the same payload with an API key.
- **Pull sources** (`sensor_sources.py`): a sensor can have a `source_url`; JSON endpoints are polled every `SENSOR_SOURCE_POLL_SECONDS` (2.0 s), Server-Sent-Events endpoints are consumed as pushes.
- **Video handler** re-reads the camera registry every `CAMERA_SYNC_SECONDS` (10 s), starts or stops a worker per camera, decodes frames with OpenCV, serves view frames at `CAMERA_VIEW_FPS` (10, max width 1280), runs PPE detection at the camera's analysis rate, and records rolling MP4 segments (`CAMERA_RECORDING_*`, 5-minute segments, 24 h retention). Local paths of the form `/videos/<file>` resolve to the repo `videos/` folder.

### 5.2 Validation (`validation.py`)
Steps in order: required fields (`sensor_id`, `site_id`, `type`, `value`) → numeric value → unit default → timestamp → physical range → duplicate.

| Rule | Value |
|---|---|
| Ranges | temperature −50..150 °C; gas 0..10000 ppm; vibration 0..500 mm/s; noise 0..160 dB; humidity 0..100 %; dust 0..5000 µg/m³; tilt −90..90° |
| Future timestamp | reject if > 300 s ahead of the clock |
| Old timestamp | reject if > 90 days old |
| Missing timestamp | stamp with arrival time, flag `ts_assigned_on_arrival` |
| Unparseable timestamp | reject (never silently re-time) |
| Duplicate | `SET NX` on `dedup:reading:{sensor}:{ms}` with 300 s TTL |
| Rejected payloads | stored in Mongo `rejected_messages` with the reason |

The clock is injectable, which makes validation deterministic in tests and replays.

### 5.3 Stream worker (`workers/stream_worker.py`)
Reads with `XREADGROUP`; on success `XACK`. A message that fails stays pending; idle pending messages (>10 s, `RECLAIM_IDLE_MS`) are reclaimed with `XAUTOCLAIM`; after `MAX_DELIVERIES = 3` it moves to `stream:dlq`. Raw inserts are idempotent, so retries do not duplicate data. The worker publishes gauges `stream_lag_records` and `dlq_size_records`. Notification recipients: active admins plus safety officers and project managers who are members of the alert's project.

**Delivery semantics (state precisely):** at-least-once from stream to storage, made effectively-once for raw reading inserts by idempotence; at-least-once from outbox to Socket.IO (clients should tolerate duplicates). `[TODO: verify whether any client-side dedup exists before claiming otherwise.]`

### 5.4 Rule engine (`rule_engine.py`)
Operators: `>`, `<`, `>=`, `<=`, `==` (tolerance 1e-5), `!=`, `between` (inclusive), `outside`. Rules are selected by sensor type, site and (optionally) zone.

Pseudo-code (event time `t` = the reading's own timestamp):
```
for rule in active_rules(sensor_type, site, zone):
    if breach(rule, value):
        if rule.duration > 0:
            (start, last) = state[rule, sensor]
            if start is None or t - last > rule.duration: start = t     # gap restarts the timer
            state[rule, sensor] = (start, t)
            if t - start < rule.duration: continue                       # not sustained yet
        if rule.cooldown > 0 and 0 <= t - last_alert[rule, sensor] < rule.cooldown: continue
        last_alert[rule, sensor] = t; clear duration state
        emit alert(with thresholds, cooldown, rule_updated_at, reading_ts for provenance)
    else:
        clear duration state
```
Why event time: replaying recorded telemetry reproduces the same alerts; silence from an offline sensor is never counted as a sustained breach.

**Seeded demo rules** (`scripts/seed.py`):

| Rule | Type | Condition | Duration | Severity | Cooldown | Auto-incident |
|---|---|---|---|---|---|---|
| Toxic Gas Exceedance Warning | gas | > 50 | 0 | warning | 300 s | no |
| Critical Toxic Gas Spike Alert | gas | > 100 | 0 | critical | 180 s | yes |
| High Heat Stress Duration Condition | temperature | > 42 | 60 s | warning | 300 s | no |
| Excessive Pile Driving Vibration | vibration | > 20 | 0 | critical | 240 s | yes |
| Perimeter Noise Curfew Breach | noise | > 85 | 120 s | info | 600 s | no |

Seeded devices: 4 sensors (`TEMP-001`, `GAS-001`, `VIB-001`, `NOISE-001`), 8 cameras (`CAM-01`..`CAM-08`) pointing to local videos, 2 zones (Excavation Pit A, Scaffolding Zone B), 1 project/site.

⚠ Two details that matter for evaluation: (1) a gas reading of 105 ppm breaches **both** gas rules and produces two alerts; (2) the two duration rules require a continuous breach of 60 s and 120 s, which the independent-spike MQTT simulator essentially never produces (see E2).

### 5.5 Anomaly detection (`anomaly.py`)
Per-sensor rolling window of the last `ANOMALY_WINDOW = 60` values in Redis. A new value is scored against the window **before** it is added (a spike cannot dampen its own score). After `ANOMALY_MIN_SAMPLES = 20` readings, flag if `|z| ≥ ANOMALY_Z_THRESHOLD = 4.0` using the sample standard deviation (n−1). Alerts are rate-limited per sensor in event time (`ANOMALY_COOLDOWN_SECONDS = 300`). It complements fixed rules by catching values that are abnormal for *this* sensor even when no limit is crossed.
Note: `event_processor.py` also has an older helper `check_anomaly_zscore` (window 20, threshold 3.0, population std). The stream worker calls `score_reading` from `anomaly.py` (`stream_worker.py:191`) and nothing calls the older helper, so describe only `anomaly.py` and treat the other as dead code to remove.
⚠ Limits: a plain z-score assumes a roughly stationary signal; trends and daily cycles inflate false alarms or hide anomalies; a slow drift is absorbed into the window.

### 5.6 Event correlation (`event_processor.py`)
Events are keyed by kind and sensor type (e.g. `sensor_threshold:gas`, `ppe_violation`) in a per-zone sorted set within `CORRELATION_WINDOW_SECONDS = 300`. Two correlations are defined:

| Correlation | Required events (same zone, within window) |
|---|---|
| `gas_hazard_unprotected_workers` | gas threshold + PPE violation |
| `structural_thermal_stress` | vibration threshold + temperature threshold |

A match raises a critical alert and incident; each correlation fires at most once per zone per `CORRELATION_COOLDOWN_SECONDS = 900`. All events are also written to Mongo `event_log` with a correlation id.

### 5.7 PPE compliance (`cv/ppe_rules.py`, `cv/detector.py`)
Required PPE: helmet and vest. Optional (not used in the decision): gloves, boots, mask.
1. Normalise class names from different datasets (`hardhat`, `no-hardhat`, `safety vest`, `head`, …) to one vocabulary.
2. For each **person box**, assign each PPE item whose box centre lies inside it; a helmet must be in the top 40 % of the person box (`HELMET_MAX_RELATIVE_HEIGHT = 0.4`).
3. A person is compliant only if every required item is assigned and no "no-X" class is assigned.
4. If the model returns no person boxes (head/PPE-only models), each "no-X" detection counts as one violating person.
5. Output: `compliant`, `missing_ppe`, `persons_count`, `violating_persons`, per-person details.

This is the improvement over frame-level logic, where one visible helmet marks the whole frame compliant.

**Detector modes** (`CV_MODE`):
- `mock` (default): ignores the image; one person; violation on every 4th call. Label `detector="mock"`.
- `yolo`: Ultralytics model at `CV_MODEL_PATH`, confidence `0.45`. If the file cannot be loaded, falls back to mock and labels `mock-fallback`. If the model has no PPE classes (e.g. COCO `yolov8n.pt`) an error is logged, because every person would be reported non-compliant. Label `yolo:<weights>`.
- Inference runs in a thread pool so the event loop is not blocked; gauge `cv_inference_fps{camera_id}`.
- PPE alerts are rate-limited per camera (`PPE_ALERT_COOLDOWN_SECONDS = 300`); every frame's detection is still recorded.
- Violation snapshots go to object storage.

⚠ Everything reported by the default install is mock output.

### 5.8 Video security analytics (`cv/security.py`)
No trained model. Per analysed frame (downscaled to width 320, grayscale): motion ratio from OpenCV MOG2 background subtraction (history 300, `varThreshold` 32, shadows off; ignored for the first 10 frames), mean brightness, Laplacian-variance sharpness.
- **Intrusion:** motion ratio ≥ `SECURITY_MOTION_THRESHOLD` (0.02) for `SECURITY_CONSECUTIVE_SAMPLES` (3) frames inside `SECURITY_HOURS` (default 19:00–07:00 in `SECURITY_TIMEZONE`) → critical alert.
- **Tamper:** brightness < 18 (covered) or sharpness < 15 % of the camera's own median baseline (needs ≥30 normal frames) for 3 frames → warning. The baseline learns only from non-tamper frames.
- Cooldown 600 s per camera and kind.

### 5.9 Audio analysis (`ingestion/audio_analyzer.py`)
Every second: equivalent level Leq (RMS in dBFS + `AUDIO_DB_OFFSET`, floored at 0) and the loudest 50 ms block. Leq is pushed into `stream:ingest` as a `noise` reading of the camera's auto-created audio sensor, so noise rules, anomaly detection and dashboards apply unchanged. An `acoustic_event` alert is raised when the peak exceeds the rolling level by `AUDIO_IMPULSE_DB = 20` (cooldown 60 s). WAV over HTTP is parsed natively (16-bit only); other sources go through `ffmpeg` if installed.
⚠ Levels are **uncalibrated** estimates of sound pressure (offset 100 dB). Calibrate against a reference meter before quoting dB(A) values.

### 5.10 Alerts, incidents and the outbox
- An alert, its optional incident, notifications and `outbox_events` rows are committed in **one PostgreSQL transaction**. If the transaction fails, none are visible (`test_outbox_rollback_atomicity` in `test_outbox.py`).
- The publisher polls pending outbox rows and broadcasts to Socket.IO / notification dispatch: at-least-once, no ghost events.
- Incident codes `INC-YYYY-NNNN`; states open → acknowledged → investigating → resolved → closed; escalation level increases for unacknowledged high-severity alerts.
- Notification providers (email, SMS, push) default to `console`; SMTP, Twilio, FCM settings exist ⚠ not verified against real services.

### 5.11 Analytics (`processing/analytics.py`)
- **KPIs:** schedule progress (mean `progress_percent`), PPE compliance (`null` when no frames), sensor uptime (online if seen within 300 s; `null` when no sensors), active alerts, open/resolved incidents, manpower present today, MTTR in hours.
- **Missing data is reported as missing**, never as 100 %.
- **Roll-ups:** the scheduler computes 1-minute site KPI aggregates with idempotent upserts.
- **Risk score (0–100), heuristic:** per zone, `score = min( (30·#critical + 12·#warning + 0.5·(100 − PPE%) if PPE% < 90) × zone_multiplier , 100)`, with multiplier low 1.0 / medium 1.3 / high 1.7. Bands: <30 Low, <65 Medium, <85 High, otherwise Critical. Site score = mean of zone scores (default 15 when there are no zones). ⚠ Weights are expert-chosen and not validated; the site-wide PPE rate is applied to every zone. Report it as an ordinal indicator.
- **Forecast:** ordinary-least-squares line on equally spaced observations, extrapolated `horizon` steps, 95 % **prediction** interval from Student-t with n−2 degrees of freedom: `ŷ ± t · s · sqrt(1 + 1/n + (x0 − x̄)²/Sxx)`. Direction is "increasing/decreasing" only if the slope's 95 % CI excludes zero, else "stable"; fewer than 3 points → `insufficient_data`. ⚠ This is a statistical baseline, not machine learning, and ignores seasonality.
- **Reports:** PDF (reportlab), CSV, XLSX with the KPI row. ⚠ The PDF is a simple key-value page; the dashboard text mentions "regulatory report generator", so describe what exists.

### 5.12 Storage
`StorageDriver` abstraction with local (`./data/storage`) and S3/MinIO (`STORAGE_BACKEND=s3`) implementations; signed upload/download tokens.

### 5.13 Frontend implementation
For each module give one screenshot, one paragraph, and the API/Socket events it uses (table). Highlights to describe: sparkline KPI cards and risk gauge (dashboard); sensor grid with a 30-point ring buffer and camera wall with canvas overlays (live); violation gallery and test-image analyser (safety); Leaflet map with polygon hazard zones and device placement (site map); Kanban incident board (incidents); predicate builder with plain-English preview and dry-run (rules); trends/forecast/report export (analytics); RBAC user management, audit table and subsystem health (admin); `Can` component and `rbac.ts` for role-based UI; command palette (Ctrl/Cmd+K); TV-wall mode; theme toggle; connect-source modal and add-device panel.

### 5.14 Simulators (`device-simulator/`, `backend/scripts/`)
- **`mqtt_sensor_simulator.py`** (backend): reads the seeded site/sensors, publishes at an interval; with probability `spike_chance = 0.2` per reading per sensor it emits a threshold-breaching value (gas 55 or 105; temperature 43–48; vibration 21–28; noise 88–96), else a normal value. `--seed` and `--labels-out` write one CSV row per reading with `injected_spike`. ⚠ Spikes are tuned to exceed the seeded thresholds, so detection of them is close to guaranteed; it tests the pipeline, not rule quality.
- **`device-simulator/`** (standalone server on port 8090): seven signal models (temperature, humidity, gas, noise, vibration, dust, tilt) with daily cycles, drift, noise and injected anomalies lasting several readings (`profiles.py`), reproducible by seed, with `injected_anomaly` ground truth; serves each video in `videos/` as an MJPEG camera (rescanned automatically); `register` creates the devices in BuildTrack; `run` streams over MQTT and HTTP/SSE.
- **`video_loop_simulator.py`**: synthetic frames with ground truth for the CV loop.

### 5.15 Observability and operations
Health: `/health/live`, `/health/ready` (PostgreSQL, MongoDB, Redis). Metrics at `/metrics`: HTTP request count and duration, ingest counter, stream lag, DLQ size, CV inference FPS, DB pool gauge. ⚠ `alert_creation_latency_seconds` and `validation_errors_total` are **defined but never recorded** in the code today; either wire them up (recommended, it makes E3 easy) or do not cite them. Note also that `ingest_messages_total` is incremented in the MQTT consumer process, so check that it is exposed where Prometheus scrapes it. Backup and restore scripts: `backend/scripts/backup.sh`, `restore.sh`.

### 5.16 Code size (for the report, approximate)
Backend `app/`: about 13.8 k lines of Python; backend tests: about 2.0 k lines; frontend `src/`: about 23.4 k lines of TypeScript/TSX (includes the generated `api-schema.d.ts`). `[TODO: re-count with cloc on the final commit and exclude generated files.]`

---

## A.6 Chapter 6 — Testing and verification

### 6.1 Strategy
Hermetic backend tests: they create and drop `<POSTGRES_DB>_test`, use Mongo `<MONGO_DB>_test`, Redis DB 15 and a temporary storage directory, and refuse to run against a non-`_test` database. Backing services must be running. Frontend: Vitest. Simulator: pytest in `device-simulator/tests/`.

### 6.2 Test inventory (`def test_` counts per file)

| File | # | Covers |
|---|---:|---|
| `test_validation.py` | 9 | required fields, numeric, range (incl. tilt), future timestamp, missing timestamp flag |
| `test_realtime_analysis.py` | 12 | real-time analysis pipeline, anomaly/correlation/audio/security |
| `test_auth_revocation.py` | 7 | token revocation |
| `test_device_connections.py` | 7 | device/source connection handling |
| `test_auth_rbac.py` | 6 | hashing, JWT, RBAC |
| `test_forecast.py` | 6 | OLS forecast, interval, insufficient data |
| `test_ppe_rules.py` | 6 | per-person PPE logic |
| `test_endpoints.py` | 5 | health, login, project CRUD, site sub-resources, dashboard summary |
| `test_rule_engine.py` | 4 | operators, duration, cooldown |
| `test_stream_retry_dlq.py` | 3 | retry then dead-letter |
| `test_alert_dedup.py`, `test_outbox.py`, `test_full_text_search.py`, `test_signed_urls.py`, `test_spatial_point_in_zone.py`, `test_rollups_analytics.py` | 2 each | dedup/escalation, outbox atomicity, FTS, signed URLs, point-in-polygon + GeoJSON, roll-up idempotence |
| `test_idempotent_telemetry.py`, `test_e2e_flow.py` | 1 each | idempotent persistence; full telemetry → alert → incident → outbox |

Sum of `def test_` ≈ 79; `pytest --collect-only` reports **82** (parametrised cases). Frontend: 9 tests (`liveStore`, `rbac`, `rulesLogic`). Simulator: `device-simulator/tests/test_simulator.py`. `[TODO: run the suites on the final commit and paste the real pass/fail summary, plus coverage if measured (pytest-cov).]`

### 6.3 What the tests prove, and what they do not
Prove: validation logic, rule semantics in event time, dedup/cooldown, retry/DLQ, outbox atomicity, RBAC and revocation, signed URL integrity, spatial zone logic, forecast maths, PPE assignment logic, an end-to-end happy path.
Do not prove: detection accuracy of any CV model, performance under load, behaviour with real devices or networks, browser behaviour (no Playwright/Cypress), long-running stability, or security against an active attacker.

### 6.4 Requirement traceability
Table FR/NFR → test file / experiment. `[TODO: fill using 3.2, 3.3 and 6.2.]`

### 6.5 Known defects and technical debt (shows maturity — include)
- ~180 ESLint errors from `any` use in the frontend; generated `api-schema.d.ts` is not yet used for typing.
- No CI, no Docker Compose.
- Metrics defined but not recorded (see 5.15).
- Documentation drifted from code in several places (see `research/README.md` §6).
- Two z-score implementations (see 5.5).

---

## A.7 Chapter 7 — Results and evaluation

Fill from Part C. Suggested layout; each subsection = goal, method (reference the experiment ID and run ID), results table/figure, interpretation, caveat.

| Section | Source | Headline metric |
|---|---|---|
| 7.1 Functional verification | E1 | tests passed / total |
| 7.2 Alert quality on labelled streams | E2 | precision, recall, F1, detection delay |
| 7.3 End-to-end latency | E3 | p50 / p95 / p99 |
| 7.4 Throughput and saturation | E4 | max sustained msg/s, lag growth |
| 7.5 Replay determinism | E5 | identical alert sets (yes/no, diff count) |
| 7.6 Fault tolerance | E6 | lost messages, recovery time |
| 7.7 Anomaly detector | E7 | PR curve vs threshold rules |
| 7.8 PPE detection | E8 | mAP@0.5, per-class P/R, FPS |
| 7.9 Forecast backtest | E9 | MAE/MASE, interval coverage |
| 7.10 Security analytics and audio | E10, E11 | detection rate, false alarms, level error |
| 7.11 Usability (optional) | E12 | SUS score |
| 7.12 Security checks | E13 | pass/fail list |

---

## A.8 Chapter 8 — Discussion

- **Interpretation:** what the numbers mean for a site manager.
- **Design trade-offs:** polyglot persistence vs single store; Redis Streams vs Kafka (simplicity vs scale and retention); outbox polling latency vs complexity; event time vs arrival time (reproducibility vs need for trusted device clocks); heuristic risk vs learned model.
- **Limitations** ⚠: simulated data; mock CV by default; uncalibrated audio; single-node; no field trial; hand-tuned thresholds; z-score assumptions; no authentication on the dev MQTT broker; only Chrome/desktop UI tested `[TODO: confirm]`.
- **Threats to validity:** construct (do labelled spikes represent real hazards?), internal (single machine, one seed), external (other sites, sensors, lighting), conclusion (small n, no repeated trials).
- **Ethics and privacy:** worker surveillance, consent, retention (recordings auto-delete after 24 h by default), anonymisation, bias in PPE detectors across lighting and skin tone/clothing, false-alarm fatigue, risk of over-reliance on an uncertified system.

## A.9 Chapter 9 — Conclusion and future work

**Conclusion (draft):** BuildTrack integrates multi-modal safety monitoring into one event-driven platform and shows that [TODO: key results]. Its guarantees (validation, event-time rules, at-least-once delivery with idempotence, atomic alert and outbox) are verified by automated tests; its detection quality is established only for [TODO]. 

**Future work (prioritised):**
1. Train and evaluate a PPE model on a public dataset; publish per-class metrics.
2. Load and soak tests; Locust/k6 against the HTTP ingest and an MQTT load generator; latency SLOs.
3. Playwright end-to-end tests; CI pipeline; Docker Compose.
4. Wire up the unused metrics; add tracing (OpenTelemetry).
5. Replace fixed-weight risk score with a model validated on incident data; seasonal forecasting (e.g. seasonal-naive, ETS) with backtesting.
6. MQTT authentication + TLS; secrets management; penetration testing.
7. Edge inference on-site; pose-based fall detection; worker–equipment proximity warnings.
8. Calibrated acoustic monitoring; BIM/schedule integration; multi-site tenancy.
9. Field pilot with consent and ethics approval.

## A.10 References and appendices

- **References:** one list (IEEE or APA, as the institute requires). Candidates in D.4 — verify.
- **Appendix A:** installation and run guide (from `run.md`).
- **Appendix B:** configuration reference (table of `config.py` settings with defaults).
- **Appendix C:** API endpoint list (generate from `openapi.json`).
- **Appendix D:** database schema (DDL or ER diagram).
- **Appendix E:** test output.
- **Appendix F:** user manual with screenshots.
- **Appendix G:** experiment raw data and scripts.
- **Appendix H:** survey instrument (if E12 is run).

---

# PART B — RESEARCH PAPER

## B.1 Positioning

**Do not claim** a new detection model, "AI-based" prediction, or validated risk scoring. **Do claim** (if the experiments support it): a reproducible architecture with measured correctness, latency and robustness, and an evaluation methodology based on ground-truth-labelled synthetic streams plus a PPE-detector evaluation on a public dataset.

**Candidate research questions**

- **RQ1 (correctness/reproducibility).** Does evaluating rules in event time make alert generation deterministic under replay, compared with arrival-time evaluation?
- **RQ2 (reliability).** Does the stream + idempotence + outbox design avoid message loss and ghost events under process failure, and at what latency cost?
- **RQ3 (timeliness).** What end-to-end latency (device → dashboard) does the system achieve and where does it saturate?
- **RQ4 (detection quality).** How do fixed-threshold rules and rolling z-score anomaly detection compare on labelled sensor streams (precision/recall/delay)?
- **RQ5 (vision).** How accurately can a YOLO model trained on a public construction-PPE dataset support the per-person compliance rule, versus a frame-level rule?

Pick 2 or 3. RQ1 + RQ2 + RQ3 are fully achievable with the current code; RQ4 needs E2/E7; RQ5 needs a trained model.

**Hypotheses (examples):** H1: replay of the same labelled stream yields identical alert sets with event-time evaluation and differing sets with arrival-time evaluation. H2: no accepted reading is lost when a worker is killed mid-stream. H3: p95 latency stays under `[TODO]` s up to `[TODO]` msg/s. H4: per-person compliance reduces false "compliant" frames compared with frame-level logic on multi-person images.

## B.2 Title options
1. *An Event-Time, Outbox-Based Architecture for Reliable Real-Time Safety Monitoring on Construction Sites*
2. *BuildTrack: Reproducible Multi-Modal Hazard Detection for Construction Sites*
3. *From Sensors and Cameras to Incidents: A Reliability-Focused Evaluation of a Construction Safety Monitoring Pipeline*

## B.3 Abstract (draft, 150–200 words — finalise after results)

Construction sites produce heterogeneous safety signals — environmental sensors, video, and audio — that are rarely processed together or evaluated for reliability. We present BuildTrack, an open event-driven pipeline that validates telemetry, evaluates configurable safety rules in event time, scores rolling z-score anomalies, correlates events by zone, checks per-person PPE compliance from video, and delivers alerts and incidents to a live dashboard using a transactional outbox. We evaluate the system on ground-truth-labelled synthetic streams and [TODO: public dataset]. Replay of identical input produced [identical / TODO] alert sets (RQ1). Under injected worker failure, [TODO: n] of [TODO: N] accepted readings were lost and [TODO] duplicates were delivered (RQ2). End-to-end latency from reading to alert was [TODO] ms at p95 up to [TODO] messages per second, beyond which stream lag grew (RQ3). On labelled streams, threshold rules achieved precision/recall of [TODO] and the z-score detector [TODO] (RQ4). A YOLO model trained on [TODO dataset] reached mAP@0.5 of [TODO] (RQ5). Limitations include simulated telemetry, a single-node deployment, and no field trial.

## B.4 Paper outline with writing prompts

**1. Introduction (≈1 page).** Problem and stakes → gap → what this paper does → contributions (3 bullets) → paper roadmap.

*Contributions (draft; keep only what the evidence supports):*
1. An architecture combining Redis Streams, polyglot persistence and a transactional outbox for site-safety monitoring, with documented delivery semantics.
2. An event-time rule engine with duration and cooldown semantics that supports deterministic replay.
3. A per-person PPE compliance rule that handles multi-person frames.
4. An evaluation methodology with ground-truth-labelled simulators and released scripts; results for latency, throughput, fault tolerance and detection quality.

**2. Related work (≈1 page).** Four paragraphs: vision-based PPE detection; IoT safety monitoring; stream-processing reliability patterns; anomaly detection. End with a sentence that positions BuildTrack.

**3. System overview (≈1 page + one architecture figure).** Components, data flow, guarantees. Reference A.4, A.5.

**4. Methods (≈1.5 pages).**
 - 4.1 Event-time rule semantics (pseudo-code from 5.4; define breach, sustained breach, cooldown formally).
 - 4.2 Reliability mechanisms (delivery states: ingest → pending → ack/DLQ; outbox transaction).
 - 4.3 Anomaly scoring (formula: `z = (x − μ_w)/σ_w` over the last 60 values before x; flag if `|z| ≥ 4`, after ≥ 20 samples).
 - 4.4 Per-person PPE assignment (centre-in-box, top-40 % helmet rule).
 - 4.5 Forecast (only if used in the paper).

**5. Experimental setup (≈1 page).** Hardware/software table; datasets; simulators and seeds; parameter table; metrics (C.2); statistical treatment (repeat runs, report median and range or CI); artifact availability.

**6. Results (≈2 pages).** One subsection per RQ: table or figure → two sentences of interpretation → one caveat.

**7. Discussion (≈0.5 page).** What the results mean; trade-offs; when the design is not appropriate (e.g. scale beyond a single Redis).

**8. Threats to validity and limitations (≈0.5 page).** Simulated data, single machine, tuned spikes, uncalibrated sensors, dataset bias.

**9. Conclusion and future work (≈0.3 page).**

**Artifact statement.** Repository URL `[TODO]`, commit hash, seeds, scripts, how to regenerate every table (one command per table).

## B.5 Figure and table plan (paper)

| # | Type | Content |
|---|---|---|
| F1 | Diagram | Architecture and data flow |
| F2 | Diagram | Delivery state machine (ingest, pending, ack, retry, DLQ) |
| F3 | Plot | Latency CDF or box plot per input rate |
| F4 | Plot | Throughput vs consumer lag |
| F5 | Plot | Precision–recall: threshold vs z-score |
| F6 | Images | PPE examples: correct, miss, false alarm |
| T1 | Table | Related-work comparison |
| T2 | Table | Experimental environment and parameters |
| T3 | Table | Replay and fault-tolerance outcomes |
| T4 | Table | Detection metrics per method/class |

## B.6 Writing style for the paper
Third person or "we", past tense for what was done, present tense for what the system does. Define every acronym once. No marketing words ("robust", "state-of-the-art", "AI-powered") without a number. Each paragraph: claim → evidence → implication.

---

# PART C — EXPERIMENT PROTOCOLS

General rules for all experiments: fix one machine; close other heavy apps; record commit, `.env`, seed and run ID; flush test state between runs (`FLUSHDB` on a dedicated Redis DB or delete `dedup:*`, `anomaly:*`, `corr:*`, rule-state and cooldown keys); repeat each run at least 5 times (3 minimum) and report median with min–max; keep raw CSVs.

⚠ **Important replay caveat:** reading dedup keys live for 300 s. Replaying a recording within 5 minutes of the first run is rejected as duplicates unless those keys are cleared first.

## C.1 Metric definitions

- Event-level matching for alerts: a **true positive** is an alert for sensor *s* whose `details.reading_ts` falls in an injected-anomaly interval of *s* (plus a tolerance of one sampling interval). A **false negative** is an injected anomaly with no matching alert. A **false positive** is an alert with no injected anomaly. Because one anomaly may raise several alerts (several rules, cooldown expiry), count at the **event** level: one anomaly = at most one TP.
- Precision = TP/(TP+FP); Recall = TP/(TP+FN); F1 = 2PR/(P+R).
- **Detection delay** = `reading_ts` of the first alert in an anomaly − timestamp of the anomaly's first injected reading.
- **End-to-end latency** = time the consumer-visible effect appears − time the reading was created. Same machine clock, so no skew. Three cut points: reading → stream (`T1`), → alert row (`T2`), → browser event (`T3`).
- **Throughput** = accepted readings per second sustained with consumer lag not growing for ≥ 60 s. **Saturation point** = lowest rate at which lag grows monotonically.
- **Loss** = accepted publishes − distinct stored readings. **Duplicates** = stored readings with the same `(sensor_id, ts)`.
- Percentiles: p50, p95, p99 from ≥ 1000 samples.
- Detector metrics: mAP@0.5 and mAP@0.5:0.95 per class; precision and recall at the chosen confidence; per-person compliance accuracy; inference ms/frame and FPS on named CPU/GPU.
- Forecast: MAE, RMSE, MASE (Hyndman & Koehler 2006); 95 % interval empirical coverage.

## C.2 Experiments

### E1 — Functional verification
- Commands: `cd backend && source .venv/bin/activate && pytest -q`; `cd frontend && npm test`; `cd device-simulator && ../backend/.venv/bin/python -m pytest -q`.
- Record: pass/fail counts, duration, services' versions. Optional: `pytest --cov=app`.

### E2 — Alert quality on labelled sensor streams
- Run: `python scripts/mqtt_sensor_simulator.py --seed 2026 --cycles 100 --labels-out runs/sensors_seed2026.csv` (backend dir, services up, worker running). Repeat with seeds 1..5.
- Export alerts for the same window (API `/api/v1/alerts`, or SQL on `alerts`); join on `sensor_id` and `details.reading_ts` with the CSV.
- Compute per-rule and per-sensor-type metrics (C.1).
- ⚠ Expect: (a) trivially high recall for instantaneous rules because spikes are tuned above thresholds; (b) the duration rules (temperature 60 s, noise 120 s) will almost never fire, because spikes are independent per cycle (probability 0.2 each) and a non-breaching reading resets the timer. Report this as a property of the simulator, or use the `device-simulator` whose anomalies last several consecutive readings (set the sensor `interval_seconds` so that an anomaly lasts longer than the rule's duration, or lower the rule duration) `[TODO: choose and document].`
- ⚠ Cooldowns suppress repeats; one gas spike of 105 ppm raises two alerts (two rules).
- Stronger variant: add **negative** controls (noisy but in-range data, slow drifts) and **hard** cases (spikes just above/below thresholds, short bursts, sensor dropouts) so precision is not trivially 1.0.

### E3 — End-to-end latency
- Goal: distribution of reading → alert and reading → browser.
- Method: publish a controlled stream (fixed rate, e.g. 1, 10, 50, 100 msg/s) of readings guaranteed to breach a zero-duration, zero-cooldown test rule; create a dedicated rule for it. Compute `alerts.created_at − details.reading_ts` per alert. For browser latency, log `performance.now()`/`Date.now()` at `alert:new` receipt in a small Socket.IO client script and subtract `reading_ts`.
- Recommended: record `ALERT_CREATION_LATENCY_SECONDS` in the worker (one line) so Prometheus produces the histogram.
- Report p50/p95/p99 per rate. The outbox publisher polls every 0.1 s while events are flowing and every 1.0 s when idle (`outbox_publisher.py`), so expect up to about 1 s of added latency on the alert → browser leg for an isolated event; separate this contribution in the analysis.

### E4 — Throughput and saturation
- No high-rate load generator exists yet (listed as a known gap). Write a small async publisher (`aiomqtt`) that sends N sensors × R msg/s, using valid payloads with unique timestamps.
- Step the rate (50, 100, 200, 500, 1000, …) for 2–5 minutes each; sample `stream_lag_records`, CPU, memory, DB pool usage, p95 latency.
- Report the saturation rate and the bottleneck (Postgres commit, Mongo insert, Redis, Python CPU). Try 1, 2, 4 worker processes to show scaling (consumer group).

### E5 — Replay determinism (RQ1)
- Record a labelled stream (CSV with `ts`, `sensor_id`, `value`).
- Replay it through `POST /api/v1/telemetry/ingest` (or by publishing with the original timestamps) twice, on a clean state, with the same rules. Compare the sets of `(rule_id, sensor_id, reading_ts)`.
- Control experiment: a copy of the engine using arrival time (patch `now = time.time()`), replayed at two different speeds. Expect different alert sets.
- Report: identical or the number of differences.

### E6 — Fault tolerance (RQ2)
Scenarios (each with a counter of published, stored, alerted, duplicated):
1. Kill the stream worker mid-stream (`kill -9`), restart after 30 s. Expect pending messages to be reclaimed after 10 s idle and processed; zero loss.
2. Poison message: invalid payload → rejected store, not DLQ. A message that always raises → delivered 3 times then DLQ (`XPENDING`, `XLEN stream:dlq`).
3. Stop Mongo or Postgres for 20 s during load; observe retries and recovery.
4. Stop the outbox publisher; create alerts; restart; confirm every outbox row is delivered, and measure duplicates at the Socket.IO client.
5. Restart Redis (note: persistence settings determine loss; record them).
- Report: loss, duplicates, recovery time, DLQ count.

### E7 — Anomaly detector vs rules (RQ4)
- Data: `device-simulator` streams (daily cycles, drift, anomalies of known intervals) plus the MQTT simulator.
- Sweep z threshold {3, 3.5, 4, 5} and window {30, 60, 120}; baseline: fixed thresholds; also optional EWMA/MAD baselines.
- Plot precision–recall; report best F1 and delay. Show a case where z-score wins (in-range abnormal value) and one where it loses (slow drift, daily cycle).

### E8 — PPE detection (RQ5)
- Dataset: choose a public construction-PPE dataset (candidates in D.4: SHWD, CHV, Roboflow Universe construction-safety sets). Record name, size, licence, class list, split (e.g. 70/15/15 by *site/video*, not random frames, to avoid leakage).
- Training: Ultralytics YOLO (e.g. `yolov8n`/`s`), fixed seed, image size, epochs, augmentations; record the full config.
- Evaluate: mAP@0.5, mAP@0.5:0.95, per-class P/R, confusion matrix on the held-out test split.
- Decision level: run `evaluate_frame_ppe` on ground-truth boxes versus predicted boxes; compute per-person compliance accuracy and the frame-level violation detection rate; compare with a naive frame-level rule (any helmet → compliant).
- Speed: ms/frame and FPS on the target hardware at `CV_CONFIDENCE_THRESHOLD = 0.45` and the analysis rate `CV_INFERENCE_FPS`.
- Wire the weights via `CV_MODE=yolo`, `CV_MODEL_PATH=...`; confirm the log shows `yolo:<weights>` and **not** `mock`/`mock-fallback`.
- Never include mock output in this table. (Mock may be used only to test plumbing.)

### E9 — Forecast backtest
- Data: hourly roll-ups (`kpi_rollups`) from a multi-day simulator run (≥ 7 days of simulated time, otherwise seasonality is invisible).
- Rolling-origin evaluation, horizon h ∈ {1, 6, 24}. Compare OLS (as implemented) vs naive (last value) vs seasonal-naive (24 h). Report MAE/RMSE/MASE and interval coverage (target 95 %).
- Expect seasonal-naive to beat a linear trend on cyclic signals; state it plainly.

### E10 — Video security analytics
- Scenarios using clips of known events: (a) person walking in a static scene during configured secured hours, (b) lens covered (black frame), (c) blur or spray-paint simulation, (d) busy daytime scene outside secured hours (should not alert), (e) lighting change / sunset (false-positive test).
- Set `SECURITY_HOURS` to include the test time. Report detection rate per scenario, false alarms per hour, delay (frames × sampling).

### E11 — Audio analysis
- Feed WAV files with known levels (calibration tones at known dBFS) and impulse events. Verify Leq against expected dBFS + offset; calibrate `AUDIO_DB_OFFSET` against a reference sound-level meter if one is available. Report impulse detection rate and false alarms on ambient recordings.

### E12 — Usability (optional)
- 5–10 participants, 5 tasks (acknowledge an alert, find a camera, create a rule, open an incident, export a report). Record success, time, errors; administer SUS (Brooke 1996). Obtain consent; keep data anonymous.

### E13 — Security checks
- RBAC matrix: for each role, attempt each protected endpoint family; expect 401/403 as designed.
- Token revocation: logout then reuse old token.
- Rate limit: exceed limit and observe 429.
- Signed URL tampering/expiry.
- Ingest without/with wrong `X-API-Key`.
- Input validation: oversized payloads, malformed JSON, invalid URLs for cameras/audio.
- Record findings and fixes; do not publish live exploit details.

## C.3 Results templates

**Latency (E3)**

| Input rate (msg/s) | n | p50 (ms) | p95 (ms) | p99 (ms) | max (ms) |
|---:|---:|---:|---:|---:|---:|
| 1 | [TODO] | | | | |
| 10 | | | | | |
| 100 | | | | | |

**Alert quality (E2/E7)**

| Method | Sensor type | TP | FP | FN | Precision | Recall | F1 | Median delay (s) |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| Threshold rule | gas | | | | | | | |
| z-score (|z|≥4) | gas | | | | | | | |

**Fault tolerance (E6)**

| Scenario | Published | Stored | Lost | Duplicated | Recovery (s) | DLQ |
|---|---:|---:|---:|---:|---:|---:|
| Worker kill −9 | | | | | | |

**PPE detection (E8)**

| Class | Images | Instances | Precision | Recall | AP@0.5 | AP@0.5:0.95 |
|---|---:|---:|---:|---:|---:|---:|
| person / helmet / vest / no-helmet / no-vest | | | | | | |

---

# PART D — REFERENCE MATERIAL

## D.1 Figures and screenshots list (report)

1. System context diagram.
2. Layered architecture.
3. Data-flow diagram (level 0 and 1).
4. Deployment (current and target).
5. ER diagram (26 tables).
6. Sequence diagram: gas spike → alert → incident → notification → browser.
7. State diagram: incident lifecycle.
8. Delivery state machine: ingest → pending → ack / retry / DLQ.
9. Rule-engine flowchart (duration and cooldown).
10. PPE per-person assignment illustration.
11. UI screenshots (each module).
12. Result plots (latency, throughput, PR curves).

Tools: draw.io, Mermaid, PlantUML. Keep sources (`.drawio`, `.mmd`) in `research/figures/`.

## D.2 Glossary

| Term | Meaning in this project |
|---|---|
| Event time | Timestamp carried by the reading, as opposed to when it was processed |
| Consumer group | Redis Streams mechanism that shares a stream among workers and tracks pending messages |
| DLQ | Dead-letter queue (`stream:dlq`) for messages that failed 3 deliveries |
| Idempotent | Applying the same operation twice has the same effect as once |
| Transactional outbox | Writing an event row in the same DB transaction as the business change, then publishing it later |
| At-least-once | A message may be delivered more than once but not lost |
| Cooldown | Minimum time between two alerts from the same rule and sensor |
| Z-score | Distance from the mean in standard deviations |
| Leq | Equivalent continuous sound level over an interval |
| dBFS | Decibels relative to digital full scale |
| MOG2 | OpenCV Gaussian-mixture background subtractor |
| PPE | Personal protective equipment (helmet, high-visibility vest, …) |
| mAP | Mean average precision (object detection metric) |
| MTTR | Mean time to resolve (incidents) |
| RBAC | Role-based access control |
| BFF | Backend-for-frontend (Next.js proxy that holds the tokens) |
| FTS | Full-text search (PostgreSQL `tsvector` + GIN) |
| KPI roll-up | Pre-aggregated 1-minute site metrics |

## D.3 Frequently asked viva questions (with honest answers)

1. **Is the PPE detection real?** By default no: it is a mock that exercises the pipeline. With `CV_MODE=yolo` and PPE-trained weights it runs a real model; its accuracy is whatever E8 reports.
2. **Is the data real?** Sensor and video feeds are simulated or stock footage. The pipeline is real; the field validity is future work.
3. **Why three databases?** Different access patterns: transactions and joins (PostgreSQL), high-rate time series (MongoDB), hot state and streams (Redis). The cost is consistency across stores, handled by the outbox and idempotent writes.
4. **Why Redis Streams and not Kafka?** Simplicity and one fewer system for a single-site deployment; Kafka would give retention, partitioning and replay at larger scale.
5. **What happens if the worker crashes?** Unacknowledged messages stay pending, are reclaimed after 10 s idle and retried up to 3 times, then dead-lettered. Raw inserts are idempotent.
6. **Why event time?** So replaying recorded data reproduces alerts, and silence from an offline sensor is not treated as a sustained breach. It assumes device clocks are trustworthy within a 5-minute future tolerance.
7. **How do you avoid alert storms?** Per-rule cooldowns, per-camera PPE cooldowns, anomaly/correlation cooldowns, duplicate-reading guard.
8. **Is the forecast machine learning?** No. It is a linear regression with a prediction interval. It is a baseline.
9. **Is the risk score validated?** No; it is a weighted heuristic and should be read as an ordinal indicator.
10. **What about privacy?** Recordings are local with 24 h retention by default; real deployments need consent, anonymisation and a retention policy.
11. **How would it scale?** More worker processes in the consumer group; partition by site; move to Kafka/Timescale if rates exceed a single Redis; run the roles in containers.
12. **What is the security model?** JWT with revocation, bcrypt, RBAC, signed URLs, rate limiting; gaps are MQTT auth/TLS and secrets management.
13. **What would you do next?** See A.9 — train/evaluate PPE model, load tests, CI/E2E tests, field pilot.

## D.4 Candidate references (written from memory — verify every entry before citing)

Vision and safety
- Redmon, J., Divvala, S., Girshick, R., Farhadi, A. (2016). *You Only Look Once: Unified, Real-Time Object Detection.* CVPR.
- Jocher, G. et al. *Ultralytics YOLO* (software). github.com/ultralytics/ultralytics.
- Fang, Q. et al. (2018). *Detecting non-hardhat-use by a deep learning method from far-field surveillance videos.* Automation in Construction, 85.
- Nath, N. D., Behzadan, A. H., Paal, S. G. (2020). *Deep learning for site safety: Real-time detection of personal protective equipment.* Automation in Construction, 112.
- Zivkovic, Z. (2004). *Improved adaptive Gaussian mixture model for background subtraction.* ICPR. (basis of MOG2)

Streams, reliability, data
- Kleppmann, M. (2017). *Designing Data-Intensive Applications.* O'Reilly.
- Richardson, C. (2018). *Microservices Patterns.* Manning. (transactional outbox)
- Akidau, T. et al. (2015). *The Dataflow Model.* PVLDB 8(12). (event time vs processing time)
- OASIS (2019). *MQTT Version 5.0*; ISO/IEC 20922 (MQTT 3.1.1).
- Redis documentation: Streams, consumer groups, `XAUTOCLAIM`.

Statistics and forecasting
- Chandola, V., Banerjee, A., Kumar, V. (2009). *Anomaly detection: A survey.* ACM Computing Surveys 41(3).
- Hyndman, R. J., Athanasopoulos, G. (2021). *Forecasting: Principles and Practice* (3rd ed.). OTexts.
- Hyndman, R. J., Koehler, A. B. (2006). *Another look at measures of forecast accuracy.* International Journal of Forecasting 22(4).

Security and usability
- Jones, M., Bradley, J., Sakimura, N. (2015). *JSON Web Token (JWT).* RFC 7519.
- Provos, N., Mazières, D. (1999). *A Future-Adaptable Password Scheme.* USENIX (bcrypt).
- Brooke, J. (1996). *SUS: A quick and dirty usability scale.*

Datasets to evaluate (check licence and exact names)
- SHWD (Safety Helmet Wearing Dataset); CHV (colour helmet and vest dataset); construction-safety / PPE datasets on Roboflow Universe; the `CLASS_ALIASES` map in `ppe_rules.py` already handles `hardhat`, `no-hardhat`, `safety vest`, and `head` naming.

Safety statistics: ILO, OSHA (US) or your national authority, `[TODO: choose, with year]`.

## D.5 Slide outline for the final presentation (15 minutes)

1. Title and team (0.5 min). 2. Problem and impact (1). 3. Objectives (0.5). 4. Architecture (2). 5. Key mechanisms: event-time rules, per-person PPE, outbox (2.5). 6. Live demo: simulator → gas spike → alert → incident → notification (3). 7. Evaluation results (3). 8. Limitations and honesty slide: mock CV, simulated data (1). 9. Future work (0.5). 10. Conclusion and Q&A (1).

Demo checklist: services running (`./start.sh --with-sim` or the device simulator), mocks **off**, one clean browser profile, backup screen recording in case of failure, known credentials ready (do not show them on a public slide).

## D.6 Final consistency checks

- Names of components, tables and keys match the code.
- All numbers match the run IDs in `research/evidence/`.
- Test totals re-run on the final commit.
- Each `[TODO]` removed or turned into "not evaluated" with a reason.
- Mock vs real is labelled wherever CV appears.
- Citations verified and formatted consistently.
