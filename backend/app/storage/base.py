from abc import ABC, abstractmethod
from typing import Optional


class StorageDriver(ABC):
    @abstractmethod
    async def init_storage(self) -> None:
        """Initialize storage buckets or directories."""
        pass

    @abstractmethod
    async def save_file(
        self,
        bucket: str,
        key: str,
        data: bytes,
        content_type: str = "application/octet-stream",
    ) -> str:
        """Saves data under bucket/key and returns the storage key or URI."""
        pass

    @abstractmethod
    async def get_file(self, bucket: str, key: str) -> Optional[bytes]:
        """Retrieves raw bytes for bucket/key."""
        pass

    @abstractmethod
    async def delete_file(self, bucket: str, key: str) -> bool:
        """Deletes file at bucket/key."""
        pass

    @abstractmethod
    async def file_exists(self, bucket: str, key: str) -> bool:
        """Returns True if bucket/key exists."""
        pass

    @abstractmethod
    async def get_signed_url(self, bucket: str, key: str, expires_in_seconds: int = 900) -> str:
        """Returns a time-limited signed URL for direct download."""
        pass
