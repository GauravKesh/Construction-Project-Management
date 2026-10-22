import asyncio
import json
import logging
from typing import Optional
import aiomqtt
from app.core.config import settings
from app.core.metrics import INGEST_MESSAGES_TOTAL
from app.db.redis import get_redis_client, KEY_STREAM_INGEST, KEY_STREAM_DLQ

logger = logging.getLogger("mqtt_consumer")


class MqttIngestionConsumer:
    def __init__(self):
        self.host = settings.MQTT_BROKER_HOST
        self.port = settings.MQTT_BROKER_PORT
        self.username = settings.MQTT_USERNAME
        self.password = settings.MQTT_PASSWORD
        self.topic = settings.MQTT_TOPIC_SUB
        self._running = False

    async def start(self) -> None:
        self._running = True
        logger.info(f"Starting MQTT consumer connecting to {self.host}:{self.port}, topic: {self.topic}")

        backoff = 1.0
        while self._running:
            try:
                client_kwargs = {
                    "hostname": self.host,
                    "port": self.port,
                    "keepalive": settings.MQTT_KEEPALIVE,
                }
                if self.username and self.password:
                    client_kwargs["username"] = self.username
                    client_kwargs["password"] = self.password

                async with aiomqtt.Client(**client_kwargs) as client:
                    logger.info("Connected to MQTT broker successfully.")
                    backoff = 1.0
                    await client.subscribe(self.topic)
                    logger.info(f"Subscribed to topic '{self.topic}'")

                    async for message in client.messages:
                        if not self._running:
                            break
                        await self._process_mqtt_message(message)

            except asyncio.CancelledError:
                logger.info("MQTT consumer cancelled.")
                break
            except Exception as e:
                logger.warning(f"MQTT connection lost or error: {e}. Retrying in {backoff:.1f}s...")
                await asyncio.sleep(backoff)
                backoff = min(backoff * 1.5, 30.0)

    async def _process_mqtt_message(self, message: aiomqtt.Message) -> None:
        topic_str = str(message.topic)
        payload_bytes = message.payload
        r = get_redis_client()

        try:
            payload_str = payload_bytes.decode("utf-8")
            data = json.loads(payload_str)

            # Topic convention: sites/{site_id}/sensors/{sensor_type}/{sensor_id}
            parts = topic_str.split("/")
            if len(parts) >= 5 and parts[0] == "sites" and parts[2] == "sensors":
                data.setdefault("site_id", parts[1])
                data.setdefault("type", parts[3])
                data.setdefault("sensor_id", parts[4])

            # Publish to Redis Stream 'stream:ingest'
            stream_entry = {
                "sensor_id": str(data.get("sensor_id", "")),
                "site_id": str(data.get("site_id", "")),
                "type": str(data.get("type", "")),
                # No default: a message without a value must be rejected, not stored as 0
                "value": "" if data.get("value") is None else str(data.get("value")),
                "unit": str(data.get("unit", "")),
                "ts": str(data.get("ts", "")),
                "battery": str(data.get("battery", "")),
                "zone_id": str(data.get("zone_id", "")),
                "location": json.dumps(data.get("location")) if data.get("location") else "",
            }

            await r.xadd(KEY_STREAM_INGEST, stream_entry)

            INGEST_MESSAGES_TOTAL.labels(
                sensor_type=data.get("type", "unknown"),
                site_id=data.get("site_id", "unknown"),
            ).inc()

        except Exception as e:
            logger.error(f"Failed to parse or queue MQTT message on {topic_str}: {e}")
            # Send corrupted message to Dead Letter Queue
            try:
                await r.xadd(
                    KEY_STREAM_DLQ,
                    {
                        "topic": topic_str,
                        "raw": str(payload_bytes),
                        "error": str(e),
                    },
                )
            except Exception:
                pass

    def stop(self) -> None:
        self._running = False


mqtt_consumer = MqttIngestionConsumer()
