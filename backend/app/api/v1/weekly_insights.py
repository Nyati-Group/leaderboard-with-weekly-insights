import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from app.core.database import Session

from app.core.database import get_db
from app.api.deps import get_current_user, AuthenticatedUserContext
from app.models.weekly_insights import WeeklyReport, WeeklyReportVersion
from app.schemas.weekly_insights import (
    WeeklyReportCreate, WeeklyReportUpdate,
    WeeklyReportSummarySchema, WeeklyReportDetailSchema,
    WeeklyDepartmentalInputCreate, WeeklyDepartmentalInputSchema,
    WeeklyReportReviewCreate, WeeklyReportReviewSchema,
    WeeklyReportVersionSchema
)
from app.services.weekly_service import WeeklyReportService

router = APIRouter(prefix="/weekly-reports", tags=["Construction Weekly Insights"])

def _to_detail_schema(report: WeeklyReport) -> WeeklyReportDetailSchema:
    schema = WeeklyReportDetailSchema.model_validate(report)
    schema.site_name = report.site.name if report.site else report.site_id
    schema.site_manager_name = report.site_manager.full_name if report.site_manager else None
    schema.published_by_name = report.publisher.full_name if report.publisher else None
    
    # Map author names
    for dep, model in zip(schema.departmental_inputs, report.departmental_inputs):
        dep.author_name = model.author.full_name if model.author else None

    # Map reviewer names
    for rev, model in zip(schema.reviews, report.reviews):
        rev.reviewer_name = model.reviewer.full_name if model.reviewer else None

    # Map version creator names
    for ver, model in zip(schema.versions, report.versions):
        ver.creator_name = model.creator.full_name if model.creator else None

    return schema

@router.get("", response_model=List[WeeklyReportSummarySchema])
def list_weekly_reports(
    site_id: Optional[str] = Query(None, description="Filter by site ID"),
    week_code: Optional[str] = Query(None, description="Filter by week code e.g. 2026-W44"),
    status: Optional[str] = Query(None, description="Filter by status"),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(get_current_user)
):
    """
    Lists weekly reports matching filters, respecting site authorization scope.
    """
    query = db.query(WeeklyReport)

    if site_id:
        if not current_user.can_access_site(site_id):
            raise HTTPException(status_code=403, detail="Access denied for requested site.")
        query = query.filter(WeeklyReport.site_id == site_id)
    elif not current_user.has_global_scope:
        query = query.filter(WeeklyReport.site_id.in_(current_user.assigned_site_ids))

    if week_code:
        query = query.filter(WeeklyReport.week_code == week_code)
    if status:
        query = query.filter(WeeklyReport.status == status)

    reports = query.order_by(WeeklyReport.start_date.desc()).all()

    result = []
    for r in reports:
        item = WeeklyReportSummarySchema.model_validate(r)
        item.site_name = r.site.name if r.site else r.site_id
        item.site_manager_name = r.site_manager.full_name if r.site_manager else None
        item.published_by_name = r.publisher.full_name if r.publisher else None
        result.append(item)

    return result

@router.post("", response_model=WeeklyReportDetailSchema, status_code=status.HTTP_201_CREATED)
def create_weekly_report(
    payload: WeeklyReportCreate,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(get_current_user)
):
    """
    Initializes a new Weekly Report draft for a site and week.
    """
    report = WeeklyReportService.create_weekly_report(db, payload, current_user)
    return _to_detail_schema(report)

@router.get("/{report_id}", response_model=WeeklyReportDetailSchema)
def get_weekly_report(
    report_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(get_current_user)
):
    """
    Retrieves complete weekly report details including departmental inputs, reviews, and insights.
    """
    report = db.query(WeeklyReport).filter(WeeklyReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Weekly report not found.")

    if not current_user.can_access_site(report.site_id):
        raise HTTPException(status_code=403, detail="Access denied for this site.")

    return _to_detail_schema(report)

@router.put("/{report_id}", response_model=WeeklyReportDetailSchema)
def update_weekly_report(
    report_id: uuid.UUID,
    payload: WeeklyReportUpdate,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(get_current_user)
):
    """
    Updates narrative and insight items for a draft/flagged weekly report.
    """
    report = WeeklyReportService.update_weekly_report(db, report_id, payload, current_user)
    return _to_detail_schema(report)

@router.post("/{report_id}/departmental-input", response_model=WeeklyDepartmentalInputSchema)
def add_departmental_input(
    report_id: uuid.UUID,
    payload: WeeklyDepartmentalInputCreate,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(get_current_user)
):
    """
    Submits Safety or Quality departmental synthesis into the weekly report.
    """
    dep_input = WeeklyReportService.add_departmental_input(db, report_id, payload, current_user)
    schema = WeeklyDepartmentalInputSchema.model_validate(dep_input)
    schema.author_name = current_user.full_name
    return schema

@router.post("/{report_id}/submit", response_model=WeeklyReportDetailSchema)
def submit_weekly_report(
    report_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(get_current_user)
):
    """
    Site Manager submits consolidated report for Project Controller review.
    Captures an immutable snapshot in weekly_report_versions.
    """
    report = WeeklyReportService.submit_report(db, report_id, current_user)
    return _to_detail_schema(report)

@router.post("/{report_id}/review", response_model=WeeklyReportDetailSchema)
def review_weekly_report(
    report_id: uuid.UUID,
    payload: WeeklyReportReviewCreate,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(get_current_user)
):
    """
    Project Controller reviews report: either FLAGGED (with discrepancy notes) or VALIDATED.
    """
    report = WeeklyReportService.review_report(db, report_id, payload, current_user)
    return _to_detail_schema(report)

@router.post("/{report_id}/publish", response_model=WeeklyReportDetailSchema)
def publish_weekly_report(
    report_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(get_current_user)
):
    """
    Executive Leadership or Org Admin approves and permanently locks the weekly report.
    """
    report = WeeklyReportService.publish_report(db, report_id, current_user)
    return _to_detail_schema(report)

@router.get("/{report_id}/versions", response_model=List[WeeklyReportVersionSchema])
def list_report_versions(
    report_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(get_current_user)
):
    """
    Retrieves immutable historical submission versions of the report.
    """
    report = db.query(WeeklyReport).filter(WeeklyReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Weekly report not found.")

    if not current_user.can_access_site(report.site_id):
        raise HTTPException(status_code=403, detail="Access denied for this site.")

    versions = db.query(WeeklyReportVersion).filter(
        WeeklyReportVersion.weekly_report_id == report_id
    ).order_by(WeeklyReportVersion.version_number.desc()).all()

    result = []
    for v in versions:
        schema = WeeklyReportVersionSchema.model_validate(v)
        schema.creator_name = v.creator.full_name if v.creator else str(v.created_by)
        result.append(schema)

    return result
