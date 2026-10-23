import os
import aiofiles
from pathlib import Path
from typing import Optional
from app.core.config import settings
from app.storage.base import StorageDriver
from app.storage.signed_urls import generate_signed_token


class LocalStorageDriver(StorageDriver):
    def __init__(self, base_path: Optional[str] = None):
        self.base_path = Path(base_path or settings.STORAGE_LOCAL_PATH).resolve()

    def _resolve_path(self, bucket: str, key: str) -> Path:
        # Sanitize to prevent path traversal
        clean_key = os.path.normpath(key).lstrip("/")
        if clean_key.startswith(f"{bucket}/"):
            clean_key = clean_key[len(bucket) + 1 :]
        return self.base_path / bucket / clean_key

    async def init_storage(self) -> None:
        buckets = ["cv-snapshots", "drawings", "attachments", "reports"]
        for b in buckets:
            bucket_dir = self.base_path / b
            bucket_dir.mkdir(parents=True, exist_ok=True)

    async def save_file(
        self,
        bucket: str,
        key: str,
        data: bytes,
        content_type: str = "application/octet-stream",
    ) -> str:
        target_path = self._resolve_path(bucket, key)
        target_path.parent.mkdir(parents=True, exist_ok=True)
        async with aiofiles.open(target_path, "wb") as f:
            await f.write(data)
        return f"{bucket}/{key}"

    async def get_file(self, bucket: str, key: str) -> Optional[bytes]:
        target_path = self._resolve_path(bucket, key)
        if not target_path.exists():
            return None
        async with aiofiles.open(target_path, "rb") as f:
            return await f.read()

    async def delete_file(self, bucket: str, key: str) -> bool:
        target_path = self._resolve_path(bucket, key)
        if target_path.exists():
            target_path.unlink()
            return True
        return False

    async def file_exists(self, bucket: str, key: str) -> bool:
        return self._resolve_path(bucket, key).exists()

    async def get_signed_url(self, bucket: str, key: str, expires_in_seconds: int = 900) -> str:
        token = generate_signed_token(bucket, key, expires_in_seconds=expires_in_seconds)
        root = settings.ROOT_PATH or ""
        return f"{root}/api/v1/storage/download/{token}"
