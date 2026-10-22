import time
import pytest
from app.storage import get_storage
from app.storage.signed_urls import generate_signed_token, verify_signed_token


def test_hmac_signed_token_generation_and_validation():
    bucket = "attachments"
    key = "test_doc_01.pdf"

    # Generate signed token valid for 60 seconds
    token = generate_signed_token(
        bucket=bucket,
        key=key,
        expires_in_seconds=60,
    )
    assert "." in token

    # 1. Valid token verification
    verified = verify_signed_token(token)
    assert verified is not None
    v_bucket, v_key = verified
    assert v_bucket == bucket
    assert v_key == key

    # 2. Tampered token verification
    tampered_token = token[:-4] + "abcd"
    assert verify_signed_token(tampered_token) is None

    # 3. Expired token
    expired_token = generate_signed_token(bucket, key, expires_in_seconds=-10)
    assert verify_signed_token(expired_token) is None


@pytest.mark.asyncio
async def test_storage_upload_and_download_flow(async_client):
    storage = get_storage()
    await storage.init_storage()

    test_data = b"Hello, Construction Monitoring Storage System!"
    bucket = "drawings"
    key = "sample_blueprint.txt"

    # Save file
    saved_key = await storage.save_file(bucket, key, test_data, content_type="text/plain")
    assert key in saved_key

    # Generate download URL
    signed_url = await storage.get_signed_url(bucket, key, expires_in_seconds=300)
    assert "/api/v1/storage/download/" in signed_url

    # Download via API using signed URL
    resp = await async_client.get(signed_url)
    assert resp.status_code == 200
    assert resp.content == test_data

    # Delete file
    deleted = await storage.delete_file(bucket, key)
    assert deleted is True
