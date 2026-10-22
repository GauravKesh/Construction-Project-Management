import pytest
from app.processing.analytics import analytics_engine


def test_forecast_extrapolates_from_last_observation():
    # y = 2x + 10 for x = 0..9; one step after the last point (x = 10) is 30
    history = [2 * x + 10 for x in range(10)]
    pred = analytics_engine.predict_forecast(history, horizon_steps=1)
    assert pred["forecast_value"] == pytest.approx(30.0)
    assert pred["current_value"] == pytest.approx(28.0)
    assert pred["trend_direction"] == "increasing"
    assert pred["n_observations"] == 10


def test_prediction_interval_widens_with_horizon_and_contains_forecast():
    history = [50, 52, 49, 53, 51, 54, 50, 55, 52, 56]
    near = analytics_engine.predict_forecast(history, horizon_steps=1)
    far = analytics_engine.predict_forecast(history, horizon_steps=48)
    for p in (near, far):
        low, high = p["confidence_interval"]
        assert low <= p["forecast_value"] <= high
    assert (far["confidence_interval"][1] - far["confidence_interval"][0]) > (
        near["confidence_interval"][1] - near["confidence_interval"][0]
    )


def test_noisy_flat_series_is_stable():
    history = [50, 53, 47, 52, 48, 51, 49, 52, 48, 50]
    assert analytics_engine.predict_forecast(history, horizon_steps=1)["trend_direction"] == "stable"


@pytest.mark.parametrize("history", [[], [42.0], [42.0, 43.0], [None, None]])
def test_too_little_data_produces_no_forecast(history):
    pred = analytics_engine.predict_forecast(history, horizon_steps=24)
    assert pred["trend_direction"] == "insufficient_data"
    assert pred["forecast_value"] is None
    assert pred["confidence_interval"] is None


@pytest.mark.asyncio
async def test_predictions_endpoint_does_not_fabricate_history(async_client, admin_headers, db_session):
    import uuid
    # A site id with no rollups must not yield a forecast
    resp = await async_client.get(
        f"/api/v1/analytics/predictions?site_id={uuid.uuid4()}&metric=ppe_compliance", headers=admin_headers
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["n_observations"] == 0
    assert body["forecast_value"] is None
    assert body["trend_direction"] == "insufficient_data"


@pytest.mark.asyncio
async def test_ppe_summary_without_frames_is_unknown_not_perfect():
    import uuid
    summary = await analytics_engine.cv_repo.get_ppe_summary(site_id=str(uuid.uuid4()))
    assert summary["total_frames"] == 0
    assert summary["compliance_rate"] is None
    assert summary["person_compliance_rate"] is None
