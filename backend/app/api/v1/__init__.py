from fastapi import APIRouter
from app.api.v1.health import router as health_router
from app.api.v1.sites import router as sites_router
from app.api.v1.auth import router as auth_router
from app.api.v1.users import router as users_router
from app.api.v1.daily_reports import router as daily_reports_router
from app.api.v1.quality import router as quality_router
from app.api.v1.safety import router as safety_router
from app.api.v1.actions import router as actions_router
from app.api.v1.rankings import router as rankings_router
from app.api.v1.weekly_insights import router as weekly_insights_router
from app.api.v1.analytics import router as analytics_router

api_v1_router = APIRouter()
api_v1_router.include_router(health_router)
api_v1_router.include_router(auth_router)
api_v1_router.include_router(users_router)
api_v1_router.include_router(sites_router)
api_v1_router.include_router(daily_reports_router)
api_v1_router.include_router(quality_router)
api_v1_router.include_router(safety_router)
api_v1_router.include_router(actions_router)
api_v1_router.include_router(rankings_router)
api_v1_router.include_router(weekly_insights_router)
api_v1_router.include_router(analytics_router)
