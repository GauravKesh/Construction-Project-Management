import asyncio
import logging
from typing import Optional
from app.db.postgres import AsyncSessionLocal
from app.db.repositories.outbox_repo import OutboxRepository
from app.notifications.engine import notification_engine
from app.realtime.socketio_server import emit_live_event

logger = logging.getLogger("outbox_publisher")


class OutboxPublisher:
    def __init__(self):
        self._running = False

    async def start(self) -> None:
        self._running = True
        logger.info("Outbox publisher loop started.")

        while self._running:
            try:
                await self.process_pending_outbox()
                await asyncio.sleep(0.3)
            except asyncio.CancelledError:
                logger.info("Outbox publisher cancelled.")
                break
            except Exception as e:
                logger.error(f"Error in outbox publisher loop: {e}", exc_info=True)
                await asyncio.sleep(1.0)

    async def process_pending_outbox(self) -> int:
        processed_count = 0
        async with AsyncSessionLocal() as session:
            outbox_repo = OutboxRepository(session)
            events = await outbox_repo.fetch_pending(limit=50)

            for ev in events:
                try:
                    payload = ev.payload
                    event_type = ev.event_type

                    if event_type == "sensor:update":
                        await emit_live_event(
                            event_name="sensor:update",
                            site_id=payload.get("site_id"),
                            payload=payload,
                        )
                    elif event_type == "alert:new":
                        await emit_live_event(
                            event_name="alert:new",
                            site_id=payload.get("site_id"),
                            payload=payload,
                        )
                    elif event_type == "alert:updated":
                        await emit_live_event(
                            event_name="alert:updated",
                            site_id=payload.get("site_id"),
                            payload=payload,
                        )
                    elif event_type == "incident:new":
                        await emit_live_event(
                            event_name="incident:new",
                            site_id=payload.get("site_id"),
                            payload=payload,
                        )
                    elif event_type == "incident:updated":
                        await emit_live_event(
                            event_name="incident:updated",
                            site_id=payload.get("site_id"),
                            payload=payload,
                        )
                    elif event_type == "ppe:violation":
                        await emit_live_event(
                            event_name="ppe:violation",
                            site_id=payload.get("site_id"),
                            payload=payload,
                        )
                    elif event_type == "cv:detection":
                        await emit_live_event(
                            event_name="cv:detection",
                            site_id=payload.get("site_id"),
                            payload=payload,
                        )
                    elif event_type == "notification:new":
                        user_id = payload.get("user_id")
                        # 1. Real-time in-app notification push to user's room
                        await emit_live_event(
                            event_name="notification:new",
                            site_id=None,
                            user_id=user_id,
                            payload=payload,
                        )
                        # 2. Pluggable notification engine dispatch
                        await notification_engine.dispatch(
                            channel=payload.get("channel", "console"),
                            recipient=payload.get("recipient", "user"),
                            title=payload.get("title", "Notification"),
                            body=payload.get("body", ""),
                            metadata=payload,
                        )

                    await outbox_repo.mark_published(ev.id)
                    processed_count += 1
                except Exception as ex:
                    logger.error(f"Failed to publish outbox event {ev.id}: {ex}")
                    await outbox_repo.mark_failed(ev.id)

            if processed_count > 0:
                await session.commit()

        return processed_count

    def stop(self) -> None:
        self._running = False


outbox_publisher = OutboxPublisher()
