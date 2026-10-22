import json
import logging
from typing import Any, Dict
from app.notifications.providers.base import NotificationProvider

logger = logging.getLogger("notification.console")


class ConsoleNotificationProvider(NotificationProvider):
    async def send(self, recipient: str, title: str, body: str, metadata: Dict[str, Any]) -> bool:
        log_entry = {
            "channel": "console",
            "recipient": recipient,
            "title": title,
            "body": body,
            "metadata": metadata,
        }
        logger.info(f"[NOTIFICATION] {json.dumps(log_entry)}")
        return True
