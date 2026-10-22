import asyncio
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any, Dict
from app.core.config import settings
from app.notifications.providers.base import NotificationProvider

logger = logging.getLogger("notification.email")


class EmailNotificationProvider(NotificationProvider):
    def __init__(self):
        self.host = settings.SMTP_HOST
        self.port = settings.SMTP_PORT
        self.user = settings.SMTP_USER
        self.password = settings.SMTP_PASSWORD
        self.from_email = settings.SMTP_FROM_EMAIL

    async def send(self, recipient: str, title: str, body: str, metadata: Dict[str, Any]) -> bool:
        if not self.host:
            logger.warning("SMTP host not configured. Email notification skipped.")
            return False

        def _send_sync():
            msg = MIMEMultipart()
            msg["From"] = self.from_email
            msg["To"] = recipient
            msg["Subject"] = title
            msg.attach(MIMEText(body, "plain"))

            with smtplib.SMTP(self.host, self.port) as server:
                if self.user and self.password:
                    server.starttls()
                    server.login(self.user, self.password)
                server.send_message(msg)

        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, _send_sync)
            logger.info(f"Email sent successfully to {recipient}")
            return True
        except Exception as e:
            logger.error(f"Failed to send email to {recipient}: {e}")
            return False
