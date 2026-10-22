import asyncio
import os
import tempfile
import uuid
from typing import AsyncGenerator, Dict
from urllib.parse import urlsplit, urlunsplit

# --- Hermetic test environment -------------------------------------------------
# Tests must never touch the developer's databases. Before any app module creates
# an engine or client, point the shared settings object at isolated resources:
#   Postgres  <db>_test   (dropped and recreated per session)
#   MongoDB   <db>_test   (dropped per session)
#   Redis     db 15       (flushed per session)
#   Storage   a temp directory
from app.core.config import settings


def _with_db_name(url: str, db_name: str) -> str:
    parts = urlsplit(url)
    return urlunsplit(parts._replace(path=f"/{db_name}"))


def _with_redis_db(url: str, db_index: int) -> str:
    parts = urlsplit(url)
    return urlunsplit(parts._replace(path=f"/{db_index}"))


_PG_TEST_DB = os.environ.get("TEST_POSTGRES_DB", f"{settings.POSTGRES_DB}_test")
settings.APP_ENV = "test"
settings.DATABASE_URL = _with_db_name(settings.async_database_url, _PG_TEST_DB)
settings.DATABASE_SYNC_URL = _with_db_name(settings.sync_database_url, _PG_TEST_DB)
settings.MONGO_DB = os.environ.get("TEST_MONGO_DB", f"{settings.MONGO_DB}_test")
settings.REDIS_URL = _with_redis_db(settings.REDIS_URL, int(os.environ.get("TEST_REDIS_DB", "15")))
settings.STORAGE_LOCAL_PATH = tempfile.mkdtemp(prefix="buildtrack-test-storage-")
settings.CV_MODE = "mock"

assert _PG_TEST_DB.endswith("_test") and settings.MONGO_DB.endswith("_test"), (
    "Refusing to run tests against a non-test database"
)

import httpx  # noqa: E402
import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from sqlalchemy import select  # noqa: E402
from app.core.security import create_access_token
from app.db.models.user import User, UserRole
from app.db.postgres import AsyncSessionLocal, engine
from app.db.redis import get_redis_client
from app.main import app


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


async def _recreate_postgres_test_db() -> None:
    import asyncpg

    parts = urlsplit(settings.sync_database_url)
    admin_dsn = urlunsplit(parts._replace(path="/postgres"))
    conn = await asyncpg.connect(admin_dsn)
    try:
        await conn.execute(f'DROP DATABASE IF EXISTS "{_PG_TEST_DB}" WITH (FORCE)')
        await conn.execute(f'CREATE DATABASE "{_PG_TEST_DB}"')
    finally:
        await conn.close()


@pytest_asyncio.fixture(scope="session", autouse=True)
async def _test_infrastructure():
    from alembic import command
    from alembic.config import Config
    from app.db.mongo import get_mongo_client, init_mongo
    from app.db.redis import init_redis_streams
    from app.storage import get_storage
    from scripts.seed import seed_data

    await _recreate_postgres_test_db()
    await get_mongo_client().drop_database(settings.MONGO_DB)
    await get_redis_client().flushdb()

    await asyncio.to_thread(command.upgrade, Config("alembic.ini"), "head")
    await init_mongo()
    await init_redis_streams()
    await get_storage().init_storage()
    await seed_data()
    yield
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator:
    async with AsyncSessionLocal() as session:
        yield session


@pytest_asyncio.fixture
async def redis_client():
    r = get_redis_client()
    yield r


@pytest_asyncio.fixture
async def async_client() -> AsyncGenerator[httpx.AsyncClient, None]:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest_asyncio.fixture
async def admin_user(db_session) -> User:
    res = await db_session.execute(select(User).where(User.email == "admin@buildtrack.com"))
    user = res.scalar_one_or_none()
    if not user:
        from scripts.seed import seed_data
        await seed_data()
        res = await db_session.execute(select(User).where(User.email == "admin@buildtrack.com"))
        user = res.scalar_one()
    return user


@pytest_asyncio.fixture
async def safety_user(db_session) -> User:
    res = await db_session.execute(select(User).where(User.email == "safety@buildtrack.com"))
    user = res.scalar_one_or_none()
    if not user:
        from scripts.seed import seed_data
        await seed_data()
        res = await db_session.execute(select(User).where(User.email == "safety@buildtrack.com"))
        user = res.scalar_one()
    return user


@pytest_asyncio.fixture
async def admin_token(admin_user: User) -> str:
    return create_access_token(
        subject=admin_user.email,
        role=admin_user.role.value,
        user_id=str(admin_user.id),
    )


@pytest_asyncio.fixture
async def safety_token(safety_user: User) -> str:
    return create_access_token(
        subject=safety_user.email,
        role=safety_user.role.value,
        user_id=str(safety_user.id),
    )


@pytest_asyncio.fixture
def admin_headers(admin_token: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {admin_token}"}


@pytest_asyncio.fixture
def safety_headers(safety_token: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {safety_token}"}
