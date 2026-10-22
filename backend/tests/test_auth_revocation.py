import httpx
import pytest
from app.core.security import create_refresh_token, decode_token
from app.db.redis import get_redis_client, key_revoked_token
from app.realtime.socketio_server import _can_access, handle_connect


@pytest.mark.asyncio
async def test_revoked_access_token_is_rejected(async_client: httpx.AsyncClient, admin_token, admin_headers):
    jti = decode_token(admin_token)["jti"]
    r = get_redis_client()
    await r.set(key_revoked_token(jti), "1", ex=60)
    try:
        resp = await async_client.get("/api/v1/auth/me", headers=admin_headers)
        assert resp.status_code == 401
    finally:
        await r.delete(key_revoked_token(jti))


@pytest.mark.asyncio
async def test_refresh_token_cannot_be_used_as_access_token(async_client: httpx.AsyncClient, admin_user):
    refresh = create_refresh_token(subject=admin_user.email, user_id=str(admin_user.id))
    resp = await async_client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {refresh}"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_refresh_token_is_single_use(async_client: httpx.AsyncClient, admin_user):
    refresh = create_refresh_token(subject=admin_user.email, user_id=str(admin_user.id))
    first = await async_client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
    assert first.status_code == 200
    replay = await async_client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
    assert replay.status_code == 401


@pytest.mark.asyncio
async def test_logout_revokes_refresh_token(async_client: httpx.AsyncClient, admin_user, admin_headers):
    refresh = create_refresh_token(subject=admin_user.email, user_id=str(admin_user.id))
    resp = await async_client.post("/api/v1/auth/logout", json={"refresh_token": refresh}, headers=admin_headers)
    assert resp.status_code == 200
    after = await async_client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
    assert after.status_code == 401


@pytest.mark.asyncio
async def test_socket_connect_requires_access_token(admin_user):
    assert await handle_connect("sid-1", {}, None) is False
    assert await handle_connect("sid-2", {}, {"token": "not-a-jwt"}) is False
    refresh = create_refresh_token(subject=admin_user.email, user_id=str(admin_user.id))
    assert await handle_connect("sid-3", {}, {"token": refresh}) is False


@pytest.mark.asyncio
async def test_socket_room_access_follows_project_membership(db_session, admin_user, safety_user):
    from sqlalchemy import select
    from app.core.security import hash_password
    from app.db.models.project import Site
    from app.db.models.user import User, UserRole

    site = (await db_session.execute(select(Site).limit(1))).scalar_one()
    outsider = User(
        email="outsider-socket@example.com",
        hashed_password=hash_password("Outsider@123456"),
        full_name="Not A Member",
        role=UserRole.SAFETY_OFFICER,
        is_active=True,
    )
    db_session.add(outsider)
    await db_session.commit()
    try:
        assert await _can_access({"user_id": str(admin_user.id), "role": "admin"}, site_id=str(site.id))
        assert await _can_access({"user_id": str(safety_user.id), "role": "safety_officer"}, site_id=str(site.id))
        assert not await _can_access({"user_id": str(outsider.id), "role": "safety_officer"}, site_id=str(site.id))
        assert not await _can_access({"user_id": None, "role": None}, site_id=str(site.id))
        assert not await _can_access({"user_id": str(safety_user.id), "role": "safety_officer"}, site_id="not-a-uuid")
    finally:
        await db_session.delete(outsider)
        await db_session.commit()


@pytest.mark.asyncio
async def test_http_ingest_requires_credentials(async_client: httpx.AsyncClient, admin_headers, monkeypatch):
    from app.core.config import settings

    payload = {"sensor_id": "ingest-auth-test", "site_id": "s", "type": "gas", "value": 1.0, "unit": "ppm"}
    anonymous = await async_client.post("/api/v1/telemetry/ingest", json=payload)
    assert anonymous.status_code == 401

    monkeypatch.setattr(settings, "INGEST_API_KEY", "device-secret-for-tests")
    wrong_key = await async_client.post("/api/v1/telemetry/ingest", json=payload, headers={"X-API-Key": "nope"})
    assert wrong_key.status_code == 401
    device = await async_client.post(
        "/api/v1/telemetry/ingest", json=payload, headers={"X-API-Key": "device-secret-for-tests"}
    )
    assert device.status_code == 200

    user = await async_client.post("/api/v1/telemetry/ingest", json=payload, headers=admin_headers)
    assert user.status_code == 200
