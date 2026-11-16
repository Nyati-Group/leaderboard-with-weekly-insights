from typing import List, Optional
from datetime import date
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, ConfigDict

from app.core.database import get_db
from app.models.quality_safety import (
    QualityInspection,
    QualityChecklistItem,
    QualityDefect,
    NCRRecord,
    ReworkRecord
)
from app.models.sites import Site
from app.api.deps import get_current_user, AuthenticatedUserContext, require_roles
from app.schemas.common import StandardResponse, ResponseMeta

router = APIRouter(prefix="/quality", tags=["Quality Management & NCRs"])

# Schemas
class ChecklistItemInput(BaseModel):
    parameter: str
    is_compliant: bool = True
    comments: Optional[str] = None
    evidence_url: Optional[str] = None

class ChecklistItemResponse(ChecklistItemInput):
    id: str
    model_config = ConfigDict(from_attributes=True)

class QualityInspectionCreateRequest(BaseModel):
    site_id: str
    inspection_date: date
    inspection_type: str
    wbs_location: str
    outcome: str = "PASS"  # PASS, CONDITIONAL_PASS, FAIL
    remarks: Optional[str] = None
    checklist_items: List[ChecklistItemInput] = []

class QualityInspectionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    site_id: str
    inspection_date: date
    inspector_id: str
    inspection_type: str
    wbs_location: str
    outcome: str
    remarks: Optional[str] = None
    checklist_items: List[ChecklistItemResponse] = []

class NCRCreateRequest(BaseModel):
    site_id: str
    ncr_number: str
    issued_to: str
    root_cause: str
    corrective_action_required: str
    defect_description: Optional[str] = None
    defect_severity: Optional[str] = "MAJOR"
    estimated_rework_cost: Optional[float] = 0.0
    estimated_delay_days: Optional[int] = 0

class NCRResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    site_id: str
    ncr_number: str
    issued_to: str
    root_cause: Optional[str] = None
    corrective_action_required: Optional[str] = None
    status: str
    closure_date: Optional[date] = None
    rework_cost: float = 0.0
    delay_days: int = 0

@router.get("/inspections", response_model=StandardResponse[List[QualityInspectionResponse]])
def list_quality_inspections(
    site_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(get_current_user)
):
    query = db.query(QualityInspection)
    if site_id:
        if not current_user.can_access_site(site_id):
            raise HTTPException(status_code=403, detail="Cross-site access denied.")
        query = query.filter(QualityInspection.site_id == site_id)
    else:
        if not current_user.has_global_scope:
            query = query.filter(QualityInspection.site_id.in_(current_user.assigned_site_ids))

    inspections = query.order_by(QualityInspection.inspection_date.desc()).all()
    results = [
        QualityInspectionResponse(
            id=str(i.id),
            site_id=i.site_id,
            inspection_date=i.inspection_date,
            inspector_id=str(i.inspector_id),
            inspection_type=i.inspection_type,
            wbs_location=i.wbs_location,
            outcome=i.outcome,
            remarks=i.remarks,
            checklist_items=[
                ChecklistItemResponse(
                    id=str(c.id),
                    parameter=c.parameter,
                    is_compliant=c.is_compliant,
                    comments=c.comments,
                    evidence_url=c.evidence_url
                )
                for c in i.checklist_items
            ]
        )
        for i in inspections
    ]
    return StandardResponse(data=results, meta=ResponseMeta())

@router.post("/inspections", response_model=StandardResponse[QualityInspectionResponse], status_code=status.HTTP_201_CREATED)
def create_quality_inspection(
    payload: QualityInspectionCreateRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(require_roles("QUALITY_OFFICER", "PROJECT_CONTROLLER"))
):
    if not current_user.can_access_site(payload.site_id):
        raise HTTPException(status_code=403, detail="Cross-site access denied.")

    inspection = QualityInspection(
        site_id=payload.site_id,
        inspection_date=payload.inspection_date,
        inspector_id=current_user.id,
        inspection_type=payload.inspection_type,
        wbs_location=payload.wbs_location,
        outcome=payload.outcome,
        remarks=payload.remarks
    )
    db.add(inspection)
    db.flush()

    for item in payload.checklist_items:
        db.add(QualityChecklistItem(
            inspection_id=inspection.id,
            parameter=item.parameter,
            is_compliant=item.is_compliant,
            comments=item.comments,
            evidence_url=item.evidence_url
        ))

    db.commit()
    db.refresh(inspection)

    return StandardResponse(
        data=QualityInspectionResponse(
            id=str(inspection.id),
            site_id=inspection.site_id,
            inspection_date=inspection.inspection_date,
            inspector_id=str(inspection.inspector_id),
            inspection_type=inspection.inspection_type,
            wbs_location=inspection.wbs_location,
            outcome=inspection.outcome,
            remarks=inspection.remarks,
            checklist_items=[
                ChecklistItemResponse(
                    id=str(c.id),
                    parameter=c.parameter,
                    is_compliant=c.is_compliant,
                    comments=c.comments,
                    evidence_url=c.evidence_url
                )
                for c in inspection.checklist_items
            ]
        ),
        meta=ResponseMeta()
    )

@router.get("/ncrs", response_model=StandardResponse[List[NCRResponse]])
def list_ncrs(
    site_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(get_current_user)
):
    query = db.query(NCRRecord)
    if site_id:
        if not current_user.can_access_site(site_id):
            raise HTTPException(status_code=403, detail="Cross-site access denied.")
        query = query.filter(NCRRecord.site_id == site_id)
    else:
        if not current_user.has_global_scope:
            query = query.filter(NCRRecord.site_id.in_(current_user.assigned_site_ids))

    ncrs = query.order_by(NCRRecord.created_at.desc()).all()
    results = [
        NCRResponse(
            id=str(n.id),
            site_id=n.site_id,
            ncr_number=n.ncr_number,
            issued_to=n.issued_to,
            root_cause=n.root_cause,
            corrective_action_required=n.corrective_action_required,
            status=n.status,
            closure_date=n.closure_date,
            rework_cost=float(n.rework.cost_impact) if n.rework else 0.0,
            delay_days=n.rework.schedule_impact_days if n.rework else 0
        )
        for n in ncrs
    ]
    return StandardResponse(data=results, meta=ResponseMeta())

@router.post("/ncrs", response_model=StandardResponse[NCRResponse], status_code=status.HTTP_201_CREATED)
def issue_ncr(
    payload: NCRCreateRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(require_roles("QUALITY_OFFICER", "PROJECT_CONTROLLER"))
):
    if not current_user.can_access_site(payload.site_id):
        raise HTTPException(status_code=403, detail="Cross-site access denied.")

    existing = db.query(NCRRecord).filter(NCRRecord.ncr_number == payload.ncr_number).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"NCR number '{payload.ncr_number}' already exists.")

    defect = None
    if payload.defect_description:
        defect = QualityDefect(
            site_id=payload.site_id,
            severity=payload.defect_severity or "MAJOR",
            description=payload.defect_description,
            detected_date=date.today(),
            status="OPEN"
        )
        db.add(defect)
        db.flush()

    ncr = NCRRecord(
        site_id=payload.site_id,
        defect_id=defect.id if defect else None,
        ncr_number=payload.ncr_number,
        issued_to=payload.issued_to,
        root_cause=payload.root_cause,
        corrective_action_required=payload.corrective_action_required,
        status="ISSUED"
    )
    db.add(ncr)
    db.flush()

    if payload.estimated_rework_cost or payload.estimated_delay_days:
        rework = ReworkRecord(
            ncr_id=ncr.id,
            site_id=payload.site_id,
            cost_impact=payload.estimated_rework_cost or 0.0,
            schedule_impact_days=payload.estimated_delay_days or 0,
            description=f"Rework required for {ncr.ncr_number}"
        )
        db.add(rework)

    db.commit()
    db.refresh(ncr)

    return StandardResponse(
        data=NCRResponse(
            id=str(ncr.id),
            site_id=ncr.site_id,
            ncr_number=ncr.ncr_number,
            issued_to=ncr.issued_to,
            root_cause=ncr.root_cause,
            corrective_action_required=ncr.corrective_action_required,
            status=ncr.status,
            rework_cost=float(ncr.rework.cost_impact) if ncr.rework else 0.0,
            delay_days=ncr.rework.schedule_impact_days if ncr.rework else 0
        ),
        meta=ResponseMeta()
    )

@router.put("/ncrs/{ncr_id}/close", response_model=StandardResponse[NCRResponse])
def close_ncr(
    ncr_id: str,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(require_roles("QUALITY_OFFICER", "PROJECT_CONTROLLER"))
):
    ncr = db.query(NCRRecord).filter(NCRRecord.id == ncr_id).first()
    if not ncr:
        raise HTTPException(status_code=404, detail="NCR record not found.")

    if not current_user.can_access_site(ncr.site_id):
        raise HTTPException(status_code=403, detail="Cross-site access denied.")

    ncr.status = "CLOSED"
    ncr.closure_date = date.today()
    if ncr.defect:
        ncr.defect.status = "VERIFIED_CLOSED"
        ncr.defect.resolved_date = date.today()

    db.commit()
    db.refresh(ncr)

    return StandardResponse(
        data=NCRResponse(
            id=str(ncr.id),
            site_id=ncr.site_id,
            ncr_number=ncr.ncr_number,
            issued_to=ncr.issued_to,
            root_cause=ncr.root_cause,
            corrective_action_required=ncr.corrective_action_required,
            status=ncr.status,
            closure_date=ncr.closure_date,
            rework_cost=float(ncr.rework.cost_impact) if ncr.rework else 0.0,
            delay_days=ncr.rework.schedule_impact_days if ncr.rework else 0
        ),
        meta=ResponseMeta()
    )
