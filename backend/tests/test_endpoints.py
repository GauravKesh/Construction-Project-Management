import uuid
import pytest
from sqlalchemy import select
from app.db.models.project import Project, Site


@pytest.mark.asyncio
async def test_health_and_metrics_endpoints(async_client):
    # Liveness probe
    live_resp = await async_client.get("/health/live")
    assert live_resp.status_code == 200
    assert live_resp.json()["status"] == "ok"

    # Readiness probe
    ready_resp = await async_client.get("/health/ready")
    assert ready_resp.status_code == 200
    assert ready_resp.json()["status"] in ["healthy", "ready", "degraded", "ok"]

    # Prometheus metrics
    metrics_resp = await async_client.get("/metrics")
    assert metrics_resp.status_code == 200
    assert "process_cpu_seconds_total" in metrics_resp.text or "python_info" in metrics_resp.text


@pytest.mark.asyncio
async def test_auth_login(async_client):
    login_resp = await async_client.post(
        "/api/v1/auth/login",
        json={"email": "admin@buildtrack.com", "password": "Admin@123456"},
    )
    assert login_resp.status_code == 200
    data = login_resp.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_projects_crud(async_client, admin_headers):
    # List projects
    list_resp = await async_client.get("/api/v1/projects", headers=admin_headers)
    assert list_resp.status_code == 200
    projects = list_resp.json()
    assert len(projects["items"]) >= 1

    # Create project
    create_payload = {
        "name": "New Commercial Complex",
        "code": f"PRJ-COMM-{uuid.uuid4().hex[:6]}",
        "budget": 12000000.0,
        "start_date": "2026-03-01",
    }
    create_resp = await async_client.post("/api/v1/projects", json=create_payload, headers=admin_headers)
    assert create_resp.status_code == 201
    created_id = create_resp.json()["id"]

    # Cleanup
    del_resp = await async_client.delete(f"/api/v1/projects/{created_id}", headers=admin_headers)
    assert del_resp.status_code in [200, 204]


@pytest.mark.asyncio
async def test_site_sensors_and_cameras(async_client, admin_headers, db_session):
    site_res = await db_session.execute(select(Site).limit(1))
    site = site_res.scalar_one()

    # List sensors
    sensors_resp = await async_client.get(f"/api/v1/sites/{site.id}/sensors", headers=admin_headers)
    assert sensors_resp.status_code == 200
    sensors = sensors_resp.json()
    assert len(sensors["items"]) >= 1

    # List cameras
    cameras_resp = await async_client.get(f"/api/v1/sites/{site.id}/cameras", headers=admin_headers)
    assert cameras_resp.status_code == 200
    cameras = cameras_resp.json()
    assert len(cameras["items"]) >= 1


@pytest.mark.asyncio
async def test_dashboard_summary_and_ppe_summary(async_client, admin_headers, db_session):
    proj_res = await db_session.execute(select(Project).limit(1))
    project = proj_res.scalar_one()

    # Dashboard summary
    summary_resp = await async_client.get(f"/api/v1/dashboard/summary?project_id={project.id}", headers=admin_headers)
    assert summary_resp.status_code == 200
    summary = summary_resp.json()
    assert "project_id" in summary
    assert "total_sensors_count" in summary

    # Safety PPE summary
    ppe_resp = await async_client.get("/api/v1/safety/ppe/summary", headers=admin_headers)
    assert ppe_resp.status_code == 200
    ppe = ppe_resp.json()
    assert "compliance_rate" in ppe
