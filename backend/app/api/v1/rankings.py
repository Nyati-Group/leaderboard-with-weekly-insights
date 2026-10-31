from typing import List, Optional
import uuid
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.deps import get_current_user, AuthenticatedUserContext
from app.models.rankings import RankingSnapshot, RankingMethodology, KRADefinition
from app.schemas.rankings import (
    RankingSnapshotSchema, RankingMethodologySchema,
    CalculateRankingRequest, KRADefinitionSchema
)
from app.services.ranking_service import RankingService

router = APIRouter(prefix="/rankings", tags=["Authoritative 8-KRA Rankings"])

@router.get("/methodologies/active", response_model=RankingMethodologySchema)
def get_active_methodology(
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(get_current_user)
):
    """
    Returns the currently active, approved 8-KRA ranking methodology and weights.
    """
    try:
        return RankingService.get_active_methodology(db)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

@router.get("/definitions", response_model=List[KRADefinitionSchema])
def get_kra_definitions(
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(get_current_user)
):
    """
    Returns the 8 KRA definitions.
    """
    return db.query(KRADefinition).order_by(KRADefinition.id).all()

@router.get("/leaderboard", response_model=List[RankingSnapshotSchema])
def get_leaderboard(
    period_id: str = Query("2026-W44", description="Ranking period code e.g. 2026-W44"),
    auto_calculate: bool = Query(True, description="Calculate if no snapshot exists"),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(get_current_user)
):
    """
    Returns the authoritative leaderboard for all sites for the specified period.
    """
    snapshots = db.query(RankingSnapshot).filter(
        RankingSnapshot.period_id == period_id
    ).order_by(
        RankingSnapshot.ranking_position.asc().nullslast()
    ).all()

    if not snapshots and auto_calculate:
        snapshots = RankingService.calculate_leaderboard(db, period_id=period_id)

    # Attach site_name to response
    result = []
    for s in snapshots:
        schema = RankingSnapshotSchema.model_validate(s)
        schema.site_name = s.site.name if s.site else s.site_id
        result.append(schema)

    return result

@router.post("/calculate", response_model=List[RankingSnapshotSchema])
def calculate_leaderboard(
    payload: CalculateRankingRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(get_current_user)
):
    """
    Triggers authoritative recalculation of the 8-KRA leaderboard for a period.
    Only Project Controllers and Org Admins may trigger calculation.
    """
    user_roles = set(current_user.roles)
    if not user_roles.intersection({"ORG_ADMIN", "PROJECT_CONTROLLER"}):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Project Controllers and Organization Admins can trigger official ranking calculations."
        )

    snapshots = RankingService.calculate_leaderboard(
        db,
        period_id=payload.period_id,
        methodology_id=str(payload.methodology_id) if payload.methodology_id else None
    )

    result = []
    for s in snapshots:
        schema = RankingSnapshotSchema.model_validate(s)
        schema.site_name = s.site.name if s.site else s.site_id
        result.append(schema)

    return result

@router.get("/sites/{site_id}/breakdown", response_model=RankingSnapshotSchema)
def get_site_ranking_breakdown(
    site_id: str,
    period_id: str = Query("2026-W44"),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(get_current_user)
):
    """
    Returns transparent audit breakdown and score components for a specific site.
    """
    snapshot = db.query(RankingSnapshot).filter(
        RankingSnapshot.site_id == site_id,
        RankingSnapshot.period_id == period_id
    ).first()

    if not snapshot:
        # Calculate for this period
        RankingService.calculate_leaderboard(db, period_id=period_id)
        snapshot = db.query(RankingSnapshot).filter(
            RankingSnapshot.site_id == site_id,
            RankingSnapshot.period_id == period_id
        ).first()

    if not snapshot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Snapshot not found for site.")

    schema = RankingSnapshotSchema.model_validate(snapshot)
    schema.site_name = snapshot.site.name if snapshot.site else site_id
    return schema
