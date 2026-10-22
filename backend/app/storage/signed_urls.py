import base64
import hashlib
import hmac
import json
import time
from typing import Tuple, Optional
from app.core.config import settings


def generate_signed_token(bucket: str, key: str, expires_in_seconds: int = 900) -> str:
    expires_at = int(time.time()) + expires_in_seconds
    payload_data = {
        "bucket": bucket,
        "key": key,
        "exp": expires_at,
    }
    payload_json = json.dumps(payload_data, separators=(",", ":"))
    payload_b64 = base64.urlsafe_b64encode(payload_json.encode("utf-8")).decode("utf-8")

    sig = hmac.new(
        settings.SECRET_KEY.encode("utf-8"),
        payload_b64.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    return f"{payload_b64}.{sig}"


def verify_signed_token(token: str) -> Optional[Tuple[str, str]]:
    """
    Verifies the HMAC signature and timestamp.
    Returns (bucket, key) if valid, or None if invalid/expired.
    """
    try:
        if "." not in token:
            return None
        payload_b64, sig = token.split(".", 1)

        expected_sig = hmac.new(
            settings.SECRET_KEY.encode("utf-8"),
            payload_b64.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

        if not hmac.compare_digest(sig, expected_sig):
            return None

        payload_json = base64.urlsafe_b64decode(payload_b64.encode("utf-8")).decode("utf-8")
        payload = json.loads(payload_json)

        if int(time.time()) > payload.get("exp", 0):
            return None

        return payload.get("bucket"), payload.get("key")
    except Exception:
        return None
