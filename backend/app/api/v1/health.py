from fastapi import APIRouter, Depends, status
from app.core.database import Session
from app.core.odm import text
from app.core.config import settings
from app.core.database import get_db
from app.schemas.common import StandardResponse, ResponseMeta

router = APIRouter(prefix="/health", tags=["Health & Diagnostics"])

@router.get("", response_model=StandardResponse[dict])
def health_check():
    return StandardResponse(
        success=True,
        data={
            "status": "healthy",
            "environment": settings.ENVIRONMENT,
            "version": settings.VERSION,
            "project": settings.PROJECT_NAME
        },
        meta=ResponseMeta()
    )

@router.get("/db", response_model=StandardResponse[dict])
def health_db_check(db: Session = Depends(get_db)):
    try:
        db.execute(text("ping"))
        return StandardResponse(
            success=True,
            data={
                "status": "connected",
                "engine": "mongodb",
                "database": settings.MONGODB_DB_NAME
            },
            meta=ResponseMeta()
        )
    except Exception as e:
        return StandardResponse(
            success=False,
            data={"status": "disconnected"},
            error={"code": "DB_CONNECTION_ERROR", "message": str(e)},
            meta=ResponseMeta()
        )
