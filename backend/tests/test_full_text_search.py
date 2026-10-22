import uuid
import pytest
from sqlalchemy import select
from app.db.models.alert import Alert, AlertSeverity, AlertStatus
from app.db.models.incident import Incident, IncidentStatus
from app.db.models.project import Site


@pytest.mark.asyncio
async def test_postgresql_full_text_search_alerts(async_client, admin_headers, db_session):
    site_res = await db_session.execute(select(Site).limit(1))
    site = site_res.scalar_one()

    # Create an alert with searchable keywords
    unique_keyword = "HazardousMethaneLeakDetected"
    alert = Alert(
        site_id=site.id,
        alert_type="sensor_threshold",
        severity=AlertSeverity.CRITICAL,
        status=AlertStatus.ACTIVE,
        message=f"Critical safety breach: {unique_keyword} in underground tunnel",
    )
    db_session.add(alert)
    await db_session.commit()

    # Search for this alert via API
    resp = await async_client.get(
        f"/api/v1/search?q={unique_keyword}&type=alerts",
        headers=admin_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_results"] >= 1
    found_messages = [item["description"] for item in data["results"]]
    assert any(unique_keyword in m for m in found_messages)

    # Cleanup
    await db_session.delete(alert)
    await db_session.commit()


@pytest.mark.asyncio
async def test_postgresql_full_text_search_incidents(async_client, admin_headers, db_session):
    site_res = await db_session.execute(select(Site).limit(1))
    site = site_res.scalar_one()

    unique_title = "ScaffoldingCollapseZone7"
    incident = Incident(
        site_id=site.id,
        incident_number=f"INC-FTS-{uuid.uuid4().hex[:6]}",
        title=f"Emergency: {unique_title}",
        description="Detailed incident narrative with high-stress structural failure details.",
        severity=AlertSeverity.CRITICAL,
        status=IncidentStatus.OPEN,
    )
    db_session.add(incident)
    await db_session.commit()

    # Search for this incident
    resp = await async_client.get(
        f"/api/v1/search?q={unique_title}&type=incidents",
        headers=admin_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_results"] >= 1
    found_titles = [item["title"] for item in data["results"]]
    assert any(unique_title in t for t in found_titles)

    # Cleanup
    await db_session.delete(incident)
    await db_session.commit()
