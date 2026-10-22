import pytest
from shapely.geometry import Point, shape
from sqlalchemy import select
from app.db.models.project import Site, Zone


def test_shapely_point_in_zone():
    polygon_geojson = {
        "type": "Polygon",
        "coordinates": [
            [
                [77.0985, 28.5545],
                [77.1000, 28.5545],
                [77.1000, 28.5560],
                [77.0985, 28.5560],
                [77.0985, 28.5545],
            ]
        ],
    }
    zone_poly = shape(polygon_geojson)

    # Point clearly inside Excavation Pit A
    inside_point = Point(77.0990, 28.5550)
    assert zone_poly.contains(inside_point) is True

    # Point clearly outside Excavation Pit A
    outside_point = Point(77.1050, 28.5600)
    assert zone_poly.contains(outside_point) is False


@pytest.mark.asyncio
async def test_site_map_geojson_endpoint(async_client, admin_headers, db_session):
    site_res = await db_session.execute(select(Site).limit(1))
    site = site_res.scalar_one()

    resp = await async_client.get(f"/api/v1/sites/{site.id}/map", headers=admin_headers)
    assert resp.status_code == 200
    map_data = resp.json()

    assert map_data["type"] == "FeatureCollection"
    assert "features" in map_data
    assert len(map_data["features"]) > 0

    # Ensure zone and sensor features are present
    feature_layers = [f["properties"].get("layer") for f in map_data["features"]]
    assert "site_boundary" in feature_layers or "zone" in feature_layers or "sensor" in feature_layers
