import asyncio
import logging
from typing import Callable, Optional
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from motor.motor_asyncio import AsyncIOMotorClient
import redis.asyncio as aioredis
from app.core.config import settings

logger = logging.getLogger(__name__)


async def wait_for_dependency(
    name: str,
    check_fn: Callable[[], asyncio.Future],
    max_timeout: float = 30.0,
    initial_backoff: float = 0.5,
    backoff_factor: float = 1.5,
) -> bool:
    """
    Wait for an external dependency with exponential backoff until it's ready or max_timeout expires.
    """
    start_time = asyncio.get_event_loop().time()
    backoff = initial_backoff

    while True:
        try:
            await check_fn()
            logger.info(f"Dependency '{name}' is ready.")
            return True
        except Exception as e:
            elapsed = asyncio.get_event_loop().time() - start_time
            if elapsed >= max_timeout:
                logger.error(f"Timed out waiting for dependency '{name}' after {elapsed:.1f}s: {e}")
                raise RuntimeError(f"Dependency '{name}' not available after {max_timeout}s") from e

            wait_time = min(backoff, max_timeout - elapsed)
            logger.warning(
                f"Dependency '{name}' not ready ({e}). Retrying in {wait_time:.1f}s (elapsed: {elapsed:.1f}s)..."
            )
            await asyncio.sleep(wait_time)
            backoff *= backoff_factor


async def check_postgres() -> bool:
    engine = create_async_engine(settings.async_database_url, pool_pre_ping=True)
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    finally:
        await engine.dispose()


async def check_mongo() -> bool:
    client = AsyncIOMotorClient(settings.MONGO_URI, serverSelectionTimeoutMS=2000)
    try:
        await client.admin.command("ping")
        return True
    finally:
        client.close()


async def check_redis() -> bool:
    r = aioredis.from_url(settings.REDIS_URL, socket_timeout=2.0)
    try:
        await r.ping()
        return True
    finally:
        await r.aclose()


async def check_mqtt() -> bool:
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(2.0)
    try:
        s.connect((settings.MQTT_BROKER_HOST, settings.MQTT_BROKER_PORT))
        return True
    finally:
        s.close()


async def wait_for_all_dependencies(timeout: float = 30.0, check_all_external: bool = True) -> None:
    logger.info("Verifying infrastructure dependencies...")
    await wait_for_dependency("PostgreSQL", check_postgres, max_timeout=timeout)
    await wait_for_dependency("MongoDB", check_mongo, max_timeout=timeout)
    await wait_for_dependency("Redis", check_redis, max_timeout=timeout)
    if check_all_external:
        try:
            await wait_for_dependency("MQTT Broker", check_mqtt, max_timeout=min(5.0, timeout))
        except Exception as e:
            logger.warning(f"MQTT Broker check failed or timed out: {e}. Degrading gracefully if not mandatory.")
