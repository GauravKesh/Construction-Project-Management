import math
import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.core.dependencies import get_user_repo, get_audit_repo
from app.db.postgres import get_db
from app.db.redis import get_redis_client, key_revoked_token
from app.db.models.user import User, UserRole
from app.db.repositories.user_repo import UserRepository
from app.db.repositories.audit_repo import AuditRepository
from app.gateway.auth import get_current_user, get_current_user_payload
from app.gateway.rbac import require_roles
from app.schemas.auth import (
    LoginRequest,
    NotificationPreferenceResponse,
    NotificationPreferenceUpdate,
    RefreshTokenRequest,
    TokenResponse,
    UserCreate,
    UserResponse,
    UserRoleUpdate,
    UserUpdate,
)
from app.schemas.common import PaginatedResponse, StatusMessage

router = APIRouter(prefix="", tags=["Auth & Users"])


@router.post("/auth/login", response_model=TokenResponse)
async def login(
    req: LoginRequest,
    user_repo: UserRepository = Depends(get_user_repo),
    audit_repo: AuditRepository = Depends(get_audit_repo),
):
    user = await user_repo.get_by_email(req.email)
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive",
        )

    user_role_str = user.role.value if hasattr(user.role, "value") else str(user.role)
    access_token = create_access_token(
        subject=user.email,
        role=user_role_str,
        user_id=str(user.id),
    )
    refresh_token = create_refresh_token(
        subject=user.email,
        user_id=str(user.id),
    )

    await audit_repo.record(
        action="LOGIN",
        entity_type="user",
        entity_id=str(user.id),
        details={"email": user.email},
        user_id=user.id,
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/auth/refresh", response_model=TokenResponse)
async def refresh_token(
    req: RefreshTokenRequest,
    user_repo: UserRepository = Depends(get_user_repo),
):
    try:
        payload = decode_token(req.refresh_token)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid refresh token: {e}")

    if payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

    # Check revoked token
    jti = payload.get("jti")
    r = get_redis_client()
    if jti:
        try:
            is_revoked = await r.get(key_revoked_token(jti))
        except Exception:
            is_revoked = None
        if is_revoked:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has been revoked")

    user_id = payload.get("user_id")
    user = await user_repo.get_by_id(uuid.UUID(user_id))
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User inactive or not found")

    # Rotate: a refresh token is single-use, so revoke it for its remaining lifetime
    if jti:
        remaining = int(payload.get("exp", 0) - datetime.now(timezone.utc).timestamp())
        if remaining > 0:
            try:
                await r.set(key_revoked_token(jti), "1", ex=remaining)
            except Exception:
                pass

    user_role_str = user.role.value if hasattr(user.role, "value") else str(user.role)
    new_access = create_access_token(subject=user.email, role=user_role_str, user_id=str(user.id))
    new_refresh = create_refresh_token(subject=user.email, user_id=str(user.id))

    return TokenResponse(
        access_token=new_access,
        refresh_token=new_refresh,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/auth/logout", response_model=StatusMessage)
async def logout(
    body: Optional[RefreshTokenRequest] = None,
    payload: dict = Depends(get_current_user_payload),
    user: User = Depends(get_current_user),
    audit_repo: AuditRepository = Depends(get_audit_repo),
):
    jtis = [payload.get("jti")]
    # Also revoke the caller's refresh token so the session cannot be resumed
    if body and body.refresh_token:
        try:
            refresh_payload = decode_token(body.refresh_token)
            if refresh_payload.get("type") == "refresh" and refresh_payload.get("user_id") == str(user.id):
                jtis.append(refresh_payload.get("jti"))
        except ValueError:
            pass

    ttl = settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400
    for jti in filter(None, jtis):
        try:
            r = get_redis_client()
            await r.set(key_revoked_token(jti), "1", ex=ttl)
        except Exception:
            pass

    await audit_repo.record(
        action="LOGOUT",
        entity_type="user",
        entity_id=str(user.id),
        user_id=user.id,
    )
    return StatusMessage(status="ok", message="Successfully logged out")


@router.get("/auth/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    return user


@router.get("/users", response_model=PaginatedResponse[UserResponse])
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    role: Optional[UserRole] = None,
    is_active: Optional[bool] = None,
    user_repo: UserRepository = Depends(get_user_repo),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.PROJECT_MANAGER])),
):
    skip = (page - 1) * page_size
    users = await user_repo.list_users(skip=skip, limit=page_size, role=role, is_active=is_active)
    total = await user_repo.count()
    pages = math.ceil(total / page_size) if total > 0 else 1
    return PaginatedResponse(items=users, total=total, page=page, page_size=page_size, pages=pages)


@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    req: UserCreate,
    user_repo: UserRepository = Depends(get_user_repo),
    audit_repo: AuditRepository = Depends(get_audit_repo),
    current_user: User = Depends(require_roles([UserRole.ADMIN])),
):
    existing = await user_repo.get_by_email(req.email)
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    user = await user_repo.create(
        email=req.email,
        hashed_password=hash_password(req.password),
        full_name=req.full_name,
        role=req.role,
        is_active=True,
    )
    # Default preferences
    await user_repo.update_or_create_notification_preferences(user.id)

    await audit_repo.record(
        action="CREATE_USER",
        entity_type="user",
        entity_id=str(user.id),
        details={"email": user.email, "role": user.role.value},
        user_id=current_user.id,
    )
    return user


@router.get("/users/{user_id}", response_model=UserResponse)
async def get_user_by_id(
    user_id: uuid.UUID,
    user_repo: UserRepository = Depends(get_user_repo),
    current_user: User = Depends(get_current_user),
):
    user = await user_repo.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


@router.patch("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: uuid.UUID,
    req: UserUpdate,
    user_repo: UserRepository = Depends(get_user_repo),
    current_user: User = Depends(get_current_user),
):
    if current_user.id != user_id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot edit another user")

    update_data = req.model_dump(exclude_unset=True)
    if "password" in update_data and update_data["password"]:
        update_data["hashed_password"] = hash_password(update_data.pop("password"))

    user = await user_repo.update(user_id, **update_data)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


@router.delete("/users/{user_id}", response_model=StatusMessage)
async def deactivate_user(
    user_id: uuid.UUID,
    user_repo: UserRepository = Depends(get_user_repo),
    current_user: User = Depends(require_roles([UserRole.ADMIN])),
):
    user = await user_repo.update(user_id, is_active=False)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return StatusMessage(status="ok", message=f"User {user.email} deactivated")


@router.patch("/users/{user_id}/role", response_model=UserResponse)
async def update_user_role(
    user_id: uuid.UUID,
    req: UserRoleUpdate,
    user_repo: UserRepository = Depends(get_user_repo),
    current_user: User = Depends(require_roles([UserRole.ADMIN])),
):
    user = await user_repo.update(user_id, role=req.role)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


@router.get("/users/{user_id}/notification-preferences", response_model=NotificationPreferenceResponse)
async def get_notification_prefs(
    user_id: uuid.UUID,
    user_repo: UserRepository = Depends(get_user_repo),
    current_user: User = Depends(get_current_user),
):
    if current_user.id != user_id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot view another user's preferences")
    prefs = await user_repo.get_notification_preferences(user_id)
    if not prefs:
        prefs = await user_repo.update_or_create_notification_preferences(user_id)
    return prefs


@router.put("/users/{user_id}/notification-preferences", response_model=NotificationPreferenceResponse)
async def update_notification_prefs(
    user_id: uuid.UUID,
    req: NotificationPreferenceUpdate,
    user_repo: UserRepository = Depends(get_user_repo),
    current_user: User = Depends(get_current_user),
):
    if current_user.id != user_id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot edit another user's preferences")

    prefs = await user_repo.update_or_create_notification_preferences(
        user_id=user_id,
        email_enabled=req.email_enabled,
        sms_enabled=req.sms_enabled,
        push_enabled=req.push_enabled,
        min_severity=req.min_severity,
        phone_number=req.phone_number,
    )
    return prefs
