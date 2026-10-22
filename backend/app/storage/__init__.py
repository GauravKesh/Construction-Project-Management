from typing import Optional
from app.core.config import settings
from app.storage.base import StorageDriver
from app.storage.local import LocalStorageDriver
from app.storage.s3 import S3StorageDriver

_storage_instance: Optional[StorageDriver] = None


def get_storage() -> StorageDriver:
    global _storage_instance
    if _storage_instance is None:
        # Development mode: default to local filesystem storage
        # Production mode: uses S3 / MinIO
        if settings.STORAGE_BACKEND.lower() == "s3" or settings.APP_ENV == "production":
            _storage_instance = S3StorageDriver()
        else:
            _storage_instance = LocalStorageDriver()
    return _storage_instance
