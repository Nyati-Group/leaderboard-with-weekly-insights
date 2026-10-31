from datetime import date, datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple, Any
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.sites import Site, ProjectBaseline, ProjectMilestone
from app.models.operations import (
    DailyReport, ProgressRecord, ManpowerRecord, ExpenditureRecord
)
from app.models.quality_safety import (
    QualityInspection, QualityChecklistItem, NCRRecord,
    SafetyInspection, SafetyChecklistItem, SafetyIncident,
    CorrectiveAction
)
from app.models.rankings import (
    KRADefinition, RankingMethodology, RankingWeight,
    RankingSnapshot, RankingScore
)
from app.core.logging import logger

class RankingService:
    @staticmethod
    def get_active_methodology(db: Session) -> RankingMethodology:
        methodology = db.query(RankingMethodology).filter(RankingMethodology.is_active == True).first()
        if not methodology:
            methodology = db.query(RankingMethodology).filter(RankingMethodology.version_code == "v1.0").first()
        if not methodology:
            raise ValueError("No active ranking methodology found.")
        return methodology

    @staticmethod
    def calculate_site_kras(db: Session, site_id: str) -> Dict[int, Dict[str, Any]]:
        """
        Computes raw scores, missing flag, and audit details for KRAs 1 through 7 for a site.
        """
        results: Dict[int, Dict[str, Any]] = {}

        # ----------------------------------------------------
        # KRA 1: Progress (Weight ~20%)
        # ----------------------------------------------------
        progress_recs = db.query(ProgressRecord).filter(ProgressRecord.site_id == site_id).all()
        if progress_recs:
            total_planned = sum(float(p.planned_quantity) for p in progress_recs)
            total_actual = sum(float(p.actual_quantity) for p in progress_recs)
            if total_planned > 0:
                raw_score = min(100.0, max(0.0, (total_actual / total_planned) * 100.0))
                results[1] = {
                    "raw_score": round(raw_score, 2),
                    "is_missing": False,
                    "details": {
                        "total_planned_qty": round(total_planned, 2),
                        "total_actual_qty": round(total_actual, 2),
                        "variance_pct": round(((total_actual - total_planned) / total_planned) * 100.0, 2),
                        "data_points": len(progress_recs)
                    }
                }
            else:
                results[1] = {"raw_score": None, "is_missing": True, "details": {"reason": "Planned quantity is zero"}}
        else:
            results[1] = {"raw_score": None, "is_missing": True, "details": {"reason": "No progress records found"}}

        # ----------------------------------------------------
        # KRA 2: Manpower & Productivity (Weight ~15%)
        # ----------------------------------------------------
        manpower_recs = db.query(ManpowerRecord).filter(ManpowerRecord.site_id == site_id).all()
        if manpower_recs:
            total_planned_mp = sum(m.planned_count for m in manpower_recs)
            total_actual_mp = sum(m.actual_count for m in manpower_recs)
            if total_planned_mp > 0:
                # 100% minus deviation percentage
                dev_pct = abs(total_actual_mp - total_planned_mp) / total_planned_mp * 100.0
                raw_score = max(0.0, 100.0 - dev_pct)
                results[2] = {
                    "raw_score": round(raw_score, 2),
                    "is_missing": False,
                    "details": {
                        "total_planned_labor": total_planned_mp,
                        "total_actual_labor": total_actual_mp,
                        "attendance_pct": round((total_actual_mp / total_planned_mp) * 100.0, 2),
                        "records_count": len(manpower_recs)
                    }
                }
            else:
                results[2] = {"raw_score": None, "is_missing": True, "details": {"reason": "Planned manpower is zero"}}
        else:
            results[2] = {"raw_score": None, "is_missing": True, "details": {"reason": "No manpower records found"}}

        # ----------------------------------------------------
        # KRA 3: Cost & Expenditure (Weight ~20%)
        # ----------------------------------------------------
        expenditure_recs = db.query(ExpenditureRecord).filter(ExpenditureRecord.site_id == site_id).all()
        if expenditure_recs:
            total_planned_exp = sum(float(e.planned_amount) for e in expenditure_recs)
            total_actual_exp = sum(float(e.actual_amount) for e in expenditure_recs)
            if total_planned_exp > 0:
                if total_actual_exp <= total_planned_exp:
                    raw_score = 100.0
                else:
                    overrun_pct = ((total_actual_exp - total_planned_exp) / total_planned_exp) * 100.0
                    raw_score = max(0.0, 100.0 - overrun_pct)
                results[3] = {
                    "raw_score": round(raw_score, 2),
                    "is_missing": False,
                    "details": {
                        "planned_expenditure": round(total_planned_exp, 2),
                        "actual_expenditure": round(total_actual_exp, 2),
                        "cost_variance": round(total_planned_exp - total_actual_exp, 2),
                        "cpi": round(total_planned_exp / total_actual_exp, 2) if total_actual_exp > 0 else 1.0
                    }
                }
            else:
                results[3] = {"raw_score": None, "is_missing": True, "details": {"reason": "Planned expenditure is zero"}}
        else:
            results[3] = {"raw_score": None, "is_missing": True, "details": {"reason": "No expenditure records found"}}

        # ----------------------------------------------------
        # KRA 4: Schedule & Milestone Adherence (Weight ~15%)
        # ----------------------------------------------------
        baseline = db.query(ProjectBaseline).filter(ProjectBaseline.site_id == site_id, ProjectBaseline.is_active == True).first()
        if baseline:
            milestones = db.query(ProjectMilestone).filter(ProjectMilestone.baseline_id == baseline.id).all()
            if milestones:
                completed = sum(1 for m in milestones if m.status == "COMPLETED")
                raw_score = (completed / len(milestones)) * 100.0
                results[4] = {
                    "raw_score": round(raw_score, 2),
                    "is_missing": False,
                    "details": {
                        "total_milestones": len(milestones),
                        "completed_milestones": completed,
                        "adherence_pct": round(raw_score, 2)
                    }
                }
            else:
                results[4] = {"raw_score": None, "is_missing": True, "details": {"reason": "No milestones in baseline"}}
        else:
            results[4] = {"raw_score": None, "is_missing": True, "details": {"reason": "No active baseline found"}}

        # ----------------------------------------------------
        # KRA 5: Quality & Defect Prevention (Weight ~10%)
        # ----------------------------------------------------
        q_inspections = db.query(QualityInspection).filter(QualityInspection.site_id == site_id).all()
        if q_inspections:
            q_items = db.query(QualityChecklistItem).join(QualityInspection).filter(QualityInspection.site_id == site_id).all()
            if q_items:
                passed_items = sum(1 for it in q_items if it.is_compliant)
                pass_rate = (passed_items / len(q_items)) * 100.0
            else:
                pass_rate = 100.0

            open_ncrs = db.query(NCRRecord).filter(NCRRecord.site_id == site_id, NCRRecord.status != "CLOSED").count()
            raw_score = max(0.0, min(100.0, pass_rate - (open_ncrs * 15.0)))
            results[5] = {
                "raw_score": round(raw_score, 2),
                "is_missing": False,
                "details": {
                    "total_checklist_items": len(q_items),
                    "compliant_items": passed_items if q_items else 0,
                    "inspection_pass_rate": round(pass_rate, 2),
                    "open_ncrs": open_ncrs,
                    "ncr_penalty": open_ncrs * 15.0
                }
            }
        else:
            results[5] = {"raw_score": None, "is_missing": True, "details": {"reason": "No quality inspections recorded"}}

        # ----------------------------------------------------
        # KRA 6: Safety Compliance (Human-Audited Only) (Weight ~10%)
        # ----------------------------------------------------
        s_inspections = db.query(SafetyInspection).filter(SafetyInspection.site_id == site_id).all()
        s_incidents = db.query(SafetyIncident).filter(SafetyIncident.site_id == site_id).all()

        if s_inspections or s_incidents:
            s_items = db.query(SafetyChecklistItem).join(SafetyInspection).filter(SafetyInspection.site_id == site_id).all()
            if s_items:
                s_compliant = sum(1 for it in s_items if it.is_compliant)
                inspection_score = (s_compliant / len(s_items)) * 100.0
            else:
                inspection_score = 100.0

            fatalities = sum(1 for i in s_incidents if i.severity == "FATALITY")
            lti_count = sum(1 for i in s_incidents if i.severity == "LOST_TIME")
            minor_count = sum(1 for i in s_incidents if i.severity in ["FIRST_AID", "MEDICAL_TREATMENT", "NEAR_MISS"])

            incident_score = max(0.0, 100.0 - (fatalities * 100.0 + lti_count * 25.0 + minor_count * 5.0))
            raw_score = 0.5 * inspection_score + 0.5 * incident_score

            results[6] = {
                "raw_score": round(raw_score, 2),
                "is_missing": False,
                "details": {
                    "inspection_compliance_score": round(inspection_score, 2),
                    "incident_safety_score": round(incident_score, 2),
                    "fatalities": fatalities,
                    "lost_time_incidents": lti_count,
                    "minor_incidents": minor_count,
                    "inspections_audited": len(s_inspections)
                }
            }
        else:
            results[6] = {"raw_score": None, "is_missing": True, "details": {"reason": "No safety inspections or incident records"}}

        # ----------------------------------------------------
        # KRA 7: Task & Corrective Action Closure (Weight ~10%)
        # ----------------------------------------------------
        actions = db.query(CorrectiveAction).filter(CorrectiveAction.site_id == site_id).all()
        if actions:
            closed_actions = sum(1 for a in actions if a.status == "CLOSED")
            raw_score = (closed_actions / len(actions)) * 100.0
            results[7] = {
                "raw_score": round(raw_score, 2),
                "is_missing": False,
                "details": {
                    "total_actions": len(actions),
                    "closed_actions": closed_actions,
                    "closure_rate_pct": round(raw_score, 2)
                }
            }
        else:
            results[7] = {
                "raw_score": 100.0,
                "is_missing": False,
                "details": {
                    "total_actions": 0,
                    "closed_actions": 0,
                    "closure_rate_pct": 100.0,
                    "note": "Zero outstanding corrective actions"
                }
            }

        return results

    @staticmethod
    def check_site_stale(db: Session, site_id: str) -> bool:
        """
        Determines whether the operational data for the site is older than 48 hours.
        """
        cutoff_date = date.today() - timedelta(days=2)
        latest_daily_rep = db.query(func.max(DailyReport.reporting_date)).filter(DailyReport.site_id == site_id).scalar()
        if not latest_daily_rep or latest_daily_rep < cutoff_date:
            return True
        return False

    @classmethod
    def calculate_leaderboard(
        cls,
        db: Session,
        period_id: str = "2026-W44",
        methodology_id: Optional[str] = None
    ) -> List[RankingSnapshot]:
        """
        Calculates and persists deterministic 8-KRA rankings for all active sites for a given period.
        """
        if methodology_id:
            methodology = db.query(RankingMethodology).filter(RankingMethodology.id == methodology_id).first()
            if not methodology:
                raise ValueError(f"Methodology {methodology_id} not found.")
        else:
            methodology = cls.get_active_methodology(db)

        # Map weights by KRA id
        weights_map = {w.kra_id: float(w.weight_pct) for w in methodology.weights}

        sites = db.query(Site).filter(Site.status == "ACTIVE").all()
        snapshots: List[RankingSnapshot] = []

        for site in sites:
            kra_results = cls.calculate_site_kras(db, site.id)
            is_stale = cls.check_site_stale(db, site.id)

            # Count non-missing KRAs
            non_missing_count = sum(1 for kid in range(1, 8) if not kra_results[kid]["is_missing"])
            dci_pct = round((non_missing_count / 7.0) * 100.0, 2)

            composite_score = None
            if dci_pct < 70.0:
                status = "INSUFFICIENT_DATA"
            elif dci_pct < 100.0:
                status = "PROVISIONAL"
                # Re-normalize weights across available KRAs
                available_weight_sum = sum(weights_map[kid] for kid in range(1, 8) if not kra_results[kid]["is_missing"])
                if available_weight_sum > 0:
                    weighted_sum = sum(
                        (weights_map[kid] / available_weight_sum) * kra_results[kid]["raw_score"]
                        for kid in range(1, 8) if not kra_results[kid]["is_missing"]
                    )
                    composite_score = round(weighted_sum, 2)
            else:
                status = "OFFICIAL"
                # Exact weighted sum
                weighted_sum = sum(
                    (weights_map[kid] / 100.0) * kra_results[kid]["raw_score"]
                    for kid in range(1, 8)
                )
                composite_score = round(weighted_sum, 2)

            # Retrieve or create RankingSnapshot
            snapshot = db.query(RankingSnapshot).filter(
                RankingSnapshot.site_id == site.id,
                RankingSnapshot.period_id == period_id,
                RankingSnapshot.methodology_id == methodology.id
            ).first()

            if not snapshot:
                snapshot = RankingSnapshot(
                    site_id=site.id,
                    period_id=period_id,
                    methodology_id=methodology.id,
                    composite_score=composite_score,
                    data_completeness_pct=dci_pct,
                    is_stale=is_stale,
                    status=status
                )
                db.add(snapshot)
                db.flush()
            else:
                snapshot.composite_score = composite_score
                snapshot.data_completeness_pct = dci_pct
                snapshot.is_stale = is_stale
                snapshot.status = status
                snapshot.calculated_at = datetime.now(timezone.utc)
                # Clear existing scores to recreate
                db.query(RankingScore).filter(RankingScore.snapshot_id == snapshot.id).delete()
                db.flush()

            # Create individual RankingScore rows for KRA 1 to 7
            for kid in range(1, 8):
                res = kra_results[kid]
                raw_sc = res["raw_score"]
                w_pct = weights_map.get(kid, 0.0)
                weighted_sc = round((w_pct / 100.0) * raw_sc, 2) if raw_sc is not None else None

                score_entry = RankingScore(
                    snapshot_id=snapshot.id,
                    kra_id=kid,
                    raw_score=raw_sc,
                    weighted_score=weighted_sc,
                    is_missing=res["is_missing"],
                    details_json=res["details"]
                )
                db.add(score_entry)

            snapshots.append(snapshot)

        db.flush()

        # Assign ranking positions: Sort descending by composite_score, None values at the end
        ranked_snapshots = sorted(
            snapshots,
            key=lambda s: (s.composite_score is not None, s.composite_score or 0.0),
            reverse=True
        )

        current_rank = 1
        for s in ranked_snapshots:
            if s.composite_score is not None and s.status in ["OFFICIAL", "PROVISIONAL"]:
                s.ranking_position = current_rank
                current_rank += 1
            else:
                s.ranking_position = None

        db.commit()
        for s in snapshots:
            db.refresh(s)

        return ranked_snapshots
