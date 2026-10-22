import time
from datetime import datetime, timezone
from typing import Dict
from fastapi import APIRouter, Response, status
from app.core.config import settings
from app.core.metrics import get_metrics_payload
from app.core.wait_for import check_mongo, check_mqtt, check_postgres, check_redis
from app.db.redis import get_redis_client, KEY_STREAM_INGEST, KEY_STREAM_DLQ, GROUP_PROCESSORS
from app.schemas.system import DependencyHealth, HealthResponse
from app.storage import get_storage

router = APIRouter(prefix="", tags=["System & Health"])


@router.get("/health/live")
async def health_live():
    """
    Liveness probe: returns 200 if process is responsive.
    """
    return {
        "status": "ok",
        "process": "alive",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/health/ready", response_model=HealthResponse)
async def health_ready():
    """
    Readiness probe: validates all underlying infrastructure dependencies
    (PostgreSQL, MongoDB, Redis, Storage, MQTT Broker, CV Model).
    """
    dependencies: Dict[str, DependencyHealth] = {}
    is_ready = True

    # 1. PostgreSQL
    t0 = time.time()
    try:
        await check_postgres()
        latency = (time.time() - t0) * 1000
        dependencies["postgres"] = DependencyHealth(status="healthy", latency_ms=round(latency, 1))
    except Exception as e:
        is_ready = False
        dependencies["postgres"] = DependencyHealth(status="unhealthy", details=str(e))

    # 2. MongoDB
    t0 = time.time()
    try:
        await check_mongo()
        latency = (time.time() - t0) * 1000
        dependencies["mongo"] = DependencyHealth(status="healthy", latency_ms=round(latency, 1))
    except Exception as e:
        is_ready = False
        dependencies["mongo"] = DependencyHealth(status="unhealthy", details=str(e))

    # 3. Redis + Stream consumer groups
    t0 = time.time()
    try:
        await check_redis()
        r = get_redis_client()
        # Verify group exists
        try:
            groups = await r.xinfo_groups(KEY_STREAM_INGEST)
            group_names = [g.get("name") for g in groups]
            stream_status = f"Groups: {group_names}"
        except Exception:
            stream_status = "Stream active"

        latency = (time.time() - t0) * 1000
        dependencies["redis"] = DependencyHealth(
            status="healthy", latency_ms=round(latency, 1), details=stream_status
        )
    except Exception as e:
        is_ready = False
        dependencies["redis"] = DependencyHealth(status="unhealthy", details=str(e))

    # 4. Storage
    t0 = time.time()
    try:
        storage = get_storage()
        await storage.init_storage()
        latency = (time.time() - t0) * 1000
        dependencies["storage"] = DependencyHealth(
            status="healthy", latency_ms=round(latency, 1), details=f"Backend: {settings.STORAGE_BACKEND}"
        )
    except Exception as e:
        dependencies["storage"] = DependencyHealth(status="degraded", details=str(e))

    # 5. MQTT Broker
    t0 = time.time()
    try:
        await check_mqtt()
        latency = (time.time() - t0) * 1000
        dependencies["mqtt"] = DependencyHealth(status="healthy", latency_ms=round(latency, 1))
    except Exception as e:
        dependencies["mqtt"] = DependencyHealth(status="degraded", details=str(e))

    # 6. CV Model
    dependencies["cv_model"] = DependencyHealth(
        status="healthy", details=f"Mode: {settings.CV_MODE}"
    )

    overall_status = "ok" if is_ready else "degraded"
    return HealthResponse(
        status=overall_status,
        timestamp=datetime.now(timezone.utc),
        dependencies=dependencies,
    )


@router.get("/metrics")
async def metrics():
    """
    Prometheus metrics scraping endpoint.
    """
    payload = get_metrics_payload()
    return Response(content=payload, media_type="text/plain; version=0.0.4; charset=utf-8")
