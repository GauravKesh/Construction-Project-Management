import time
import logging
from typing import Optional
import redis.asyncio as aioredis
from fastapi import HTTPException, status
from app.core.config import settings

logger = logging.getLogger(__name__)


class SlidingWindowRateLimiter:
    def __init__(self, redis_client: Optional[aioredis.Redis] = None):
        self._redis = redis_client

    async def get_redis(self) -> aioredis.Redis:
        if self._redis is None:
            self._redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        return self._redis

    async def is_allowed(
        self,
        identifier: str,
        route_prefix: str,
        limit: int = 100,
        window_seconds: int = 60,
    ) -> bool:
        """
        Sliding-window log rate limiter using Redis sorted set.
        """
        try:
            r = await self.get_redis()
            key = f"rl:{identifier}:{route_prefix}"
            now = time.time()
            clear_before = now - window_seconds

            pipe = r.pipeline()
            # Remove timestamps outside window
            pipe.zremrangebyscore(key, 0, clear_before)
            # Count remaining in current window
            pipe.zcard(key)
            # Add current timestamp
            pipe.zadd(key, {str(now): now})
            # Set TTL on key
            pipe.expire(key, window_seconds * 2)

            results = await pipe.execute()
            current_count = results[1]

            return current_count < limit
        except Exception as e:
            # Graceful degradation if redis is down: allow request but log warning
            logger.warning(f"Rate limiting degraded: {e}")
            return True


rate_limiter = SlidingWindowRateLimiter()
