import uuid
from datetime import datetime, timezone
import pytest
from sqlalchemy import select
from app.db.models.alert import Alert, AlertSeverity, AlertStatus
from app.db.models.outbox import OutboxEvent
from app.db.models.project import Site
from app.db.repositories.outbox_repo import OutboxRepository


@pytest.mark.asyncio
async def test_transactional_outbox_atomic_commit(db_session):
    site_res = await db_session.execute(select(Site).limit(1))
    site = site_res.scalar_one()

    outbox_repo = OutboxRepository(db_session)

    # In one transaction: create Alert and OutboxEvent
    alert = Alert(
        site_id=site.id,
        alert_type="sensor_threshold",
        severity=AlertSeverity.WARNING,
        status=AlertStatus.ACTIVE,
        message="Outbox test alert",
    )
    db_session.add(alert)
    await db_session.flush()

    outbox_event = await outbox_repo.add_event(
        event_type="alert:new",
        aggregate_type="alert",
        aggregate_id=str(alert.id),
        payload={"alert_id": str(alert.id), "site_id": str(site.id)},
    )

    await db_session.commit()

    # Query outbox events
    event = await outbox_repo.get_by_id(outbox_event.id)
    assert event is not None
    assert event.status == "pending"

    # Mark as published
    await outbox_repo.mark_published(outbox_event.id)
    await db_session.commit()

    # Verify published status
    await db_session.refresh(outbox_event)
    assert outbox_event.status == "published"
    assert outbox_event.published_at is not None

    # Cleanup
    await db_session.delete(outbox_event)
    await db_session.delete(alert)
    await db_session.commit()


@pytest.mark.asyncio
async def test_outbox_rollback_atomicity(db_session):
    site_res = await db_session.execute(select(Site).limit(1))
    site = site_res.scalar_one()

    outbox_repo = OutboxRepository(db_session)
    unique_msg = f"Rollback test {uuid.uuid4()}"

    alert = Alert(
        site_id=site.id,
        alert_type="sensor_threshold",
        severity=AlertSeverity.INFO,
        status=AlertStatus.ACTIVE,
        message=unique_msg,
    )
    db_session.add(alert)
    await db_session.flush()

    outbox_event = await outbox_repo.add_event(
        event_type="alert:new",
        aggregate_type="alert",
        aggregate_id=str(alert.id),
        payload={"alert_id": str(alert.id)},
    )

    # Roll back transaction
    await db_session.rollback()

    # Verify neither alert nor outbox event exists
    check_alert = await db_session.execute(select(Alert).where(Alert.message == unique_msg))
    assert check_alert.scalar_one_or_none() is None

    check_outbox = await db_session.execute(select(OutboxEvent).where(OutboxEvent.id == outbox_event.id))
    assert check_outbox.scalar_one_or_none() is None
