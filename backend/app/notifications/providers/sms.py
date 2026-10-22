import logging
from typing import Any, Dict
import httpx
from app.core.config import settings
from app.notifications.providers.base import NotificationProvider

logger = logging.getLogger("notification.sms")


class SMSNotificationProvider(NotificationProvider):
    def __init__(self):
        self.account_sid = settings.TWILIO_ACCOUNT_SID
        self.auth_token = settings.TWILIO_AUTH_TOKEN
        self.from_number = settings.TWILIO_FROM_NUMBER

    async def send(self, recipient: str, title: str, body: str, metadata: Dict[str, Any]) -> bool:
        if not (self.account_sid and self.auth_token and self.from_number):
            logger.warning("Twilio SMS credentials not configured. SMS skipped.")
            return False

        url = f"https://api.twilio.com/2010-04-01/Accounts/{self.account_sid}/Messages.json"
        data = {
            "From": self.from_number,
            "To": recipient,
            "Body": f"{title}\n{body}",
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(url, data=data, auth=(self.account_sid, self.auth_token))
                if resp.status_code in [200, 201]:
                    logger.info(f"SMS sent successfully to {recipient}")
                    return True
                else:
                    logger.error(f"Twilio error {resp.status_code}: {resp.text}")
                    return False
        except Exception as e:
            logger.error(f"Failed to send SMS to {recipient}: {e}")
            return False
