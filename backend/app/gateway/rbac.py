import uuid
from typing import List, Optional
from fastapi import Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.postgres import get_db, AsyncSessionLocal
from app.db.models.user import User, UserRole
from app.db.repositories.project_repo import ProjectRepository
from app.db.repositories.site_repo import SiteRepository
from app.gateway.auth import get_current_user


def require_roles(allowed_roles: List[UserRole]):
    """
    Dependency factory to check if the current user has one of the allowed roles.
    Admins are always authorized.
    """
    async def role_checker(user: User = Depends(get_current_user)) -> User:
        user_role_val = user.role.value if hasattr(user.role, "value") else str(user.role)
        if user_role_val == UserRole.ADMIN.value:
            return user

        allowed_vals = [r.value if hasattr(r, "value") else str(r) for r in allowed_roles]
        if user_role_val not in allowed_vals:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: required roles {allowed_vals}, but you have {user_role_val}",
            )
        return user

    return role_checker


async def check_project_access(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> bool:
    user_role_val = user.role.value if hasattr(user.role, "value") else str(user.role)
    if user_role_val == UserRole.ADMIN.value:
        return True

    if session is None or not isinstance(session, AsyncSession):
        async with AsyncSessionLocal() as db_session:
            proj_repo = ProjectRepository(db_session)
            is_member = await proj_repo.check_user_membership(project_id, user.id)
            if not is_member:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You do not have access to this project",
                )
            return True

    proj_repo = ProjectRepository(session)
    is_member = await proj_repo.check_user_membership(project_id, user.id)
    if not is_member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this project",
        )
    return True


async def check_site_access(
    site_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> bool:
    user_role_val = user.role.value if hasattr(user.role, "value") else str(user.role)
    if user_role_val == UserRole.ADMIN.value:
        return True

    if session is None or not isinstance(session, AsyncSession):
        async with AsyncSessionLocal() as db_session:
            site_repo = SiteRepository(db_session)
            site = await site_repo.get_by_id_active(site_id)
            if not site:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Site not found",
                )

            proj_repo = ProjectRepository(db_session)
            is_member = await proj_repo.check_user_membership(site.project_id, user.id)
            if not is_member:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You do not have access to this site",
                )
            return True

    site_repo = SiteRepository(session)
    site = await site_repo.get_by_id_active(site_id)
    if not site:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Site not found",
        )

    proj_repo = ProjectRepository(session)
    is_member = await proj_repo.check_user_membership(site.project_id, user.id)
    if not is_member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this site",
        )
    return True
