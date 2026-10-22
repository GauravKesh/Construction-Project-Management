import uuid
from typing import List, Optional
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models.project import ProjectMember
from app.db.models.user import User, UserRole, NotificationPreference
from app.db.repositories.base import BaseRepository


class UserRepository(BaseRepository[User]):
    def __init__(self, session: AsyncSession):
        super().__init__(User, session)

    async def get_by_email(self, email: str) -> Optional[User]:
        query = select(User).where(func.lower(User.email) == email.lower())
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def list_users(
        self,
        skip: int = 0,
        limit: int = 50,
        role: Optional[UserRole] = None,
        is_active: Optional[bool] = None,
    ) -> List[User]:
        query = select(User)
        if role:
            query = query.where(User.role == role)
        if is_active is not None:
            query = query.where(User.is_active == is_active)
        query = query.offset(skip).limit(limit).order_by(User.created_at.desc())
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def list_alert_recipients(self, project_id: Optional[uuid.UUID], roles: List[UserRole]) -> List[User]:
        """
        Active users who should be notified about an alert on a project: members of
        that project holding one of `roles`, plus every active admin.
        """
        query = (
            select(User)
            .outerjoin(
                ProjectMember,
                and_(ProjectMember.user_id == User.id, ProjectMember.project_id == project_id),
            )
            .where(
                User.is_active.is_(True),
                or_(
                    User.role == UserRole.ADMIN,
                    and_(User.role.in_(roles), ProjectMember.id.is_not(None)),
                ),
            )
            .distinct()
        )
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def get_notification_preferences(self, user_id: uuid.UUID) -> Optional[NotificationPreference]:
        query = select(NotificationPreference).where(NotificationPreference.user_id == user_id)
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def update_or_create_notification_preferences(
        self,
        user_id: uuid.UUID,
        email_enabled: Optional[bool] = None,
        sms_enabled: Optional[bool] = None,
        push_enabled: Optional[bool] = None,
        min_severity: Optional[str] = None,
        phone_number: Optional[str] = None,
    ) -> NotificationPreference:
        prefs = await self.get_notification_preferences(user_id)
        if not prefs:
            prefs = NotificationPreference(
                user_id=user_id,
                email_enabled=email_enabled if email_enabled is not None else True,
                sms_enabled=sms_enabled if sms_enabled is not None else False,
                push_enabled=push_enabled if push_enabled is not None else True,
                min_severity=min_severity or "warning",
                phone_number=phone_number,
            )
            self.session.add(prefs)
        else:
            if email_enabled is not None:
                prefs.email_enabled = email_enabled
            if sms_enabled is not None:
                prefs.sms_enabled = sms_enabled
            if push_enabled is not None:
                prefs.push_enabled = push_enabled
            if min_severity is not None:
                prefs.min_severity = min_severity
            if phone_number is not None:
                prefs.phone_number = phone_number

        await self.session.flush()
        return prefs
