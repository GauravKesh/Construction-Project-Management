import logging
from typing import Any, Dict, Optional
from app.core.config import settings
from app.notifications.providers.base import NotificationProvider
from app.notifications.providers.console import ConsoleNotificationProvider
from app.notifications.providers.email import EmailNotificationProvider
from app.notifications.providers.sms import SMSNotificationProvider
from app.notifications.providers.push import PushNotificationProvider

logger = logging.getLogger("notification_engine")


class NotificationEngine:
    def __init__(self):
        self._console_provider = ConsoleNotificationProvider()
        self._email_provider = (
            EmailNotificationProvider() if settings.NOTIFY_PROVIDER_EMAIL == "smtp" else self._console_provider
        )
        self._sms_provider = (
            SMSNotificationProvider() if settings.NOTIFY_PROVIDER_SMS == "twilio" else self._console_provider
        )
        self._push_provider = (
            PushNotificationProvider() if settings.NOTIFY_PROVIDER_PUSH == "fcm" else self._console_provider
        )

    def _get_provider_for_channel(self, channel: str) -> NotificationProvider:
        c = channel.lower()
        if c == "email":
            return self._email_provider
        elif c == "sms":
            return self._sms_provider
        elif c == "push":
            return self._push_provider
        else:
            return self._console_provider

    async def dispatch(
        self,
        channel: str,
        recipient: str,
        title: str,
        body: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> bool:
        provider = self._get_provider_for_channel(channel)
        return await provider.send(
            recipient=recipient,
            title=title,
            body=body,
            metadata=metadata or {},
        )


notification_engine = NotificationEngine()
