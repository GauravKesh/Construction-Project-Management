# BuildTrack Backend

Production-ready, event-driven backend service for real-time monitoring of construction projects.

## Architecture Highlights
- **FastAPI + Asyncpg**: High-performance asynchronous REST API gateway and WebSocket server.
- **PostgreSQL 16**: 27 relational tables, Alembic migrations, FTS GIN triggers, Shapely GIS polygon zones.
- **MongoDB 7**: Time-series collection (`sensor_readings`), projection caching (`sensor_latest`), CV frame logs.
- **Redis 7**: High-throughput ingestion stream, dead-letter queue (DLQ), deduplication locks, token blacklist.
- **Mosquitto MQTT**: Subscribes to multi-type environmental sensor streams.
- **Computer Vision**: OpenCV + YOLOv8 PPE detection with automatic local/S3 violation snapshot storage.
- **Transactional Outbox**: Guaranteed at-least-once message delivery to Socket.IO (`/live`) and notification engine.

## 🚀 1-Command Server Startup
To start all required services (API, Stream Worker, MQTT Consumer, Video Handler, Migrations) in 1 command:
```bash
./scripts/dev_run_all.sh
# Or from root workspace:
./start.sh
```

## Individual CLI Roles
```bash
python -m app.cli api            # Start REST API & Socket.IO server
python -m app.cli worker         # Start Redis stream worker & 1m KPI rollup scheduler
python -m app.cli mqtt-consumer  # Start MQTT ingestion subscriber
python -m app.cli video-handler  # Start RTSP / Video CV processor
python -m app.cli migrate        # Run Alembic migrations
python -m app.cli seed           # Seed demo project, site, sensors, and users
```

## Running Tests
```bash
source .venv/bin/activate
pytest -v
```

Audit reports are available in `../audit/auditreport_Test.md` and `../audit/report.md`.
Docker deployment specifications are in `docs/DOCKER_LATER.md`.
OpenAPI 3.1 specification is in `docs/openapi.json`.
