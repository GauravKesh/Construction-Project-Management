import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional
import socketio
from app.core.config import settings
from app.core.security import decode_token
from app.realtime.rooms import room_site, room_project, room_user

logger = logging.getLogger("socketio")

# Initialize Redis client manager for multi-worker ASGI scaling
if settings.REDIS_URL and not settings.REDIS_URL.startswith("fakeredis://"):
    try:
        mgr = socketio.AsyncRedisManager(settings.REDIS_URL)
    except Exception as e:
        logger.warning(f"Could not connect Socket.IO to Redis manager: {e}, falling back to in-process")
        mgr = None
else:
    mgr = None

sio = socketio.AsyncServer(
    async_mode="asgi",
    client_manager=mgr,
    cors_allowed_origins=settings.CORS_ORIGINS,
    logger=False,
    engineio_logger=False,
)

LIVE_NS = "/live"


async def _is_revoked(jti: Optional[str]) -> bool:
    if not jti:
        return False
    from app.db.redis import get_redis_client, key_revoked_token
    try:
        return bool(await get_redis_client().get(key_revoked_token(jti)))
    except Exception:
        return False


async def _can_access(
    session_data: Dict[str, Any],
    site_id: Optional[str] = None,
    project_id: Optional[str] = None,
) -> bool:
    """
    Mirrors the REST check_site_access / check_project_access rules:
    admins see everything, everyone else only projects they are members of.
    """
    if session_data.get("role") == "admin":
        return True
    user_id = session_data.get("user_id")
    if not user_id:
        return False

    from app.db.postgres import AsyncSessionLocal
    from app.db.repositories.project_repo import ProjectRepository
    from app.db.repositories.site_repo import SiteRepository

    try:
        async with AsyncSessionLocal() as session:
            if site_id:
                site = await SiteRepository(session).get_by_id_active(uuid.UUID(str(site_id)))
                if not site:
                    return False
                project_id = str(site.project_id)
            if not project_id:
                return False
            return await ProjectRepository(session).check_user_membership(
                uuid.UUID(str(project_id)), uuid.UUID(str(user_id))
            )
    except ValueError:
        return False


@sio.on("connect", namespace=LIVE_NS)
async def handle_connect(sid: str, environ: Dict[str, Any], auth: Optional[Dict[str, Any]] = None):
    # JWT authentication in handshake
    token = None
    if auth and isinstance(auth, dict) and "token" in auth:
        token = auth["token"]
    elif "QUERY_STRING" in environ:
        # Check query string token
        from urllib.parse import parse_qs
        qs = parse_qs(environ["QUERY_STRING"])
        if "token" in qs:
            token = qs["token"][0]

    if not token:
        logger.warning("Socket.IO connection rejected: missing token")
        return False

    try:
        payload = decode_token(token)
    except Exception as e:
        logger.warning(f"Socket.IO connection rejected: invalid token ({e})")
        return False
    user_id = payload.get("user_id")
    if payload.get("type") != "access" or not user_id:
        logger.warning("Socket.IO connection rejected: not an access token")
        return False
    if await _is_revoked(payload.get("jti")):
        logger.warning("Socket.IO connection rejected: revoked token")
        return False

    await sio.save_session(sid, {"user_id": user_id, "role": payload.get("role")}, namespace=LIVE_NS)
    # Automatically join user's private notification room
    await sio.enter_room(sid, room_user(str(user_id)), namespace=LIVE_NS)

    logger.info(f"Socket.IO client connected: sid={sid}, user_id={user_id}")
    return True


@sio.on("disconnect", namespace=LIVE_NS)
async def handle_disconnect(sid: str):
    logger.info(f"Socket.IO client disconnected: sid={sid}")


@sio.on("subscribe", namespace=LIVE_NS)
async def handle_subscribe(sid: str, data: Dict[str, Any]):
    """
    Subscribes client to a site or project room.
    Payload: {"site_id": "..."} or {"project_id": "..."}
    """
    if not isinstance(data, dict):
        return

    site_id = data.get("site_id")
    project_id = data.get("project_id")
    session_data = await sio.get_session(sid, namespace=LIVE_NS)

    if site_id and not await _can_access(session_data, site_id=site_id):
        logger.warning(f"Client {sid} denied subscription to site {site_id}")
        site_id = None
    if project_id and not await _can_access(session_data, project_id=project_id):
        logger.warning(f"Client {sid} denied subscription to project {project_id}")
        project_id = None

    if site_id:
        r = room_site(str(site_id))
        await sio.enter_room(sid, r, namespace=LIVE_NS)
        logger.debug(f"Client {sid} subscribed to {r}")

    if project_id:
        r = room_project(str(project_id))
        await sio.enter_room(sid, r, namespace=LIVE_NS)
        logger.debug(f"Client {sid} subscribed to {r}")


@sio.on("unsubscribe", namespace=LIVE_NS)
async def handle_unsubscribe(sid: str, data: Dict[str, Any]):
    if not isinstance(data, dict):
        return
    site_id = data.get("site_id")
    project_id = data.get("project_id")

    if site_id:
        await sio.leave_room(sid, room_site(str(site_id)), namespace=LIVE_NS)
    if project_id:
        await sio.leave_room(sid, room_project(str(project_id)), namespace=LIVE_NS)


@sio.on("ack_alert", namespace=LIVE_NS)
async def handle_ack_alert(sid: str, data: Dict[str, Any]):
    """
    Client acknowledges alert over WebSocket.
    """
    alert_id = data.get("alert_id") if isinstance(data, dict) else None
    if not alert_id:
        return
    session_data = await sio.get_session(sid, namespace=LIVE_NS)
    user_id = session_data.get("user_id")
    if not user_id:
        return

    # Acknowledge in database via repository
    from app.db.postgres import AsyncSessionLocal
    from app.db.models.alert import Alert
    from app.db.repositories.alert_repo import AlertRepository
    try:
        alert_uuid = uuid.UUID(str(alert_id))
    except ValueError:
        return
    async with AsyncSessionLocal() as session:
        alert = await session.get(Alert, alert_uuid)
        if not alert or not await _can_access(session_data, site_id=str(alert.site_id)):
            logger.warning(f"Client {sid} denied acknowledging alert {alert_id}")
            return
        alert_repo = AlertRepository(session)
        updated_alert = await alert_repo.acknowledge(
            alert_id=alert_uuid,
            user_id=uuid.UUID(user_id),
        )
        if updated_alert:
            await session.commit()
            # Broadcast updated alert
            await emit_live_event(
                event_name="alert:updated",
                site_id=str(updated_alert.site_id),
                payload={
                    "alert_id": str(updated_alert.id),
                    "status": updated_alert.status.value,
                    "acknowledged_at": updated_alert.acknowledged_at.isoformat() if updated_alert.acknowledged_at else None,
                },
            )


async def emit_live_event(
    event_name: str,
    site_id: Optional[str],
    payload: Dict[str, Any],
    project_id: Optional[str] = None,
    user_id: Optional[str] = None,
) -> None:
    """
    Dispatches normalized event to Socket.IO rooms.
    All events contain: event_id, ts, site_id.
    """
    event_data = {
        "event_id": str(uuid.uuid4()),
        "ts": datetime.now(timezone.utc).isoformat(),
        "site_id": site_id,
        "data": payload,
    }

    if user_id:
        await sio.emit(event_name, event_data, room=room_user(str(user_id)), namespace=LIVE_NS)
        return

    if site_id:
        await sio.emit(event_name, event_data, room=room_site(str(site_id)), namespace=LIVE_NS)

    if project_id:
        await sio.emit(event_name, event_data, room=room_project(str(project_id)), namespace=LIVE_NS)
