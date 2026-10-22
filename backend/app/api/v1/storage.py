from fastapi import APIRouter, Depends, HTTPException, Response, status
from app.core.dependencies import get_storage_driver
from app.storage.base import StorageDriver
from app.storage.signed_urls import verify_signed_token

router = APIRouter(prefix="", tags=["Storage"])


@router.get("/storage/download/{token}")
async def download_storage_file(
    token: str,
    storage: StorageDriver = Depends(get_storage_driver),
):
    """
    HMAC signed-token secure file download endpoint.
    Verifies cryptographic signature and expiration.
    """
    verified = verify_signed_token(token)
    if not verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Download link is invalid or has expired",
        )

    bucket, key = verified
    file_bytes = await storage.get_file(bucket, key)
    if not file_bytes:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    content_type = "application/octet-stream"
    if key.endswith(".jpg") or key.endswith(".jpeg"):
        content_type = "image/jpeg"
    elif key.endswith(".png"):
        content_type = "image/png"
    elif key.endswith(".pdf"):
        content_type = "application/pdf"
    elif key.endswith(".csv"):
        content_type = "text/csv"

    filename = key.split("/")[-1]
    return Response(
        content=file_bytes,
        media_type=content_type,
        headers={"Content-Disposition": f"inline; filename={filename}"},
    )
