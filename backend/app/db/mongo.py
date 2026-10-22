import logging
from typing import Optional
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
import pymongo
from app.core.config import settings

logger = logging.getLogger(__name__)

_mongo_client: Optional[AsyncIOMotorClient] = None


def get_mongo_client() -> AsyncIOMotorClient:
    global _mongo_client
    if _mongo_client is None:
        _mongo_client = AsyncIOMotorClient(
            settings.MONGO_URI,
            maxPoolSize=settings.MONGO_MAX_POOL_SIZE,
            minPoolSize=settings.MONGO_MIN_POOL_SIZE,
        )
    return _mongo_client


def get_mongo_db() -> AsyncIOMotorDatabase:
    client = get_mongo_client()
    return client[settings.MONGO_DB]


async def close_mongo_client() -> None:
    global _mongo_client
    if _mongo_client is not None:
        _mongo_client.close()
        _mongo_client = None


async def init_mongo() -> None:
    """
    Idempotent initialization of Mongo collections, time-series, and indexes.
    Safe to run repeatedly on startup or migration.
    """
    db = get_mongo_db()
    existing_collections = await db.list_collection_names()

    # 1. sensor_readings: Time-series collection
    if "sensor_readings" not in existing_collections:
        try:
            await db.create_collection(
                "sensor_readings",
                timeseries={
                    "timeField": "ts",
                    "metaField": "meta",
                    "granularity": "seconds",
                },
                expireAfterSeconds=90 * 86400,  # 90 days retention
            )
            logger.info("Created native time-series collection 'sensor_readings'")
        except Exception as e:
            logger.warning(f"Native time-series collection creation fallback: {e}")
            if "sensor_readings" not in await db.list_collection_names():
                await db.create_collection("sensor_readings")

    # Indexes on sensor_readings
    await db.sensor_readings.create_index([("meta.site_id", pymongo.ASCENDING), ("ts", pymongo.DESCENDING)])
    await db.sensor_readings.create_index([("meta.sensor_id", pymongo.ASCENDING), ("ts", pymongo.DESCENDING)])
    await db.sensor_readings.create_index([("meta.type", pymongo.ASCENDING), ("ts", pymongo.DESCENDING)])

    # 2. sensor_latest: single document per sensor for fast lookups
    await db.sensor_latest.create_index([("sensor_id", pymongo.ASCENDING)], unique=True)
    await db.sensor_latest.create_index([("site_id", pymongo.ASCENDING)])

    # 3. cv_detections
    await db.cv_detections.create_index([("site_id", pymongo.ASCENDING), ("ts", pymongo.DESCENDING)])
    await db.cv_detections.create_index([("camera_id", pymongo.ASCENDING), ("ts", pymongo.DESCENDING)])
    await db.cv_detections.create_index([("compliant", pymongo.ASCENDING)])
    # 30 days retention for CV detections
    await db.cv_detections.create_index([("ts", pymongo.ASCENDING)], expireAfterSeconds=30 * 86400)

    # 4. rejected_messages (14 days TTL)
    await db.rejected_messages.create_index([("ts", pymongo.ASCENDING)], expireAfterSeconds=14 * 86400)
    await db.rejected_messages.create_index([("sensor_id", pymongo.ASCENDING)])

    # 5. camera_frames_meta
    await db.camera_frames_meta.create_index([("camera_id", pymongo.ASCENDING), ("ts", pymongo.DESCENDING)])

    # 6. event_log
    await db.event_log.create_index([("site_id", pymongo.ASCENDING), ("ts", pymongo.DESCENDING)])
    await db.event_log.create_index([("event_type", pymongo.ASCENDING), ("ts", pymongo.DESCENDING)])

    # 7. analytics_snapshots
    await db.analytics_snapshots.create_index(
        [("site_id", pymongo.ASCENDING), ("snapshot_type", pymongo.ASCENDING), ("ts", pymongo.DESCENDING)]
    )

    logger.info("MongoDB collections and indexes initialized successfully.")
