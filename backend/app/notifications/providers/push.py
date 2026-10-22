import logging
from typing import Any, Dict
import httpx
from app.core.config import settings
from app.notifications.providers.base import NotificationProvider

logger = logging.getLogger("notification.push")


class PushNotificationProvider(NotificationProvider):
    def __init__(self):
        self.server_key = settings.FCM_SERVER_KEY

    async def send(self, recipient: str, title: str, body: str, metadata: Dict[str, Any]) -> bool:
        if not self.server_key:
            logger.warning("FCM server key not configured. Push notification skipped.")
            return False

        url = "https://fcm.googleapis.com/fcm/send"
        headers = {
            "Authorization": f"key={self.server_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "to": recipient,
            "notification": {
                "title": title,
                "body": body,
            },
            "data": metadata,
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(url, headers=headers, json=payload)
                if resp.status_code == 200:
                    logger.info(f"Push notification sent successfully to {recipient[:10]}...")
                    return True
                else:
                    logger.error(f"FCM error {resp.status_code}: {resp.text}")
                    return False
        except Exception as e:
            logger.error(f"Failed to send Push notification to {recipient[:10]}: {e}")
            return False
