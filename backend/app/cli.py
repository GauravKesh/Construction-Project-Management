import argparse
import asyncio
import logging
import signal
import sys
from alembic import command
from alembic.config import Config
import uvicorn
from app.core.config import settings
from app.core.logging import setup_logging
from app.core.wait_for import wait_for_all_dependencies
from app.db.mongo import close_mongo_client, init_mongo
from app.db.postgres import AsyncSessionLocal, engine
from app.db.redis import close_redis_client, init_redis_streams
from app.storage import get_storage

logger = logging.getLogger("app.cli")


def _setup_signal_handlers(shutdown_event: asyncio.Event):
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        try:
            loop.add_signal_handler(sig, lambda: shutdown_event.set())
        except (NotImplementedError, RuntimeError):
            # In Windows or certain thread contexts signal handlers may differ
            pass


async def run_api():
    setup_logging(settings.LOG_LEVEL)
    logger.info(f"Starting API server on {settings.HOST}:{settings.PORT}...")
    config = uvicorn.Config(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        log_level=settings.LOG_LEVEL.lower(),
        forwarded_allow_ips=settings.FORWARDED_ALLOW_IPS,
        reload=settings.DEBUG,
        workers=1 if settings.DEBUG else settings.WORKERS,
    )
    server = uvicorn.Server(config)
    await server.serve()


async def run_worker():
    setup_logging(settings.LOG_LEVEL)
    logger.info("Starting background processing worker (stream consumers, rule engine, outbox, scheduler)...")

    await wait_for_all_dependencies(timeout=30.0, check_all_external=False)
    await init_redis_streams()

    from app.realtime.outbox_publisher import outbox_publisher
    from app.workers.scheduler import scheduler_service
    from app.workers.stream_worker import stream_worker

    shutdown_event = asyncio.Event()
    _setup_signal_handlers(shutdown_event)

    # Start services
    stream_task = asyncio.create_task(stream_worker.start())
    outbox_task = asyncio.create_task(outbox_publisher.start())
    scheduler_service.start()

    logger.info("Background worker is fully operational and waiting for tasks.")
    await shutdown_event.wait()

    logger.info("Shutdown signal received. Stopping worker services gracefully...")
    scheduler_service.shutdown()
    stream_worker.stop()
    outbox_publisher.stop()

    stream_task.cancel()
    outbox_task.cancel()

    await close_mongo_client()
    await close_redis_client()
    await engine.dispose()
    logger.info("Background worker stopped.")


async def run_mqtt_consumer():
    setup_logging(settings.LOG_LEVEL)
    logger.info("Starting dedicated MQTT ingestion consumer...")

    await wait_for_all_dependencies(timeout=30.0, check_all_external=True)
    await init_redis_streams()

    from app.ingestion.mqtt_consumer import mqtt_consumer

    shutdown_event = asyncio.Event()
    _setup_signal_handlers(shutdown_event)

    consumer_task = asyncio.create_task(mqtt_consumer.start())

    logger.info("MQTT consumer operational and listening on broker.")
    await shutdown_event.wait()

    logger.info("Stopping MQTT consumer...")
    mqtt_consumer.stop()
    consumer_task.cancel()

    await close_redis_client()
    logger.info("MQTT consumer shutdown complete.")


async def run_video_handler():
    setup_logging(settings.LOG_LEVEL)
    logger.info("Starting Video Stream Handler & CV Inference worker...")

    await wait_for_all_dependencies(timeout=30.0, check_all_external=False)

    from sqlalchemy import select
    from app.db.models.camera import Camera
    from app.db.models.sensor import Sensor
    from app.ingestion.audio_analyzer import AudioSpec, audio_manager, validate_audio_url
    from app.ingestion.sensor_sources import SensorSourceSpec, sensor_source_manager, validate_source_url
    from app.ingestion.video_stream_handler import CameraSpec, stream_manager

    shutdown_event = asyncio.Event()
    _setup_signal_handlers(shutdown_event)

    async def load_camera_specs():
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(Camera).where(
                    Camera.status.in_(["active", "streaming"]),
                    Camera.is_cv_enabled.is_(True),
                    Camera.deleted_at.is_(None),
                )
            )
            return [
                CameraSpec(
                    camera_id=str(cam.id),
                    site_id=str(cam.site_id),
                    stream_url=cam.stream_url,
                    # Camera.fps can hold the source's native rate; never infer faster than the global cap
                    fps=min(cam.fps or settings.CV_INFERENCE_FPS, settings.CV_INFERENCE_FPS),
                    zone_id=str(cam.zone_id) if cam.zone_id else None,
                )
                for cam in result.scalars().all()
            ]

    async def load_audio_specs():
        """Cameras with an audio stream; each gets an auto-created `noise` sensor for its readings."""
        if not settings.AUDIO_ANALYSIS_ENABLED:
            return []
        specs = []
        async with AsyncSessionLocal() as session:
            cameras = (
                await session.execute(
                    select(Camera).where(
                        Camera.audio_url.is_not(None),
                        Camera.status.in_(["active", "streaming"]),
                        Camera.deleted_at.is_(None),
                    )
                )
            ).scalars().all()
            for cam in cameras:
                if validate_audio_url(cam.audio_url):
                    continue
                code = f"AUDIO-{cam.camera_code}"[:64]
                sensor = (await session.execute(select(Sensor).where(Sensor.sensor_code == code))).scalar_one_or_none()
                if sensor is None:
                    sensor = Sensor(
                        site_id=cam.site_id,
                        zone_id=cam.zone_id,
                        sensor_code=code,
                        name=f"Audio level ({cam.name})",
                        sensor_type="noise",
                        unit="dB",
                        location_geojson=cam.location_geojson,
                        status="active",
                    )
                    session.add(sensor)
                    await session.flush()
                    logger.info(f"Created audio sensor {code} for camera {cam.camera_code}")
                elif sensor.deleted_at is not None:
                    sensor.deleted_at = None
                specs.append(AudioSpec(
                    camera_id=str(cam.id),
                    site_id=str(cam.site_id),
                    zone_id=str(cam.zone_id) if cam.zone_id else None,
                    audio_url=cam.audio_url,
                    sensor_id=str(sensor.id),
                ))
            await session.commit()
        return specs

    async def load_sensor_specs():
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(Sensor).where(
                    Sensor.source_url.is_not(None),
                    Sensor.status == "active",
                    Sensor.deleted_at.is_(None),
                )
            )
            return [
                SensorSourceSpec(
                    sensor_id=str(s.id),
                    site_id=str(s.site_id),
                    sensor_type=s.sensor_type.lower(),
                    unit=s.unit,
                    zone_id=str(s.zone_id) if s.zone_id else None,
                    source_url=s.source_url,
                )
                for s in result.scalars().all()
                if not validate_source_url(s.source_url)
            ]

    async def sync_loop():
        # Re-read the device registry so cameras and pull-based sensors added, edited,
        # started or stopped through the API are picked up without a restart.
        while not shutdown_event.is_set():
            try:
                await stream_manager.sync(await load_camera_specs())
            except Exception as e:
                logger.error(f"Camera registry sync failed: {e}", exc_info=True)
            try:
                await sensor_source_manager.sync(await load_sensor_specs())
            except Exception as e:
                logger.error(f"Sensor source sync failed: {e}", exc_info=True)
            try:
                await audio_manager.sync(await load_audio_specs())
            except Exception as e:
                logger.error(f"Audio analysis sync failed: {e}", exc_info=True)
            try:
                await asyncio.wait_for(shutdown_event.wait(), timeout=settings.CAMERA_SYNC_SECONDS)
            except asyncio.TimeoutError:
                pass

    logger.info(f"Device connector running: cameras + pull-based sensors (registry sync every {settings.CAMERA_SYNC_SECONDS}s).")
    await sync_loop()

    logger.info("Stopping all device workers...")
    await sensor_source_manager.stop_all()
    await audio_manager.stop_all()
    for cam_id in list(stream_manager._workers.keys()):
        await stream_manager.stop_camera(cam_id)

    await close_mongo_client()
    await close_redis_client()
    await engine.dispose()
    logger.info("Video stream handler stopped.")


async def run_migrate():
    setup_logging(settings.LOG_LEVEL)
    logger.info("Running idempotent migrations and infrastructure initialization...")

    await wait_for_all_dependencies(timeout=30.0, check_all_external=False)

    # 1. Alembic migrations
    logger.info("Applying PostgreSQL schema migrations via Alembic...")
    alembic_cfg = Config("alembic.ini")
    await asyncio.to_thread(command.upgrade, alembic_cfg, "head")
    logger.info("PostgreSQL schema up to date.")

    # 2. Mongo collections & indexes
    logger.info("Initializing MongoDB collections and time-series indexes...")
    await init_mongo()
    logger.info("MongoDB initialized.")

    # 3. Redis streams and consumer groups
    logger.info("Initializing Redis streams and consumer groups...")
    await init_redis_streams()
    logger.info("Redis streams initialized.")

    # 4. Storage buckets/directories
    logger.info(f"Initializing object storage ({settings.STORAGE_BACKEND})...")
    storage = get_storage()
    await storage.init_storage()
    logger.info("Object storage initialized.")

    await close_mongo_client()
    await close_redis_client()
    await engine.dispose()
    logger.info("All migrations and initializations finished successfully!")


async def run_seed():
    setup_logging(settings.LOG_LEVEL)
    logger.info("Running database seed...")
    await wait_for_all_dependencies(timeout=30.0, check_all_external=False)

    from scripts.seed import seed_data
    await seed_data()

    await close_mongo_client()
    await close_redis_client()
    await engine.dispose()
    logger.info("Database seeding finished successfully!")


def main():
    parser = argparse.ArgumentParser(
        description="Dashboard for Real-Time Monitoring of Construction Projects - Service Runner",
        prog="python -m app.cli",
    )
    parser.add_argument(
        "role",
        choices=["api", "worker", "mqtt-consumer", "video-handler", "device-connector", "migrate", "seed"],
        help="Process role to start",
    )

    args = parser.parse_args()

    role_runners = {
        "api": run_api,
        "worker": run_worker,
        "mqtt-consumer": run_mqtt_consumer,
        "video-handler": run_video_handler,
        # Same process: pulls camera feeds and sensor endpoints
        "device-connector": run_video_handler,
        "migrate": run_migrate,
        "seed": run_seed,
    }

    runner = role_runners[args.role]
    try:
        asyncio.run(runner())
    except KeyboardInterrupt:
        logger.info("Process interrupted by user.")
        sys.exit(0)
    except Exception as e:
        logger.error(f"Fatal error in role '{args.role}': {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
