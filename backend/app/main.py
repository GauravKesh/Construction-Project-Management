import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import socketio
from app.api.v1.health import router as health_router
from app.api.v1.router import api_v1_router
from app.core.config import settings
from app.core.logging import setup_logging
from app.core.wait_for import wait_for_all_dependencies
from app.db.mongo import close_mongo_client, init_mongo
from app.db.postgres import engine
from app.db.redis import close_redis_client, init_redis_streams
from app.gateway.middleware import (
    JSONLoggingMiddleware,
    RateLimitingMiddleware,
    RequestIDMiddleware,
    setup_exception_handlers,
)
from app.realtime.outbox_publisher import outbox_publisher
from app.realtime.socketio_server import sio
from app.storage import get_storage
from app.workers.scheduler import scheduler_service

logger = logging.getLogger("app.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup sequence
    setup_logging(settings.LOG_LEVEL)
    logger.info(f"Initializing {settings.APP_NAME} in '{settings.APP_ENV}' environment...")

    # Wait for core dependencies with exponential backoff
    try:
        await wait_for_all_dependencies(timeout=10.0, check_all_external=False)
    except Exception as e:
        logger.warning(f"Startup dependency wait encountered non-fatal warning: {e}")

    # Idempotent storage initialization
    storage = get_storage()
    await storage.init_storage()

    # Idempotent MongoDB initialization
    try:
        await init_mongo()
    except Exception as e:
        logger.warning(f"Mongo initialization deferred or warning: {e}")

    # Idempotent Redis streams initialization
    try:
        await init_redis_streams()
    except Exception as e:
        logger.warning(f"Redis stream initialization deferred or warning: {e}")

    # Start outbox publisher loop
    outbox_task = asyncio.create_task(outbox_publisher.start())

    # Start background scheduler for rollups and alert escalation
    scheduler_service.start()

    # Optional embedded workers for simple laptop development
    embedded_tasks = []
    if settings.RUN_EMBEDDED_WORKERS:
        logger.info("RUN_EMBEDDED_WORKERS=true: starting embedded MQTT consumer and Stream worker...")
        from app.ingestion.mqtt_consumer import mqtt_consumer
        from app.workers.stream_worker import stream_worker
        embedded_tasks.append(asyncio.create_task(mqtt_consumer.start()))
        embedded_tasks.append(asyncio.create_task(stream_worker.start()))

    logger.info("Application startup completed successfully.")
    yield

    # Shutdown sequence
    logger.info("Initiating graceful shutdown...")
    scheduler_service.shutdown()
    outbox_publisher.stop()
    outbox_task.cancel()

    for t in embedded_tasks:
        t.cancel()

    await close_mongo_client()
    await close_redis_client()
    await engine.dispose()
    logger.info("Graceful shutdown completed.")


def create_application() -> FastAPI:
    fastapi_app = FastAPI(
        title=settings.APP_NAME,
        description="Production Backend API for Real-Time Monitoring of Construction Projects",
        version="1.0.0",
        root_path=settings.ROOT_PATH or "",
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
    )

    # Middlewares (order matters: executed from bottom to top on request)
    fastapi_app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    fastapi_app.add_middleware(RateLimitingMiddleware)
    fastapi_app.add_middleware(JSONLoggingMiddleware)
    fastapi_app.add_middleware(RequestIDMiddleware)

    # Standardized Exception Handlers
    setup_exception_handlers(fastapi_app)

    # Mount API routes
    fastapi_app.include_router(health_router)
    fastapi_app.include_router(api_v1_router)

    # Mount ASGI Socket.IO app
    asgi_app = socketio.ASGIApp(
        socketio_server=sio,
        other_asgi_app=fastapi_app,
        socketio_path="socket.io",
    )

    return asgi_app


app = create_application()
