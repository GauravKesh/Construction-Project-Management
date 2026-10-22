import logging
from typing import Optional
from contextlib import asynccontextmanager
import redis.asyncio as aioredis
from app.core.config import settings

logger = logging.getLogger(__name__)

_redis_client: Optional[aioredis.Redis] = None


def get_redis_client() -> aioredis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = aioredis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_timeout=5.0,
        )
    return _redis_client


async def close_redis_client() -> None:
    global _redis_client
    if _redis_client is not None:
        await _redis_client.aclose()
        _redis_client = None


# Key Namespaces
KEY_STREAM_INGEST = "stream:ingest"
KEY_STREAM_DLQ = "stream:dlq"
GROUP_VALIDATORS = "validators"
GROUP_PROCESSORS = "processors"


def key_rate_limit(identifier: str, route: str) -> str:
    return f"rl:{identifier}:{route}"


def key_alert_dedup(rule_id: str, sensor_id: str) -> str:
    return f"dedup:alert:{rule_id}:{sensor_id}"


def key_rule_state(rule_id: str, sensor_id: str) -> str:
    return f"rulestate:{rule_id}:{sensor_id}"


def key_latest_sensor(sensor_id: str) -> str:
    return f"latest:sensor:{sensor_id}"


def key_kpi_cache(site_id: str, interval: str) -> str:
    return f"cache:kpi:{site_id}:{interval}"


def key_lock(name: str) -> str:
    return f"lock:{name}"


def key_revoked_token(jti: str) -> str:
    return f"tokens:revoked:{jti}"


@asynccontextmanager
async def distributed_lock(name: str, timeout_seconds: int = 10):
    """
    Simple Redis distributed lock for workers.
    """
    r = get_redis_client()
    lock_k = key_lock(name)
    acquired = await r.set(lock_k, "1", nx=True, ex=timeout_seconds)
    try:
        yield acquired
    finally:
        if acquired:
            await r.delete(lock_k)


async def init_redis_streams() -> None:
    """
    Idempotent initialization of Redis streams and consumer groups.
    """
    r = get_redis_client()
    try:
        # Check / create stream:ingest groups
        for group in [GROUP_VALIDATORS, GROUP_PROCESSORS]:
            try:
                await r.xgroup_create(KEY_STREAM_INGEST, group, id="0", mkstream=True)
                logger.info(f"Created Redis stream consumer group: {group} on {KEY_STREAM_INGEST}")
            except Exception as e:
                if "BUSYGROUP" in str(e):
                    # Group already exists
                    pass
                else:
                    logger.warning(f"Consumer group {group} creation warning: {e}")

        # Check / create stream:dlq
        try:
            await r.xgroup_create(KEY_STREAM_DLQ, "dlq_handlers", id="0", mkstream=True)
        except Exception as e:
            if "BUSYGROUP" not in str(e):
                pass

        logger.info("Redis streams and consumer groups verified successfully.")
    except Exception as e:
        logger.warning(f"Redis stream init skipped or failed: {e}")
