import uuid
from typing import List, Optional
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models.project import Project, ProjectMember, ProjectStatus
from app.db.repositories.base import BaseRepository


class ProjectRepository(BaseRepository[Project]):
    def __init__(self, session: AsyncSession):
        super().__init__(Project, session)

    async def get_by_id_active(self, project_id: uuid.UUID) -> Optional[Project]:
        query = select(Project).where(
            and_(Project.id == project_id, Project.deleted_at.is_(None))
        )
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def get_by_code(self, code: str) -> Optional[Project]:
        query = select(Project).where(
            and_(Project.code == code, Project.deleted_at.is_(None))
        )
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def list_projects(
        self,
        skip: int = 0,
        limit: int = 50,
        status: Optional[ProjectStatus] = None,
        user_id: Optional[uuid.UUID] = None,
    ) -> List[Project]:
        query = select(Project).where(Project.deleted_at.is_(None))
        if status:
            query = query.where(Project.status == status)
        if user_id:
            query = query.join(ProjectMember, Project.id == ProjectMember.project_id).where(
                ProjectMember.user_id == user_id
            )
        query = query.offset(skip).limit(limit).order_by(Project.created_at.desc())
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def check_user_membership(self, project_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        query = select(ProjectMember).where(
            and_(ProjectMember.project_id == project_id, ProjectMember.user_id == user_id)
        )
        result = await self.session.execute(query)
        return result.scalar_one_or_none() is not None

    async def add_member(self, project_id: uuid.UUID, user_id: uuid.UUID, project_role: str = "member") -> ProjectMember:
        member = ProjectMember(project_id=project_id, user_id=user_id, project_role=project_role)
        self.session.add(member)
        await self.session.flush()
        return member

    async def remove_member(self, project_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        query = select(ProjectMember).where(
            and_(ProjectMember.project_id == project_id, ProjectMember.user_id == user_id)
        )
        result = await self.session.execute(query)
        member = result.scalar_one_or_none()
        if member:
            await self.session.delete(member)
            await self.session.flush()
            return True
        return False

    async def list_members(self, project_id: uuid.UUID) -> List[ProjectMember]:
        query = select(ProjectMember).where(ProjectMember.project_id == project_id)
        result = await self.session.execute(query)
        return list(result.scalars().all())
