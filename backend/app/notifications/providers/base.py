from abc import ABC, abstractmethod
from typing import Any, Dict


class NotificationProvider(ABC):
    @abstractmethod
    async def send(self, recipient: str, title: str, body: str, metadata: Dict[str, Any]) -> bool:
        """Sends notification to recipient. Returns True if successful."""
        pass
