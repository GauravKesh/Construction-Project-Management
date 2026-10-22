from datetime import datetime, timezone
import pytest
from sqlalchemy import select
from app.db.models.project import Site
from app.db.repositories.rollup_repo import RollupRepository


@pytest.mark.asyncio
async def test_idempotent_kpi_rollups(db_session):
    site_res = await db_session.execute(select(Site).limit(1))
    site = site_res.scalar_one()

    rollup_repo = RollupRepository(db_session)
    now_bucket = datetime.now(timezone.utc).replace(second=0, microsecond=0)

    # 1. Upsert initial rollup
    r1 = await rollup_repo.upsert_kpi_rollup(
        site_id=site.id,
        bucket=now_bucket,
        resolution="1m",
        sensor_readings_count=100,
        sensor_uptime_pct=98.5,
        ppe_compliance_pct=95.0,
        active_alerts_count=2,
        incidents_count=0,
        metrics={"avg_temp": 26.5},
    )
    await db_session.commit()
    assert r1.sensor_readings_count == 100

    # 2. Idempotent upsert into the exact same bucket with new numbers
    r2 = await rollup_repo.upsert_kpi_rollup(
        site_id=site.id,
        bucket=now_bucket,
        resolution="1m",
        sensor_readings_count=120,
        sensor_uptime_pct=99.0,
        ppe_compliance_pct=96.0,
        active_alerts_count=1,
        incidents_count=0,
        metrics={"avg_temp": 27.0},
    )
    await db_session.commit()

    # Read rollups back from DB
    rollups = await rollup_repo.get_kpi_rollups(site_id=site.id, resolution="1m")
    same_bucket = [r for r in rollups if r.bucket == now_bucket]
    assert len(same_bucket) == 1
    assert same_bucket[0].sensor_readings_count == 120


@pytest.mark.asyncio
async def test_analytics_endpoints(async_client, admin_headers, db_session):
    site_res = await db_session.execute(select(Site).limit(1))
    site = site_res.scalar_one()

    # 1. KPIs endpoint
    kpi_resp = await async_client.get(f"/api/v1/analytics/kpis?site_id={site.id}", headers=admin_headers)
    assert kpi_resp.status_code == 200
    kpis = kpi_resp.json()
    assert "sensor_uptime_pct" in kpis
    assert "ppe_compliance_pct" in kpis

    # 2. Trends endpoint (reads from rollups)
    trend_resp = await async_client.get(f"/api/v1/analytics/trends?site_id={site.id}&resolution=1m", headers=admin_headers)
    assert trend_resp.status_code == 200
    trends = trend_resp.json()
    assert "data_points" in trends

    # 3. Predictions endpoint
    pred_resp = await async_client.get(f"/api/v1/analytics/predictions?site_id={site.id}", headers=admin_headers)
    assert pred_resp.status_code == 200
    pred = pred_resp.json()
    assert "forecast_value" in pred

    # 4. Dynamic Risk Score endpoint
    risk_resp = await async_client.get(f"/api/v1/analytics/risk-score?site_id={site.id}", headers=admin_headers)
    assert risk_resp.status_code == 200
    risk = risk_resp.json()
    assert "overall_risk_score" in risk
    assert "risk_level" in risk
