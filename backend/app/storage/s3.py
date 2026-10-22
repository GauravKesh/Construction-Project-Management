import logging
from typing import Optional
import aioboto3
from botocore.exceptions import ClientError
from app.core.config import settings
from app.storage.base import StorageDriver

logger = logging.getLogger(__name__)


class S3StorageDriver(StorageDriver):
    def __init__(self):
        self.session = aioboto3.Session()
        self.endpoint_url = settings.S3_ENDPOINT_URL
        self.aws_access_key_id = settings.S3_ACCESS_KEY
        self.aws_secret_access_key = settings.S3_SECRET_KEY
        self.region_name = settings.S3_REGION
        self.default_bucket = settings.S3_BUCKET_NAME

    def _get_client_context(self):
        return self.session.client(
            "s3",
            endpoint_url=self.endpoint_url,
            aws_access_key_id=self.aws_access_key_id,
            aws_secret_access_key=self.aws_secret_access_key,
            region_name=self.region_name,
        )

    async def init_storage(self) -> None:
        async with self._get_client_context() as s3:
            try:
                await s3.head_bucket(Bucket=self.default_bucket)
            except ClientError:
                try:
                    await s3.create_bucket(Bucket=self.default_bucket)
                    logger.info(f"Created S3 bucket: {self.default_bucket}")
                except Exception as e:
                    logger.warning(f"Could not create S3 bucket {self.default_bucket}: {e}")

    async def save_file(
        self,
        bucket: str,
        key: str,
        data: bytes,
        content_type: str = "application/octet-stream",
    ) -> str:
        s3_key = f"{bucket}/{key}"
        async with self._get_client_context() as s3:
            await s3.put_object(
                Bucket=self.default_bucket,
                Key=s3_key,
                Body=data,
                ContentType=content_type,
            )
        return s3_key

    async def get_file(self, bucket: str, key: str) -> Optional[bytes]:
        s3_key = f"{bucket}/{key}"
        async with self._get_client_context() as s3:
            try:
                response = await s3.get_object(Bucket=self.default_bucket, Key=s3_key)
                async with response["Body"] as stream:
                    return await stream.read()
            except ClientError:
                return None

    async def delete_file(self, bucket: str, key: str) -> bool:
        s3_key = f"{bucket}/{key}"
        async with self._get_client_context() as s3:
            try:
                await s3.delete_object(Bucket=self.default_bucket, Key=s3_key)
                return True
            except ClientError:
                return False

    async def file_exists(self, bucket: str, key: str) -> bool:
        s3_key = f"{bucket}/{key}"
        async with self._get_client_context() as s3:
            try:
                await s3.head_object(Bucket=self.default_bucket, Key=s3_key)
                return True
            except ClientError:
                return False

    async def get_signed_url(self, bucket: str, key: str, expires_in_seconds: int = 900) -> str:
        s3_key = f"{bucket}/{key}"
        async with self._get_client_context() as s3:
            url = await s3.generate_presigned_url(
                "get_object",
                Params={"Bucket": self.default_bucket, "Key": s3_key},
                ExpiresIn=expires_in_seconds,
            )
            return url
