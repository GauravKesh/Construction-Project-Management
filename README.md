# BuildTrack — Real-Time IoT & Computer Vision Construction Monitoring Platform

A production-grade, event-driven backend platform for real-time monitoring and management of large-scale construction projects. Incorporates environmental sensor telemetry (MQTT), real-time CCTV computer vision PPE violation detection (OpenCV / YOLOv8), transactional outbox streaming, and interactive WebSocket communication (`/live`).

---

## 1. System Architecture & Capabilities

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
                      │  - Bound Validation             │
                      │  - Rule Engine (Sliding Window) │
                      │  - MongoDB Time-Series Persist  │
                      │  - Outbox Events                │
                      ▼                                 │
     ┌────────────────────────────────────┐             │
     │       Data & Persistence Tier      │             │
     │  - PostgreSQL 16 (Relational Core) ◄─────────────┤
     │  - MongoDB 7 (Time-Series & Logs)  │             │
     │  - Redis 7 (Cache, Dedup, Streams) │             │
     │  - Local / S3 Hybrid Object Store  │             │
     └────────────────┬───────────────────┘             │
                      │                                 │
                      ▼                                 ▼
         [Transactional Outbox Publisher] ────► [Socket.IO Server]
                      │                                 ▲
                      ▼                                 │
         [Notification Service] ────────────────────────┘
```

- **Relational Core**: PostgreSQL 16 (27 tables, Alembic migrations, FTS GIN triggers, Shapely GIS zones).
- **Time-Series & Logs**: MongoDB 7 (`sensor_readings`, `sensor_latest`, `cv_detections`, `rejected_messages`).
- **Real-Time & Caching**: Redis 7 (`stream:sensor_readings`, `stream:dlq`, deduplication locks, token blacklist).
- **Ingestion**: Mosquitto MQTT 2.1 broker + OpenCV RTSP camera stream frame processing.
- **Computer Vision**: PPE detection (Hard Hat, Safety Vest, Gloves, Boots, Goggles) with violation snapshots.
- **Storage Strategy**: Local storage (`./data/storage`) in development; automatic S3/MinIO in production.
- **Docker-Ready**: 100% 12-factor configuration; ready for instant containerization (`backend/docs/DOCKER_LATER.md`).

---

## 2. Audit Reports

Detailed audit documentation has been generated in the `audit/` folder:

- 📊 **[Test Execution Audit Report](file:///Users/gaurav/Downloads/Construction-Project-Management/audit/auditreport_Test.md)**: Details all 32 automated tests executed, coverage by subsystem, and remaining future testing items.
- 🏗️ **[Feature & Architecture Completion Report](file:///Users/gaurav/Downloads/Construction-Project-Management/audit/report.md)**: Complete breakdown of completed features across all 6 architectural layers.

---

## 3. Test Suite Status

```text
============================== 32 passed in 2.12s ==============================
Status: ALL 32 TESTS PASSING (100% Pass Rate)
```

To run the automated test suite locally:
```bash
cd backend
source .venv/bin/activate
pytest -v
```

---

## 4. Quick Start (Development)

### 4.1. Prerequisites
Ensure the backing services are running locally on their default ports:
- PostgreSQL 16 on `localhost:5432` (`construction_db`)
- MongoDB 7 on `localhost:27017` (`construction_mongo`)
- Redis 7 on `localhost:6379`
- Mosquitto MQTT on `localhost:1883`

### 4.2. Database Migration & Seeding
```bash
cd backend
source .venv/bin/activate
python -m app.cli migrate
python -m app.cli seed
```

### 4.3. Launch All Services (One Command)
Run the consolidated dev supervisor script to launch the API, Stream Worker, MQTT Consumer, Video Handler, and Simulators simultaneously:
```bash
cd backend
./scripts/dev_run_all.sh
```

### 4.4. Demo Credentials
| Role | Email | Password |
|---|---|---|
| **Admin** | `admin@buildtrack.com` | `Admin@123456` |
| **Safety Officer** | `safety@buildtrack.com` | `Safety@123456` |
| **Project Manager** | `pm@buildtrack.com` | `Manager@123456` |

---

## 5. API & WebSocket Documentation
- **Swagger UI**: `http://localhost:8000/docs`
- **ReDoc**: `http://localhost:8000/redoc`
- **OpenAPI Schema**: `http://localhost:8000/openapi.json` (Exported at `backend/docs/openapi.json`)
- **Real-Time WebSocket**: `ws://localhost:8000/socket.io/?EIO=4&transport=websocket` (`/live` namespace)
- **Prometheus Metrics**: `http://localhost:8000/metrics`
- **Health Checks**: `http://localhost:8000/health/live` & `http://localhost:8000/health/ready`

---

## 6. Next Milestone: Frontend Application

The backend is fully operational with complete REST APIs and Socket.IO real-time channels ready for frontend consumption. The Next.js frontend will be built in the `frontend/` directory.
# Construction-Project-Management
