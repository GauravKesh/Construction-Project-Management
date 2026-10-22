from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.postgres import get_db
from app.db.mongo import get_mongo_db
from app.db.repositories import (
    UserRepository,
    ProjectRepository,
    SiteRepository,
    ZoneRepository,
    SensorRepository,
    CameraRepository,
    RuleRepository,
    AlertRepository,
    IncidentRepository,
    ProjectDataRepository,
    NotificationRepository,
    AuditRepository,
    OutboxRepository,
    RollupRepository,
    TelemetryRepository,
    CVRepository,
    EventLogRepository,
)
from app.storage import get_storage, StorageDriver


def get_user_repo(session: AsyncSession = Depends(get_db)) -> UserRepository:
    return UserRepository(session)


def get_project_repo(session: AsyncSession = Depends(get_db)) -> ProjectRepository:
    return ProjectRepository(session)


def get_site_repo(session: AsyncSession = Depends(get_db)) -> SiteRepository:
    return SiteRepository(session)


def get_zone_repo(session: AsyncSession = Depends(get_db)) -> ZoneRepository:
    return ZoneRepository(session)


def get_sensor_repo(session: AsyncSession = Depends(get_db)) -> SensorRepository:
    return SensorRepository(session)


def get_camera_repo(session: AsyncSession = Depends(get_db)) -> CameraRepository:
    return CameraRepository(session)


def get_rule_repo(session: AsyncSession = Depends(get_db)) -> RuleRepository:
    return RuleRepository(session)


def get_alert_repo(session: AsyncSession = Depends(get_db)) -> AlertRepository:
    return AlertRepository(session)


def get_incident_repo(session: AsyncSession = Depends(get_db)) -> IncidentRepository:
    return IncidentRepository(session)


def get_project_data_repo(session: AsyncSession = Depends(get_db)) -> ProjectDataRepository:
    return ProjectDataRepository(session)


def get_notification_repo(session: AsyncSession = Depends(get_db)) -> NotificationRepository:
    return NotificationRepository(session)


def get_audit_repo(session: AsyncSession = Depends(get_db)) -> AuditRepository:
    return AuditRepository(session)


def get_outbox_repo(session: AsyncSession = Depends(get_db)) -> OutboxRepository:
    return OutboxRepository(session)


def get_rollup_repo(session: AsyncSession = Depends(get_db)) -> RollupRepository:
    return RollupRepository(session)


def get_telemetry_repo() -> TelemetryRepository:
    return TelemetryRepository(get_mongo_db())


def get_cv_repo() -> CVRepository:
    return CVRepository(get_mongo_db())


def get_event_log_repo() -> EventLogRepository:
    return EventLogRepository(get_mongo_db())


def get_storage_driver() -> StorageDriver:
    return get_storage()
