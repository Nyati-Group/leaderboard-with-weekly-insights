from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from app.core.database import Session
from pydantic import BaseModel, ConfigDict
from datetime import date
from app.core.database import get_db
from app.models.sites import Site, SiteMetadata, ProjectBaseline
from app.schemas.common import StandardResponse, ResponseMeta
from app.api.deps import get_current_user, AuthenticatedUserContext

router = APIRouter(prefix="/sites", tags=["Site Portfolio & Baselines"])

class SiteMetadataSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    client_name: str
    contract_value: float
    budgeted_cost: float
    currency: str

class SiteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: str
    name: str
    location: str
    status: str
    project_type: str
    start_date: date
    target_completion_date: date
    metadata: Optional[SiteMetadataSchema] = None

@router.get("", response_model=StandardResponse[List[SiteResponse]])
def list_sites(
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(get_current_user)
):
    query = db.query(Site)
    
    # Enforce site-level scoping for field roles
    if not current_user.has_global_scope:
        query = query.filter(Site.id.in_(current_user.assigned_site_ids))
        
    sites = query.order_by(Site.id).all()
    results = []
    for s in sites:
        meta = None
        if s.metadata_rel:
            meta = SiteMetadataSchema(
                client_name=s.metadata_rel.client_name,
                contract_value=float(s.metadata_rel.contract_value),
                budgeted_cost=float(s.metadata_rel.budgeted_cost),
                currency=s.metadata_rel.currency
            )
        results.append(SiteResponse(
            id=s.id,
            name=s.name,
            location=s.location,
            status=s.status,
            project_type=s.project_type,
            start_date=s.start_date,
            target_completion_date=s.target_completion_date,
            metadata=meta
        ))
    return StandardResponse(data=results, meta=ResponseMeta())

@router.get("/{site_id}", response_model=StandardResponse[SiteResponse])
def get_site(
    site_id: str,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(get_current_user)
):
    # Verify horizontal authorization
    if not current_user.can_access_site(site_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Cross-site access denied: User {current_user.email} is not authorized for site {site_id}."
        )

    s = db.query(Site).filter(Site.id == site_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Site not found")
    meta = None
    if s.metadata_rel:
        meta = SiteMetadataSchema(
            client_name=s.metadata_rel.client_name,
            contract_value=float(s.metadata_rel.contract_value),
            budgeted_cost=float(s.metadata_rel.budgeted_cost),
            currency=s.metadata_rel.currency
        )
    return StandardResponse(
        data=SiteResponse(
            id=s.id,
            name=s.name,
            location=s.location,
            status=s.status,
            project_type=s.project_type,
            start_date=s.start_date,
            target_completion_date=s.target_completion_date,
            metadata=meta
        ),
        meta=ResponseMeta()
    )
