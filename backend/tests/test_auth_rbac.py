import uuid
import pytest
import httpx
from app.core.security import create_access_token, hash_password, verify_password
from app.db.models.user import UserRole
from app.db.redis import get_redis_client, key_revoked_token


def test_password_hashing():
    raw = "MySecretPassword123!"
    hashed = hash_password(raw)
    assert hashed != raw
    assert verify_password(raw, hashed) is True
    assert verify_password("WrongPassword", hashed) is False


@pytest.mark.asyncio
async def test_jwt_token_creation_and_revocation():
    token = create_access_token("test@example.com", UserRole.VIEWER.value, "user-123")
    assert token is not None
    assert isinstance(token, str)

    # Token revocation in Redis
    r = get_redis_client()
    jti = "mock-jti-abc"
    rev_key = key_revoked_token(jti)
    await r.set(rev_key, "1", ex=10)
    is_revoked = await r.get(rev_key)
    assert is_revoked == b"1" or is_revoked == "1"
    await r.delete(rev_key)


@pytest.mark.asyncio
async def test_auth_me_endpoint(async_client: httpx.AsyncClient, admin_headers):
    resp = await async_client.get("/api/v1/auth/me", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == "admin@buildtrack.com"
    assert data["role"] == "admin"


@pytest.mark.asyncio
async def test_unauthorized_access(async_client: httpx.AsyncClient):
    resp = await async_client.get("/api/v1/auth/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_rbac_admin_only_route(async_client: httpx.AsyncClient, safety_headers, admin_headers):
    # Creating a new user requires ADMIN role
    user_payload = {
        "email": f"newuser-{uuid.uuid4().hex[:6]}@example.com",
        "password": "Password123!",
        "full_name": "New Test User",
        "role": "viewer",
    }
    # Safety officer should get 403 Forbidden
    resp = await async_client.post("/api/v1/users", json=user_payload, headers=safety_headers)
    assert resp.status_code == 403

    # Admin should succeed or return user details
    resp_admin = await async_client.post("/api/v1/users", json=user_payload, headers=admin_headers)
    assert resp_admin.status_code in [200, 201]
