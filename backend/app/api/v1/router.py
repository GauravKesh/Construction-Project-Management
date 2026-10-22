from fastapi import APIRouter
from app.api.v1.auth import router as auth_router
from app.api.v1.projects import router as projects_router
from app.api.v1.sites import router as sites_router
from app.api.v1.zones import router as zones_router
from app.api.v1.sensors import router as sensors_router
from app.api.v1.cameras import router as cameras_router
from app.api.v1.cv import router as cv_router
from app.api.v1.rules import router as rules_router
from app.api.v1.alerts import router as alerts_router
from app.api.v1.incidents import router as incidents_router
from app.api.v1.analytics import router as analytics_router
from app.api.v1.notifications import router as notifications_router
from app.api.v1.search import router as search_router
from app.api.v1.storage import router as storage_router
from app.api.v1.health import router as health_router

api_v1_router = APIRouter(prefix="/api/v1")

api_v1_router.include_router(auth_router)
api_v1_router.include_router(projects_router)
api_v1_router.include_router(sites_router)
api_v1_router.include_router(zones_router)
api_v1_router.include_router(sensors_router)
api_v1_router.include_router(cameras_router)
api_v1_router.include_router(cv_router)
api_v1_router.include_router(rules_router)
api_v1_router.include_router(alerts_router)
api_v1_router.include_router(incidents_router)
api_v1_router.include_router(analytics_router)
api_v1_router.include_router(notifications_router)
api_v1_router.include_router(search_router)
api_v1_router.include_router(storage_router)
api_v1_router.include_router(health_router)
