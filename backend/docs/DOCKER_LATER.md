# Docker Deployment Blueprint (Future Reference)

> **Note:** As specified in architectural requirements, Docker is not currently used for local development, but the entire backend was designed to be 100% "Docker-Ready". When containerizing in the future, **zero code changes** are required.

---

## 1. Multi-Stage Dockerfile (For Python Backend)

```dockerfile
# Stage 1: Builder
FROM python:3.12-slim AS builder

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    libgl1 \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# Stage 2: Final Minimal Runtime
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    libgl1 \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /root/.local /root/.local
COPY . /app

ENV PATH=/root/.local/bin:$PATH
ENV PYTHONUNBUFFERED=1
ENV APP_ENV=production

EXPOSE 8000

# Entrypoint delegates to app.cli roles
ENTRYPOINT ["python", "-m", "app.cli"]
CMD ["api"]
```

---

## 2. Production Docker Compose Specification (`docker-compose.yml`)

```yaml
version: "3.9"

services:
  # PostgreSQL 16 Relational Core
  postgres:
    image: postgres:16-alpine
    container_name: construction_postgres
    restart: always
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-construction_user}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-construction_secure_pass_2026}
      POSTGRES_DB: ${POSTGRES_DB:-construction_db}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U construction_user -d construction_db"]
      interval: 10s
      timeout: 5s
      retries: 5

  # MongoDB 7 Time-Series & High-Frequency CV Detections
  mongodb:
    image: mongo:7.0
    container_name: construction_mongo
    restart: always
    environment:
      MONGO_INITDB_DATABASE: ${MONGO_DB:-construction_mongo}
    volumes:
      - mongo_data:/data/db
    ports:
      - "27017:27017"
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Redis 7 Ingestion Streams, Caching & Cooldown Locks
  redis:
    image: redis:7-alpine
    container_name: construction_redis
    restart: always
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  # Eclipse Mosquitto 2.1 MQTT Broker
  mosquitto:
    image: eclipse-mosquitto:2.1
    container_name: construction_mqtt
    restart: always
    volumes:
      - ./config/mosquitto.conf:/mosquitto/config/mosquitto.conf
      - mosquitto_data:/mosquitto/data
    ports:
      - "1883:1883"

  # Backend Role 1: FastAPI REST Gateway & Socket.IO (/live)
  api:
    build: .
    command: ["api"]
    restart: always
    env_file: .env
    ports:
      - "8000:8000"
    depends_on:
      postgres:
        condition: service_healthy
      mongodb:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - storage_data:/app/data/storage

  # Backend Role 2: Redis Stream Ingestion & 1-Minute KPI Rollup Worker
  stream-worker:
    build: .
    command: ["worker"]
    restart: always
    env_file: .env
    depends_on:
      postgres:
        condition: service_healthy
      mongodb:
        condition: service_healthy
      redis:
        condition: service_healthy

  # Backend Role 3: MQTT Ingestion Consumer
  mqtt-consumer:
    build: .
    command: ["mqtt-consumer"]
    restart: always
    env_file: .env
    depends_on:
      mosquitto:
        condition: service_started
      redis:
        condition: service_healthy

  # Backend Role 4: Video Stream & CV Processor
  video-handler:
    build: .
    command: ["video-handler"]
    restart: always
    env_file: .env
    depends_on:
      postgres:
        condition: service_healthy
      mongodb:
        condition: service_healthy
    volumes:
      - storage_data:/app/data/storage

volumes:
  postgres_data:
  mongo_data:
  redis_data:
  mosquitto_data:
  storage_data:
```

---

## 3. Zero-Code-Change Environment Variable Mapping

Every service automatically honors environment variables configured via `pydantic-settings`:

| Service Variable | Local Dev Default | Containerized Target |
|---|---|---|
| `POSTGRES_SERVER` | `localhost` | `postgres` |
| `POSTGRES_PORT` | `5432` | `5432` |
| `MONGO_HOST` | `localhost` | `mongodb` |
| `MONGO_PORT` | `27017` | `27017` |
| `REDIS_HOST` | `localhost` | `redis` |
| `REDIS_PORT` | `6379` | `6379` |
| `MQTT_BROKER_HOST` | `localhost` | `mosquitto` |
| `MQTT_BROKER_PORT` | `1883` | `1883` |
| `STORAGE_BACKEND` | `local` | `local` or `s3` |
| `LOCAL_STORAGE_DIR` | `./data/storage` | `/app/data/storage` |
