from typing import List, Optional, Any
from datetime import date, datetime, timezone
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from app.core.database import Session
from pydantic import BaseModel, ConfigDict, Field

from app.core.database import get_db
from app.models.operations import (
    DailyReport,
    DailyReportVersion,
    ProgressRecord,
    ManpowerRecord,
    ExpenditureRecord,
    ActivityRecord
)
from app.models.sites import Site
from app.api.deps import get_current_user, AuthenticatedUserContext, require_roles
from app.schemas.common import StandardResponse, ResponseMeta

router = APIRouter(prefix="/daily-reports", tags=["Daily Field Operations"])

# Maker-checker separation for daily field reports:
#   * Authors record and submit reports. Executive Leadership is read-only, and
#     Safety/Quality Officers log their findings in their own modules instead.
#   * Only Project Controllers review (flag/validate). Organization Admins do not
#     review operational content, mirroring the weekly report governance rule.
#   * Nobody may validate a report version they submitted themselves.
DAILY_REPORT_AUTHOR_ROLES = ("SITE_MANAGER", "PROJECT_CONTROLLER", "ORG_ADMIN")
DAILY_REPORT_REVIEWER_ROLES = ("PROJECT_CONTROLLER",)

# --- Schemas ---

class ProgressItemInput(BaseModel):
    work_package: str
    activity_name: str
    unit_of_measure: str
    planned_quantity: float
    actual_quantity: float
    cumulative_quantity: float = 0.0
    notes: Optional[str] = None

class ManpowerItemInput(BaseModel):
    trade_category: str
    contractor_name: str
    planned_count: int
    actual_count: int
    overtime_hours: float = 0.0

class ExpenditureItemInput(BaseModel):
    cost_code: str
    category: str
    planned_amount: float
    actual_amount: float
    vendor_name: Optional[str] = None
    invoice_ref: Optional[str] = None

class ActivityItemInput(BaseModel):
    name: str
    status: str = "IN_PROGRESS"  # IN_PROGRESS, COMPLETED, DELAYED, BLOCKED
    blockers: Optional[str] = None
    mitigation_steps: Optional[str] = None

class DailyReportCreateOrUpdateRequest(BaseModel):
    site_id: str
    reporting_date: date
    site_manager_remarks: Optional[str] = None
    progress_records: List[ProgressItemInput] = []
    manpower_records: List[ManpowerItemInput] = []
    expenditure_records: List[ExpenditureItemInput] = []
    activity_records: List[ActivityItemInput] = []

class ProgressItemResponse(ProgressItemInput):
    id: str
    model_config = ConfigDict(from_attributes=True)

class ManpowerItemResponse(ManpowerItemInput):
    id: str
    model_config = ConfigDict(from_attributes=True)

class ExpenditureItemResponse(ExpenditureItemInput):
    id: str
    model_config = ConfigDict(from_attributes=True)

class ActivityItemResponse(ActivityItemInput):
    id: str
    model_config = ConfigDict(from_attributes=True)

class DailyReportListItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    site_id: str
    reporting_date: date
    status: str
    current_version: int
    submitted_by: Optional[str] = None
    submitted_at: Optional[datetime] = None
    validated_by: Optional[str] = None
    validated_at: Optional[datetime] = None
    site_manager_remarks: Optional[str] = None
    flagged_reason: Optional[str] = None

class DailyReportDetailResponse(DailyReportListItemResponse):
    progress_records: List[ProgressItemResponse] = []
    manpower_records: List[ManpowerItemResponse] = []
    expenditure_records: List[ExpenditureItemResponse] = []
    activity_records: List[ActivityItemResponse] = []

class VersionSnapshotResponse(BaseModel):
    id: str
    version_number: int
    snapshot_data: Any
    change_summary: Optional[str] = None
    submitted_by: Optional[str] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class FlagReportRequest(BaseModel):
    flagged_reason: str

# --- Endpoints ---

@router.get("", response_model=StandardResponse[List[DailyReportListItemResponse]])
def list_daily_reports(
    site_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(get_current_user)
):
    query = db.query(DailyReport)

    if site_id:
        if not current_user.can_access_site(site_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Cross-site access denied: User not authorized for site {site_id}."
            )
        query = query.filter(DailyReport.site_id == site_id)
    else:
        if not current_user.has_global_scope:
            query = query.filter(DailyReport.site_id.in_(current_user.assigned_site_ids))

    reports = query.order_by(DailyReport.reporting_date.desc()).all()
    results = [
        DailyReportListItemResponse(
            id=str(r.id),
            site_id=r.site_id,
            reporting_date=r.reporting_date,
            status=r.status,
            current_version=r.current_version,
            submitted_by=str(r.submitted_by) if r.submitted_by else None,
            submitted_at=r.submitted_at,
            validated_by=str(r.validated_by) if r.validated_by else None,
            validated_at=r.validated_at,
            site_manager_remarks=r.site_manager_remarks,
            flagged_reason=r.flagged_reason
        )
        for r in reports
    ]
    return StandardResponse(data=results, meta=ResponseMeta())

@router.post("", response_model=StandardResponse[DailyReportDetailResponse], status_code=status.HTTP_201_CREATED)
def create_or_save_draft_daily_report(
    payload: DailyReportCreateOrUpdateRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(require_roles(*DAILY_REPORT_AUTHOR_ROLES))
):
    # Verify site authorization
    if not current_user.can_access_site(payload.site_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Cross-site access denied: You cannot create reports for site {payload.site_id}."
        )

    # Check site exists
    site = db.query(Site).filter(Site.id == payload.site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site does not exist.")

    # Find existing report for this site and date
    report = db.query(DailyReport).filter(
        DailyReport.site_id == payload.site_id,
        DailyReport.reporting_date == payload.reporting_date
    ).first()

    if report:
        if report.status in ["SUBMITTED", "VALIDATED", "APPROVED"]:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot edit report in '{report.status}' state directly. Request a correction or submit a revision."
            )
        # Update remarks
        report.site_manager_remarks = payload.site_manager_remarks
        
        # Clear old draft child records
        db.query(ProgressRecord).filter(ProgressRecord.daily_report_id == report.id).delete()
        db.query(ManpowerRecord).filter(ManpowerRecord.daily_report_id == report.id).delete()
        db.query(ExpenditureRecord).filter(ExpenditureRecord.daily_report_id == report.id).delete()
        db.query(ActivityRecord).filter(ActivityRecord.daily_report_id == report.id).delete()
    else:
        report = DailyReport(
            site_id=payload.site_id,
            reporting_date=payload.reporting_date,
            status="DRAFT",
            current_version=1,
            site_manager_remarks=payload.site_manager_remarks
        )
        db.add(report)
        db.flush()

    # Insert child records
    for p in payload.progress_records:
        db.add(ProgressRecord(
            daily_report_id=report.id,
            site_id=report.site_id,
            work_package=p.work_package,
            activity_name=p.activity_name,
            unit_of_measure=p.unit_of_measure,
            planned_quantity=p.planned_quantity,
            actual_quantity=p.actual_quantity,
            cumulative_quantity=p.cumulative_quantity,
            notes=p.notes
        ))

    for m in payload.manpower_records:
        db.add(ManpowerRecord(
            daily_report_id=report.id,
            site_id=report.site_id,
            trade_category=m.trade_category,
            contractor_name=m.contractor_name,
            planned_count=m.planned_count,
            actual_count=m.actual_count,
            overtime_hours=m.overtime_hours
        ))

    for e in payload.expenditure_records:
        db.add(ExpenditureRecord(
            daily_report_id=report.id,
            site_id=report.site_id,
            cost_code=e.cost_code,
            category=e.category,
            planned_amount=e.planned_amount,
            actual_amount=e.actual_amount,
            vendor_name=e.vendor_name,
            invoice_ref=e.invoice_ref
        ))

    for a in payload.activity_records:
        db.add(ActivityRecord(
            daily_report_id=report.id,
            site_id=report.site_id,
            name=a.name,
            status=a.status,
            blockers=a.blockers,
            mitigation_steps=a.mitigation_steps
        ))

    db.commit()
    db.refresh(report)

    return StandardResponse(
        data=build_daily_report_detail_response(report),
        meta=ResponseMeta()
    )

@router.get("/{report_id}", response_model=StandardResponse[DailyReportDetailResponse])
def get_daily_report_detail(
    report_id: str,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(get_current_user)
):
    report = db.query(DailyReport).filter(DailyReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Daily report not found.")

    if not current_user.can_access_site(report.site_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Cross-site access denied: User not authorized for site {report.site_id}."
        )

    return StandardResponse(
        data=build_daily_report_detail_response(report),
        meta=ResponseMeta()
    )

@router.post("/{report_id}/submit", response_model=StandardResponse[DailyReportDetailResponse])
def submit_daily_report(
    report_id: str,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(require_roles(*DAILY_REPORT_AUTHOR_ROLES))
):
    report = db.query(DailyReport).filter(DailyReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Daily report not found.")

    if not current_user.can_access_site(report.site_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cross-site access denied.")

    if report.status in ["VALIDATED", "APPROVED"]:
        raise HTTPException(status_code=400, detail="Report has already been validated and cannot be resubmitted directly.")

    # Snapshot existing report state into immutable daily_report_versions
    snapshot_payload = build_daily_report_detail_response(report).model_dump(mode="json")
    version_record = DailyReportVersion(
        daily_report_id=report.id,
        version_number=report.current_version,
        snapshot_data=snapshot_payload,
        change_summary=f"Report version {report.current_version} submitted by {current_user.email}",
        submitted_by=current_user.id
    )
    db.add(version_record)

    # Transition status
    report.status = "SUBMITTED"
    report.submitted_by = current_user.id
    report.submitted_at = datetime.now(timezone.utc)
    report.flagged_reason = None  # Clear previous flags upon clean resubmission
    
    db.commit()
    db.refresh(report)

    return StandardResponse(
        data=build_daily_report_detail_response(report),
        meta=ResponseMeta()
    )

@router.post("/{report_id}/flag", response_model=StandardResponse[DailyReportDetailResponse])
def flag_daily_report_discrepancy(
    report_id: str,
    payload: FlagReportRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(require_roles(*DAILY_REPORT_REVIEWER_ROLES))
):
    report = db.query(DailyReport).filter(DailyReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Daily report not found.")

    if not current_user.can_access_site(report.site_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cross-site access denied.")

    if report.status != "SUBMITTED":
        raise HTTPException(status_code=400, detail="Only submitted reports can be flagged for correction.")

    report.status = "FLAGGED"
    report.flagged_reason = payload.flagged_reason
    # Increment version counter so next submission is a new version
    report.current_version += 1

    db.commit()
    db.refresh(report)

    return StandardResponse(
        data=build_daily_report_detail_response(report),
        meta=ResponseMeta()
    )

@router.post("/{report_id}/validate", response_model=StandardResponse[DailyReportDetailResponse])
def validate_daily_report(
    report_id: str,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(require_roles(*DAILY_REPORT_REVIEWER_ROLES))
):
    report = db.query(DailyReport).filter(DailyReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Daily report not found.")

    if not current_user.can_access_site(report.site_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cross-site access denied.")

    if report.status != "SUBMITTED":
        raise HTTPException(status_code=400, detail="Only submitted reports can be validated.")

    if report.submitted_by is not None and str(report.submitted_by) == str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Segregation of duties: you cannot validate a daily report you submitted. "
                   "Another Project Controller must validate it."
        )

    report.status = "VALIDATED"
    report.validated_by = current_user.id
    report.validated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(report)

    return StandardResponse(
        data=build_daily_report_detail_response(report),
        meta=ResponseMeta()
    )

@router.get("/{report_id}/versions", response_model=StandardResponse[List[VersionSnapshotResponse]])
def get_report_versions(
    report_id: str,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(get_current_user)
):
    report = db.query(DailyReport).filter(DailyReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Daily report not found.")

    if not current_user.can_access_site(report.site_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cross-site access denied.")

    versions = db.query(DailyReportVersion).filter(
        DailyReportVersion.daily_report_id == report_id
    ).order_by(DailyReportVersion.version_number.desc()).all()

    results = [
        VersionSnapshotResponse(
            id=str(v.id),
            version_number=v.version_number,
            snapshot_data=v.snapshot_data,
            change_summary=v.change_summary,
            submitted_by=str(v.submitted_by) if v.submitted_by else None,
            created_at=v.created_at
        )
        for v in versions
    ]
    return StandardResponse(data=results, meta=ResponseMeta())

# --- Helper ---
def build_daily_report_detail_response(report: DailyReport) -> DailyReportDetailResponse:
    return DailyReportDetailResponse(
        id=str(report.id),
        site_id=report.site_id,
        reporting_date=report.reporting_date,
        status=report.status,
        current_version=report.current_version,
        submitted_by=str(report.submitted_by) if report.submitted_by else None,
        submitted_at=report.submitted_at,
        validated_by=str(report.validated_by) if report.validated_by else None,
        validated_at=report.validated_at,
        site_manager_remarks=report.site_manager_remarks,
        flagged_reason=report.flagged_reason,
        progress_records=[
            ProgressItemResponse(
                id=str(p.id),
                work_package=p.work_package,
                activity_name=p.activity_name,
                unit_of_measure=p.unit_of_measure,
                planned_quantity=float(p.planned_quantity),
                actual_quantity=float(p.actual_quantity),
                cumulative_quantity=float(p.cumulative_quantity),
                notes=p.notes
            )
            for p in report.progress_records
        ],
        manpower_records=[
            ManpowerItemResponse(
                id=str(m.id),
                trade_category=m.trade_category,
                contractor_name=m.contractor_name,
                planned_count=m.planned_count,
                actual_count=m.actual_count,
                overtime_hours=float(m.overtime_hours)
            )
            for m in report.manpower_records
        ],
        expenditure_records=[
            ExpenditureItemResponse(
                id=str(e.id),
                cost_code=e.cost_code,
                category=e.category,
                planned_amount=float(e.planned_amount),
                actual_amount=float(e.actual_amount),
                vendor_name=e.vendor_name,
                invoice_ref=e.invoice_ref
            )
            for e in report.expenditure_records
        ],
        activity_records=[
            ActivityItemResponse(
                id=str(a.id),
                name=a.name,
                status=a.status,
                blockers=a.blockers,
                mitigation_steps=a.mitigation_steps
            )
            for a in report.activity_records
        ]
    )
