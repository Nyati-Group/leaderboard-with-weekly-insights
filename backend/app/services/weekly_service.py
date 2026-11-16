import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.weekly_insights import (
    WeeklyReport, WeeklyDepartmentalInput, WeeklyReportVersion,
    WeeklyReportReview, WeeklyInsightItem
)
from app.models.auth import User
from app.models.sites import Site
from app.schemas.weekly_insights import (
    WeeklyReportCreate, WeeklyReportUpdate,
    WeeklyDepartmentalInputCreate, WeeklyReportReviewCreate
)
from app.api.deps import AuthenticatedUserContext

# Reports can only be edited (narrative, insight items, departmental inputs) while still
# being compiled by the site. Once submitted for controller review, the record must stay
# frozen so the controller's decision and the immutable version snapshot stay in sync with
# what was actually reviewed.
EDITABLE_STATUSES = {"DRAFT", "FLAGGED", "INPUTS_PENDING"}

class WeeklyReportService:
    @staticmethod
    def create_weekly_report(
        db: Session,
        payload: WeeklyReportCreate,
        current_user: AuthenticatedUserContext
    ) -> WeeklyReport:
        # Permission check
        if not current_user.can_access_site(payload.site_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"You do not have authorization to create reports for site {payload.site_id}."
            )

        if "SITE_MANAGER" not in current_user.roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Site Managers can initialize weekly reports."
            )

        existing = db.query(WeeklyReport).filter(
            WeeklyReport.site_id == payload.site_id,
            WeeklyReport.week_code == payload.week_code
        ).first()

        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Weekly report for site {payload.site_id} and week {payload.week_code} already exists."
            )

        report = WeeklyReport(
            site_id=payload.site_id,
            week_code=payload.week_code,
            start_date=payload.start_date,
            end_date=payload.end_date,
            status="DRAFT",
            current_version=1,
            site_manager_id=current_user.id,
            executive_summary=payload.executive_summary,
            top_achievements=payload.top_achievements,
            critical_concerns=payload.critical_concerns,
            corporate_assistance_needed=payload.corporate_assistance_needed
        )
        db.add(report)
        db.flush()

        for item in payload.insight_items:
            db.add(WeeklyInsightItem(
                weekly_report_id=report.id,
                category=item.category,
                title=item.title,
                description=item.description,
                severity=item.severity,
                owner_name=item.owner_name,
                target_date=item.target_date
            ))

        db.commit()
        db.refresh(report)
        return report

    @staticmethod
    def update_weekly_report(
        db: Session,
        report_id: uuid.UUID,
        payload: WeeklyReportUpdate,
        current_user: AuthenticatedUserContext
    ) -> WeeklyReport:
        report = db.query(WeeklyReport).filter(WeeklyReport.id == report_id).first()
        if not report:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Weekly report not found.")

        if not current_user.can_access_site(report.site_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied for this site.")

        if "SITE_MANAGER" not in current_user.roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the Site Manager can edit weekly report content."
            )

        if report.status not in EDITABLE_STATUSES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot edit report in {report.status} state. Editing is only permitted for draft or flagged reports."
            )

        if payload.executive_summary is not None:
            report.executive_summary = payload.executive_summary
        if payload.top_achievements is not None:
            report.top_achievements = payload.top_achievements
        if payload.critical_concerns is not None:
            report.critical_concerns = payload.critical_concerns
        if payload.corporate_assistance_needed is not None:
            report.corporate_assistance_needed = payload.corporate_assistance_needed

        if payload.insight_items is not None:
            # Recreate insight items
            db.query(WeeklyInsightItem).filter(WeeklyInsightItem.weekly_report_id == report.id).delete()
            for item in payload.insight_items:
                db.add(WeeklyInsightItem(
                    weekly_report_id=report.id,
                    category=item.category,
                    title=item.title,
                    description=item.description,
                    severity=item.severity,
                    owner_name=item.owner_name,
                    target_date=item.target_date
                ))

        db.commit()
        db.refresh(report)
        return report

    @staticmethod
    def add_departmental_input(
        db: Session,
        report_id: uuid.UUID,
        payload: WeeklyDepartmentalInputCreate,
        current_user: AuthenticatedUserContext
    ) -> WeeklyDepartmentalInput:
        report = db.query(WeeklyReport).filter(WeeklyReport.id == report_id).first()
        if not report:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Weekly report not found.")

        if not current_user.can_access_site(report.site_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied for this site.")

        if report.status not in EDITABLE_STATUSES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot add departmental inputs while report is in {report.status} state. "
                       f"Inputs are only accepted before the report is submitted for controller review."
            )

        # Department role verification (Organization Admins are read-only on weekly reports)
        dept = payload.department.upper()
        if dept == "SAFETY" and not any(r in current_user.roles for r in ["SAFETY_OFFICER", "SITE_MANAGER"]):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only Safety Officers or the Site Manager can submit Safety inputs.")
        if dept == "QUALITY" and not any(r in current_user.roles for r in ["QUALITY_OFFICER", "SITE_MANAGER"]):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only Quality Officers or the Site Manager can submit Quality inputs.")

        # Check existing input for department
        existing_input = db.query(WeeklyDepartmentalInput).filter(
            WeeklyDepartmentalInput.weekly_report_id == report_id,
            WeeklyDepartmentalInput.department == dept
        ).first()

        if existing_input:
            existing_input.narrative = payload.narrative
            existing_input.metrics_json = payload.metrics_json
            existing_input.author_id = current_user.id
            existing_input.submitted_at = datetime.now(timezone.utc)
            db.commit()
            db.refresh(existing_input)
            return existing_input
        else:
            dep_input = WeeklyDepartmentalInput(
                weekly_report_id=report_id,
                department=dept,
                author_id=current_user.id,
                narrative=payload.narrative,
                metrics_json=payload.metrics_json,
                status="SUBMITTED"
            )
            db.add(dep_input)
            db.commit()
            db.refresh(dep_input)
            return dep_input

    @staticmethod
    def submit_report(
        db: Session,
        report_id: uuid.UUID,
        current_user: AuthenticatedUserContext
    ) -> WeeklyReport:
        report = db.query(WeeklyReport).filter(WeeklyReport.id == report_id).first()
        if not report:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Weekly report not found.")

        if not current_user.can_access_site(report.site_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied for this site.")

        if "SITE_MANAGER" not in current_user.roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the Site Manager can submit the weekly report for controller review."
            )

        if report.status not in EDITABLE_STATUSES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Report cannot be submitted from current status: {report.status}."
            )

        # Snapshot full JSON state into WeeklyReportVersion
        snapshot_data = {
            "site_id": report.site_id,
            "week_code": report.week_code,
            "version": report.current_version,
            "status": "SUBMITTED",
            "executive_summary": report.executive_summary,
            "top_achievements": report.top_achievements,
            "critical_concerns": report.critical_concerns,
            "corporate_assistance_needed": report.corporate_assistance_needed,
            "departmental_inputs": [
                {
                    "department": d.department,
                    "narrative": d.narrative,
                    "metrics": d.metrics_json,
                    "author": d.author.full_name if d.author else str(d.author_id)
                }
                for d in report.departmental_inputs
            ],
            "insight_items": [
                {
                    "category": i.category,
                    "title": i.title,
                    "description": i.description,
                    "severity": i.severity,
                    "owner": i.owner_name,
                    "target_date": str(i.target_date) if i.target_date else None
                }
                for i in report.insight_items
            ],
            "submitted_by": current_user.email,
            "submitted_at": datetime.now(timezone.utc).isoformat()
        }

        db.add(WeeklyReportVersion(
            weekly_report_id=report.id,
            version_number=report.current_version,
            snapshot_json=snapshot_data,
            created_by=current_user.id,
            change_summary=f"Submitted version {report.current_version} for corporate review."
        ))

        report.status = "SUBMITTED"
        db.commit()
        db.refresh(report)
        return report

    @staticmethod
    def review_report(
        db: Session,
        report_id: uuid.UUID,
        payload: WeeklyReportReviewCreate,
        current_user: AuthenticatedUserContext
    ) -> WeeklyReport:
        user_roles = set(current_user.roles)
        if "PROJECT_CONTROLLER" not in user_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Project Controllers can review weekly reports. Organization Admins are "
                       "restricted to final publication authority and do not review or edit content."
            )

        report = db.query(WeeklyReport).filter(WeeklyReport.id == report_id).first()
        if not report:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Weekly report not found.")

        if report.status not in ["SUBMITTED", "RESUBMITTED"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Report must be in SUBMITTED state to be reviewed (current status: {report.status})."
            )

        decision = payload.decision.upper()
        if decision == "FLAGGED":
            report.status = "FLAGGED"
            report.current_version += 1  # Increment version for required resubmission
        elif decision == "VALIDATED":
            report.status = "VALIDATED"
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Review decision must be FLAGGED or VALIDATED.")

        db.add(WeeklyReportReview(
            weekly_report_id=report.id,
            reviewer_id=current_user.id,
            decision=decision,
            discrepancies_found=payload.discrepancies_found,
            action_items=payload.action_items
        ))

        db.commit()
        db.refresh(report)
        return report

    @staticmethod
    def publish_report(
        db: Session,
        report_id: uuid.UUID,
        current_user: AuthenticatedUserContext
    ) -> WeeklyReport:
        user_roles = set(current_user.roles)
        if "ORG_ADMIN" not in user_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Organization Admins have executive publication authority to permanently lock weekly reports."
            )

        report = db.query(WeeklyReport).filter(WeeklyReport.id == report_id).first()
        if not report:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Weekly report not found.")

        if report.status != "VALIDATED":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Report must be VALIDATED by Project Controller prior to corporate publication (current status: {report.status})."
            )

        report.status = "PUBLISHED"
        report.published_at = datetime.now(timezone.utc)
        report.published_by = current_user.id

        db.commit()
        db.refresh(report)
        return report
