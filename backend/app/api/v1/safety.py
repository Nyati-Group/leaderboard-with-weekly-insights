from typing import List, Optional
from datetime import date
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from app.core.database import Session
from pydantic import BaseModel, ConfigDict

from app.core.database import get_db
from app.models.quality_safety import (
    SafetyInspection,
    SafetyChecklistItem,
    SafetyObservation,
    SafetyIncident,
    SafetyEvidence
)
from app.api.deps import get_current_user, AuthenticatedUserContext, require_roles
from app.schemas.common import StandardResponse, ResponseMeta

router = APIRouter(prefix="/safety", tags=["Manual Safety Management (No CCTV)"])

# Schemas
class SafetyChecklistItemInput(BaseModel):
    category: str  # PPE_COMPLIANCE, SCAFFOLDING, ELECTRICAL, HOUSEKEEPING, FIRE_SAFETY, EXCAVATION
    item_description: str
    is_compliant: bool = True
    severity: str = "LOW"  # LOW, MEDIUM, HIGH, CRITICAL
    corrective_action_required: bool = False
    comments: Optional[str] = None

class SafetyChecklistItemResponse(SafetyChecklistItemInput):
    id: str
    model_config = ConfigDict(from_attributes=True)

class SafetyInspectionCreateRequest(BaseModel):
    site_id: str
    inspection_date: date
    inspection_type: str  # WEEKLY_AUDIT, ROUTINE_WALKTHROUGH, SCAFFOLD_INSPECTION, ELECTRICAL_CHECK
    remarks: Optional[str] = None
    checklist_items: List[SafetyChecklistItemInput] = []

class SafetyInspectionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    site_id: str
    inspection_date: date
    inspector_id: str
    inspection_type: str
    compliance_score_pct: float
    remarks: Optional[str] = None
    checklist_items: List[SafetyChecklistItemResponse] = []

class SafetyObservationCreateRequest(BaseModel):
    site_id: str
    observation_date: date
    category: str
    severity: str = "LOW"  # LOW, MEDIUM, HIGH, STOP_WORK
    description: str

class SafetyObservationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    site_id: str
    observer_id: str
    observation_date: date
    category: str
    severity: str
    description: str
    status: str

class SafetyIncidentCreateRequest(BaseModel):
    site_id: str
    incident_date: date
    severity: str  # NEAR_MISS, FIRST_AID, MEDICAL_TREATMENT, LOST_TIME, FATALITY
    title: str
    description: str
    injured_count: int = 0
    lost_time_hours: float = 0.0
    root_cause: Optional[str] = None

class SafetyIncidentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    site_id: str
    incident_date: date
    severity: str
    title: str
    description: str
    injured_count: int
    lost_time_hours: float
    root_cause: Optional[str] = None
    status: str

# Endpoints
@router.get("/inspections", response_model=StandardResponse[List[SafetyInspectionResponse]])
def list_safety_inspections(
    site_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(get_current_user)
):
    query = db.query(SafetyInspection)
    if site_id:
        if not current_user.can_access_site(site_id):
            raise HTTPException(status_code=403, detail="Cross-site access denied.")
        query = query.filter(SafetyInspection.site_id == site_id)
    else:
        if not current_user.has_global_scope:
            query = query.filter(SafetyInspection.site_id.in_(current_user.assigned_site_ids))

    inspections = query.order_by(SafetyInspection.inspection_date.desc()).all()
    results = [
        SafetyInspectionResponse(
            id=str(s.id),
            site_id=s.site_id,
            inspection_date=s.inspection_date,
            inspector_id=str(s.inspector_id),
            inspection_type=s.inspection_type,
            compliance_score_pct=float(s.compliance_score_pct),
            remarks=s.remarks,
            checklist_items=[
                SafetyChecklistItemResponse(
                    id=str(c.id),
                    category=c.category,
                    item_description=c.item_description,
                    is_compliant=c.is_compliant,
                    severity=c.severity,
                    corrective_action_required=c.corrective_action_required,
                    comments=c.comments
                )
                for c in s.checklist_items
            ]
        )
        for s in inspections
    ]
    return StandardResponse(data=results, meta=ResponseMeta())

@router.post("/inspections", response_model=StandardResponse[SafetyInspectionResponse], status_code=status.HTTP_201_CREATED)
def create_safety_inspection(
    payload: SafetyInspectionCreateRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(require_roles("SAFETY_OFFICER", "PROJECT_CONTROLLER"))
):
    if not current_user.can_access_site(payload.site_id):
        raise HTTPException(status_code=403, detail="Cross-site access denied.")

    # Calculate compliance score percentage from items
    total_items = len(payload.checklist_items)
    compliant_items = sum(1 for item in payload.checklist_items if item.is_compliant)
    score_pct = (compliant_items / total_items * 100.0) if total_items > 0 else 100.0

    inspection = SafetyInspection(
        site_id=payload.site_id,
        inspection_date=payload.inspection_date,
        inspector_id=current_user.id,
        inspection_type=payload.inspection_type,
        compliance_score_pct=round(score_pct, 2),
        remarks=payload.remarks
    )
    db.add(inspection)
    db.flush()

    for item in payload.checklist_items:
        db.add(SafetyChecklistItem(
            safety_inspection_id=inspection.id,
            category=item.category,
            item_description=item.item_description,
            is_compliant=item.is_compliant,
            severity=item.severity,
            corrective_action_required=item.corrective_action_required,
            comments=item.comments
        ))

    db.commit()
    db.refresh(inspection)

    return StandardResponse(
        data=SafetyInspectionResponse(
            id=str(inspection.id),
            site_id=inspection.site_id,
            inspection_date=inspection.inspection_date,
            inspector_id=str(inspection.inspector_id),
            inspection_type=inspection.inspection_type,
            compliance_score_pct=float(inspection.compliance_score_pct),
            remarks=inspection.remarks,
            checklist_items=[
                SafetyChecklistItemResponse(
                    id=str(c.id),
                    category=c.category,
                    item_description=c.item_description,
                    is_compliant=c.is_compliant,
                    severity=c.severity,
                    corrective_action_required=c.corrective_action_required,
                    comments=c.comments
                )
                for c in inspection.checklist_items
            ]
        ),
        meta=ResponseMeta()
    )

@router.get("/observations", response_model=StandardResponse[List[SafetyObservationResponse]])
def list_safety_observations(
    site_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(get_current_user)
):
    query = db.query(SafetyObservation)
    if site_id:
        if not current_user.can_access_site(site_id):
            raise HTTPException(status_code=403, detail="Cross-site access denied.")
        query = query.filter(SafetyObservation.site_id == site_id)
    else:
        if not current_user.has_global_scope:
            query = query.filter(SafetyObservation.site_id.in_(current_user.assigned_site_ids))

    obs = query.order_by(SafetyObservation.observation_date.desc()).all()
    results = [
        SafetyObservationResponse(
            id=str(o.id),
            site_id=o.site_id,
            observer_id=str(o.observer_id),
            observation_date=o.observation_date,
            category=o.category,
            severity=o.severity,
            description=o.description,
            status=o.status
        )
        for o in obs
    ]
    return StandardResponse(data=results, meta=ResponseMeta())

@router.post("/observations", response_model=StandardResponse[SafetyObservationResponse], status_code=status.HTTP_201_CREATED)
def report_safety_observation(
    payload: SafetyObservationCreateRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(require_roles("SAFETY_OFFICER", "SITE_MANAGER", "ORG_ADMIN", "PROJECT_CONTROLLER"))
):
    if not current_user.can_access_site(payload.site_id):
        raise HTTPException(status_code=403, detail="Cross-site access denied.")

    obs = SafetyObservation(
        site_id=payload.site_id,
        observer_id=current_user.id,
        observation_date=payload.observation_date,
        category=payload.category,
        severity=payload.severity,
        description=payload.description,
        status="REPORTED"
    )
    db.add(obs)
    db.commit()
    db.refresh(obs)

    return StandardResponse(
        data=SafetyObservationResponse(
            id=str(obs.id),
            site_id=obs.site_id,
            observer_id=str(obs.observer_id),
            observation_date=obs.observation_date,
            category=obs.category,
            severity=obs.severity,
            description=obs.description,
            status=obs.status
        ),
        meta=ResponseMeta()
    )

@router.get("/incidents", response_model=StandardResponse[List[SafetyIncidentResponse]])
def list_safety_incidents(
    site_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(get_current_user)
):
    query = db.query(SafetyIncident)
    if site_id:
        if not current_user.can_access_site(site_id):
            raise HTTPException(status_code=403, detail="Cross-site access denied.")
        query = query.filter(SafetyIncident.site_id == site_id)
    else:
        if not current_user.has_global_scope:
            query = query.filter(SafetyIncident.site_id.in_(current_user.assigned_site_ids))

    incidents = query.order_by(SafetyIncident.incident_date.desc()).all()
    results = [
        SafetyIncidentResponse(
            id=str(i.id),
            site_id=i.site_id,
            incident_date=i.incident_date,
            severity=i.severity,
            title=i.title,
            description=i.description,
            injured_count=i.injured_count,
            lost_time_hours=float(i.lost_time_hours),
            root_cause=i.root_cause,
            status=i.status
        )
        for i in incidents
    ]
    return StandardResponse(data=results, meta=ResponseMeta())

@router.post("/incidents", response_model=StandardResponse[SafetyIncidentResponse], status_code=status.HTTP_201_CREATED)
def report_safety_incident(
    payload: SafetyIncidentCreateRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(require_roles("SAFETY_OFFICER", "SITE_MANAGER", "ORG_ADMIN", "PROJECT_CONTROLLER"))
):
    if not current_user.can_access_site(payload.site_id):
        raise HTTPException(status_code=403, detail="Cross-site access denied.")

    incident = SafetyIncident(
        site_id=payload.site_id,
        incident_date=payload.incident_date,
        severity=payload.severity,
        title=payload.title,
        description=payload.description,
        injured_count=payload.injured_count,
        lost_time_hours=payload.lost_time_hours,
        root_cause=payload.root_cause,
        status="OPEN"
    )
    db.add(incident)
    db.commit()
    db.refresh(incident)

    return StandardResponse(
        data=SafetyIncidentResponse(
            id=str(incident.id),
            site_id=incident.site_id,
            incident_date=incident.incident_date,
            severity=incident.severity,
            title=incident.title,
            description=incident.description,
            injured_count=incident.injured_count,
            lost_time_hours=float(incident.lost_time_hours),
            root_cause=incident.root_cause,
            status=incident.status
        ),
        meta=ResponseMeta()
    )
