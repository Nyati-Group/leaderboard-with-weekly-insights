from datetime import date, timedelta
from typing import Dict, Any, List, Optional
from app.core.database import Session
from app.core.odm import func

from app.models.sites import Site, SiteMetadata, ProjectBaseline, ProjectMilestone
from app.models.operations import ProgressRecord, ExpenditureRecord, DailyReport

class EVMService:
    @staticmethod
    def calculate_site_evm(db: Session, site_id: str) -> Dict[str, Any]:
        """
        Computes standard Earned Value Management (EVM) metrics for a site.
        """
        site = db.query(Site).filter(Site.id == site_id).first()
        if not site:
            raise ValueError(f"Site {site_id} not found.")

        meta = db.query(SiteMetadata).filter(SiteMetadata.site_id == site_id).first()
        baseline = db.query(ProjectBaseline).filter(
            ProjectBaseline.site_id == site_id,
            ProjectBaseline.is_active == True
        ).first()

        # If baseline data is not configured, do not fabricate business metrics
        if not baseline or not meta:
            total_ac = db.query(func.sum(ExpenditureRecord.actual_amount)).filter(
                ExpenditureRecord.site_id == site_id
            ).scalar()
            return {
                "site_id": site_id,
                "site_name": site.name,
                "has_baseline": False,
                "budget_at_completion": None,
                "planned_value": None,
                "earned_value": None,
                "actual_cost": round(float(total_ac), 2) if total_ac is not None else 0.0,
                "schedule_performance_index": None,
                "cost_performance_index": None,
                "schedule_variance": None,
                "cost_variance": None,
                "estimate_at_completion": None,
                "variance_at_completion": None,
                "progress_pct": None,
                "health_status": "BASELINE_NOT_CONFIGURED",
                "message": "Project baseline and budgeted cost not yet configured. EVM metrics suppressed.",
                "s_curve_points": []
            }

        # BAC: Budget at Completion
        bac = float(meta.budgeted_cost) if meta.budgeted_cost else float(baseline.total_budget)

        # Total Project Planned Duration & Elapsed Days
        start_d = site.start_date
        target_finish_d = site.target_completion_date
        total_duration_days = max(1, (target_finish_d - start_d).days)
        elapsed_days = max(0, min(total_duration_days, (date.today() - start_d).days))
        elapsed_ratio = elapsed_days / total_duration_days

        # Planned Value (PV): Budgeted Cost of Work Scheduled up to today
        pv = round(bac * elapsed_ratio, 2)

        # Actual Cost (AC): Total actual expenditure recorded from verified field invoices
        total_ac = db.query(func.sum(ExpenditureRecord.actual_amount)).filter(
            ExpenditureRecord.site_id == site_id
        ).scalar()
        ac = round(float(total_ac), 2) if total_ac is not None else 0.0

        # Physical Progress % & Earned Value (EV)
        # Compute strictly from milestone adherence
        milestones = db.query(ProjectMilestone).filter(ProjectMilestone.baseline_id == baseline.id).all()
        if milestones:
            completed_weight = sum(float(m.weightage_pct) for m in milestones if m.status == "COMPLETED")
            progress_pct = round(completed_weight, 2)
        else:
            progress_pct = 0.0

        # EV = BAC * (% complete)
        ev = round(bac * (progress_pct / 100.0), 2)

        # Indices
        spi = round(ev / pv, 2) if pv > 0 else 1.0
        cpi = round(ev / ac, 2) if ac > 0 else 1.0

        # Variances
        sv = round(ev - pv, 2)  # Schedule Variance in Currency
        cv = round(ev - ac, 2)  # Cost Variance in Currency

        # EAC: Estimate At Completion
        eac = round(bac / cpi, 2) if cpi > 0 else bac
        vac = round(bac - eac, 2)  # Variance at Completion

        # Generate S-Curve trend points (monthly points from start to finish)
        s_curve_points = []
        num_intervals = 12
        interval_days = total_duration_days / num_intervals
        for i in range(num_intervals + 1):
            point_date = start_d + timedelta(days=int(i * interval_days))
            t_ratio = i / num_intervals
            # Sigmoid/S-curve shape for PV: 3*t^2 - 2*t^3
            s_factor = 3 * (t_ratio ** 2) - 2 * (t_ratio ** 3)
            p_val = round(bac * s_factor, 2)

            # Historical points up to today have actual and earned
            if point_date <= date.today():
                actual_val = round(ac * (i / max(1, (elapsed_days / interval_days))), 2) if elapsed_days > 0 else 0.0
                earned_val = round(ev * (i / max(1, (elapsed_days / interval_days))), 2) if elapsed_days > 0 else 0.0
            else:
                actual_val = None
                earned_val = None

            s_curve_points.append({
                "period": point_date.strftime("%b %Y"),
                "pv": p_val,
                "ev": earned_val,
                "ac": actual_val
            })

        return {
            "site_id": site_id,
            "site_name": site.name,
            "has_baseline": True,
            "budget_at_completion": bac,
            "planned_value": pv,
            "earned_value": ev,
            "actual_cost": ac,
            "schedule_performance_index": spi,
            "cost_performance_index": cpi,
            "schedule_variance": sv,
            "cost_variance": cv,
            "estimate_at_completion": eac,
            "variance_at_completion": vac,
            "progress_pct": progress_pct,
            "health_status": "EXCELLENT" if spi >= 1.0 and cpi >= 1.0 else ("GOOD" if spi >= 0.9 and cpi >= 0.9 else "CRITICAL"),
            "s_curve_points": s_curve_points
        }

    @classmethod
    def calculate_portfolio_evm(cls, db: Session) -> Dict[str, Any]:
        """
        Aggregates EVM metrics across all active construction sites.
        """
        sites = db.query(Site).filter(Site.status == "ACTIVE").all()
        site_evms = [cls.calculate_site_evm(db, s.id) for s in sites]

        valid_evms = [item for item in site_evms if item.get("has_baseline", False)]
        portfolio_bac = sum(item["budget_at_completion"] for item in valid_evms if item["budget_at_completion"] is not None)
        portfolio_pv = sum(item["planned_value"] for item in valid_evms if item["planned_value"] is not None)
        portfolio_ev = sum(item["earned_value"] for item in valid_evms if item["earned_value"] is not None)
        portfolio_ac = sum(item["actual_cost"] for item in site_evms if item["actual_cost"] is not None)

        portfolio_spi = round(portfolio_ev / portfolio_pv, 2) if portfolio_pv > 0 else 1.0
        portfolio_cpi = round(portfolio_ev / portfolio_ac, 2) if portfolio_ac > 0 else 1.0

        return {
            "portfolio_bac": portfolio_bac,
            "portfolio_pv": portfolio_pv,
            "portfolio_ev": portfolio_ev,
            "portfolio_ac": portfolio_ac,
            "portfolio_spi": portfolio_spi,
            "portfolio_cpi": portfolio_cpi,
            "site_breakdown": site_evms
        }
