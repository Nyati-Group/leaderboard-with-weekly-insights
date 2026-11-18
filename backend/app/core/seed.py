from datetime import date, timedelta
from app.core.database import Session
from app.core.database import SessionLocal
from app.core.odm import ensure_indexes
from app.core.security import get_password_hash
from app.models.auth import Role, Permission, User, SiteAssignment
from app.models.sites import Site, SiteMetadata, ProjectBaseline, ProjectMilestone
from app.models.operations import (
    DailyReport,
    DailyReportVersion,
    ProgressRecord,
    ManpowerRecord,
    ExpenditureRecord,
    ActivityRecord
)
from app.models.quality_safety import (
    QualityInspection,
    QualityChecklistItem,
    QualityDefect,
    NCRRecord,
    ReworkRecord,
    SafetyInspection,
    SafetyChecklistItem,
    SafetyObservation,
    SafetyIncident,
    CorrectiveAction,
    ActionAssignment
)
from app.models.rankings import (
    KRADefinition,
    RankingMethodology,
    RankingWeight,
    RankingSnapshot,
    RankingScore
)
from app.models.weekly_insights import (
    WeeklyReport,
    WeeklyDepartmentalInput,
    WeeklyReportVersion,
    WeeklyReportReview,
    WeeklyInsightItem
)
from app.models.chatbot import DocumentUpload, DocumentChunk
from app.core.logging import logger

ROLES_SEED = [
    {
        "id": "ORG_ADMIN",
        "name": "Organization Admin",
        "description": "Full corporate administrative authority across all sites, ranking governance, approvals, and system configuration."
    },
    {
        "id": "EXEC_LEADERSHIP",
        "name": "Executive Leadership",
        "description": "Read-only corporate intelligence, portfolio overview, transparent leaderboard inspection, published weekly reports."
    },
    {
        "id": "PROJECT_CONTROLLER",
        "name": "Project Controller",
        "description": "Multi-site operational discrepancy flagging, correction validation, spreadsheet import/export, and EVM analytics."
    },
    {
        "id": "SITE_MANAGER",
        "name": "Site Manager",
        "description": "Field leadership for assigned site. Submits daily reports, consolidates weekly reports, tracks corrective actions."
    },
    {
        "id": "SAFETY_OFFICER",
        "name": "Safety Officer",
        "description": "Field safety authority for assigned site. Conducts safety inspections, logs observations, records incidents, and submits safety inputs."
    },
    {
        "id": "QUALITY_OFFICER",
        "name": "Quality Officer",
        "description": "Field quality authority for assigned site. Conducts checklist inspections, records defects, issues NCRs, tracks rework."
    }
]

SITES_SEED = [
    {
        "id": "CS-PUN-01",
        "name": "Pune Commercial Tower",
        "location": "Baner, Pune, Maharashtra",
        "status": "ACTIVE",
        "project_type": "Commercial",
        "start_date": date(2025, 4, 1),
        "target_completion_date": date(2027, 3, 31),
        "client_name": "Apex Commercial Realty Ltd",
        "contract_value": 1450000000.00,  # 145 Cr INR
        "budgeted_cost": 1280000000.00,   # 128 Cr INR
    },
    {
        "id": "CS-MUM-02",
        "name": "Mumbai Residential Complex",
        "location": "Worli, Mumbai, Maharashtra",
        "status": "ACTIVE",
        "project_type": "Residential",
        "start_date": date(2025, 6, 15),
        "target_completion_date": date(2027, 12, 31),
        "client_name": "Seaview Urban Living LLP",
        "contract_value": 2800000000.00,  # 280 Cr INR
        "budgeted_cost": 2450000000.00,   # 245 Cr INR
    },
    {
        "id": "CS-NAS-03",
        "name": "Nashik Industrial Facility",
        "location": "Satpur MIDC, Nashik, Maharashtra",
        "status": "ACTIVE",
        "project_type": "Industrial",
        "start_date": date(2025, 8, 1),
        "target_completion_date": date(2026, 11, 30),
        "client_name": "Bharat Precision Engineering Corp",
        "contract_value": 680000000.00,   # 68 Cr INR
        "budgeted_cost": 590000000.00,    # 59 Cr INR
    },
    {
        "id": "CS-REM-04",
        "name": "Remote Infrastructure Project",
        "location": "Konkan Coastal Corridor, Maharashtra",
        "status": "ACTIVE",
        "project_type": "Infrastructure",
        "start_date": date(2025, 2, 1),
        "target_completion_date": date(2027, 6, 30),
        "client_name": "State Infrastructure Development Board",
        "contract_value": 3900000000.00,  # 390 Cr INR
        "budgeted_cost": 3500000000.00,   # 350 Cr INR
    },
    {
        "id": "CS-NAG-05",
        "name": "Nagpur Mixed-Use",
        "location": "MIHAN, Nagpur, Maharashtra",
        "status": "ACTIVE",
        "project_type": "Mixed-Use",
        "start_date": date(2025, 9, 1),
        "target_completion_date": date(2028, 3, 31),
        "client_name": "Central Horizon Developers",
        "contract_value": 1850000000.00,  # 185 Cr INR
        "budgeted_cost": 1620000000.00,   # 162 Cr INR
    }
]

USERS_SEED = [
    # Corporate Leadership & Governance
    {
        "email": "admin@cld.com",
        "full_name": "Rajesh Sharma",
        "roles": ["ORG_ADMIN"],
        "assigned_sites": []  # Global corporate authority
    },
    {
        "email": "leadership@cld.com",
        "full_name": "Vikramaditya Roy",
        "roles": ["EXEC_LEADERSHIP"],
        "assigned_sites": []  # Global read-only intelligence
    },
    {
        "email": "controller@cld.com",
        "full_name": "Meera Nambiar",
        "roles": ["PROJECT_CONTROLLER"],
        "assigned_sites": []  # Multi-site governance & discrepancy control
    },
    # Pune Commercial Tower (CS-PUN-01)
    {
        "email": "pm.pune@cld.com",
        "full_name": "Amitabh Joshi",
        "roles": ["SITE_MANAGER"],
        "assigned_sites": [("CS-PUN-01", "SITE_MANAGER")]
    },
    {
        "email": "safety.pune@cld.com",
        "full_name": "Nikhil Kadam",
        "roles": ["SAFETY_OFFICER"],
        "assigned_sites": [("CS-PUN-01", "SAFETY_OFFICER")]
    },
    {
        "email": "quality.pune@cld.com",
        "full_name": "Sneha Sawant",
        "roles": ["QUALITY_OFFICER"],
        "assigned_sites": [("CS-PUN-01", "QUALITY_OFFICER")]
    },
    # Mumbai Residential Complex (CS-MUM-02)
    {
        "email": "pm.mumbai@cld.com",
        "full_name": "Anil Deshmukh",
        "roles": ["SITE_MANAGER"],
        "assigned_sites": [("CS-MUM-02", "SITE_MANAGER")]
    },
    {
        "email": "safety.mumbai@cld.com",
        "full_name": "Karan Verma",
        "roles": ["SAFETY_OFFICER"],
        "assigned_sites": [("CS-MUM-02", "SAFETY_OFFICER")]
    },
    {
        "email": "quality.mumbai@cld.com",
        "full_name": "Pooja Kulkarni",
        "roles": ["QUALITY_OFFICER"],
        "assigned_sites": [("CS-MUM-02", "QUALITY_OFFICER")]
    },
    # Nashik Industrial Facility (CS-NAS-03)
    {
        "email": "pm.nashik@cld.com",
        "full_name": "Pravin Patil",
        "roles": ["SITE_MANAGER"],
        "assigned_sites": [("CS-NAS-03", "SITE_MANAGER")]
    },
    {
        "email": "safety.nashik@cld.com",
        "full_name": "Rohan Gaikwad",
        "roles": ["SAFETY_OFFICER"],
        "assigned_sites": [("CS-NAS-03", "SAFETY_OFFICER")]
    },
    {
        "email": "quality.nashik@cld.com",
        "full_name": "Ganesh Shinde",
        "roles": ["QUALITY_OFFICER"],
        "assigned_sites": [("CS-NAS-03", "QUALITY_OFFICER")]
    },
    # Remote Infrastructure Project (CS-REM-04)
    {
        "email": "pm.remote@cld.com",
        "full_name": "Sunil Rana",
        "roles": ["SITE_MANAGER"],
        "assigned_sites": [("CS-REM-04", "SITE_MANAGER")]
    },
    {
        "email": "safety.remote@cld.com",
        "full_name": "Major R. K. Thapa",
        "roles": ["SAFETY_OFFICER"],
        "assigned_sites": [("CS-REM-04", "SAFETY_OFFICER")]
    },
    {
        "email": "quality.remote@cld.com",
        "full_name": "Deepak Bhandari",
        "roles": ["QUALITY_OFFICER"],
        "assigned_sites": [("CS-REM-04", "QUALITY_OFFICER")]
    },
    # Nagpur Mixed-Use (CS-NAG-05)
    {
        "email": "pm.nagpur@cld.com",
        "full_name": "Sanjay Meshram",
        "roles": ["SITE_MANAGER"],
        "assigned_sites": [("CS-NAG-05", "SITE_MANAGER")]
    },
    {
        "email": "safety.nagpur@cld.com",
        "full_name": "Ashish Wankhede",
        "roles": ["SAFETY_OFFICER"],
        "assigned_sites": [("CS-NAG-05", "SAFETY_OFFICER")]
    },
    {
        "email": "quality.nagpur@cld.com",
        "full_name": "Madhuri Tijare",
        "roles": ["QUALITY_OFFICER"],
        "assigned_sites": [("CS-NAG-05", "QUALITY_OFFICER")]
    }
]

DEFAULT_PASSWORD = "Construction@2026"

def seed_database():
    db: Session = SessionLocal()
    ensure_indexes(db.db)
    try:
        # 1. Seed Roles
        for role_data in ROLES_SEED:
            existing_role = db.query(Role).filter(Role.id == role_data["id"]).first()
            if not existing_role:
                db.add(Role(**role_data))
                logger.info(f"Seeded role: {role_data['id']}")

        # 2. Seed Sites & Metadata
        for s in SITES_SEED:
            site = db.query(Site).filter(Site.id == s["id"]).first()
            if not site:
                site = Site(
                    id=s["id"],
                    name=s["name"],
                    location=s["location"],
                    status=s["status"],
                    project_type=s["project_type"],
                    start_date=s["start_date"],
                    target_completion_date=s["target_completion_date"]
                )
                db.add(site)
                db.flush()

                metadata = SiteMetadata(
                    site_id=site.id,
                    client_name=s["client_name"],
                    contract_value=s["contract_value"],
                    budgeted_cost=s["budgeted_cost"],
                    currency="INR"
                )
                db.add(metadata)

                baseline = ProjectBaseline(
                    site_id=site.id,
                    version_number=1,
                    is_active=True,
                    total_budget=s["budgeted_cost"],
                    planned_duration_days=(s["target_completion_date"] - s["start_date"]).days
                )
                db.add(baseline)
                logger.info(f"Seeded site: {site.id} - {site.name}")
            else:
                site.name = s["name"]
                site.location = s["location"]
                site.project_type = s["project_type"]
                meta = db.query(SiteMetadata).filter(SiteMetadata.site_id == site.id).first()
                if meta:
                    meta.client_name = s["client_name"]
                    meta.contract_value = s["contract_value"]
                    meta.budgeted_cost = s["budgeted_cost"]

        # 3. Seed Users & Site Assignments
        hashed_pwd = get_password_hash(DEFAULT_PASSWORD)
        user_map = {}
        for u_data in USERS_SEED:
            user = db.query(User).filter(User.email == u_data["email"]).first()
            if not user:
                user = User(
                    email=u_data["email"],
                    full_name=u_data["full_name"],
                    hashed_password=hashed_pwd,
                    is_active=True
                )
                db.add(user)
                db.flush()
            else:
                user.full_name = u_data["full_name"]
                user.hashed_password = hashed_pwd
                user.is_active = True

            # Assign roles
            user.roles = []
            for r_id in u_data["roles"]:
                role = db.query(Role).filter(Role.id == r_id).first()
                if role and role not in user.roles:
                    user.roles.append(role)

            # Assign sites
            db.query(SiteAssignment).filter(SiteAssignment.user_id == user.id).delete()
            for s_id, role_name in u_data["assigned_sites"]:
                assignment = SiteAssignment(
                    user_id=user.id,
                    site_id=s_id,
                    assigned_role=role_name,
                    is_active=True
                )
                db.add(assignment)
            db.flush()
            logger.info(f"Seeded user: {user.email} ({user.full_name})")
            user_map[user.email] = user

        # 4. Seed Historical Daily Reports for Pune (CS-PUN-01) for past 5 days
        pune_manager = user_map.get("pm.pune@cld.com")
        if pune_manager:
            for day_offset in range(1, 6):
                rep_date = date.today() - timedelta(days=day_offset)
                existing_rep = db.query(DailyReport).filter(
                    DailyReport.site_id == "CS-PUN-01",
                    DailyReport.reporting_date == rep_date
                ).first()

                if not existing_rep:
                    rep = DailyReport(
                        site_id="CS-PUN-01",
                        reporting_date=rep_date,
                        status="VALIDATED",
                        current_version=1,
                        submitted_by=pune_manager.id,
                        site_manager_remarks=f"Floor work day -{day_offset} completed in full coordination."
                    )
                    db.add(rep)
                    db.flush()

                    db.add(ProgressRecord(
                        daily_report_id=rep.id,
                        site_id="CS-PUN-01",
                        work_package="Superstructure",
                        activity_name="Slab Concrete Pouring",
                        unit_of_measure="cum",
                        planned_quantity=50.0,
                        actual_quantity=48.5,
                        cumulative_quantity=200.0 + (day_offset * 48.0)
                    ))

                    db.add(ManpowerRecord(
                        daily_report_id=rep.id,
                        site_id="CS-PUN-01",
                        trade_category="Carpenters & Formwork",
                        contractor_name="Sterling Infra",
                        planned_count=20,
                        actual_count=19,
                        overtime_hours=1.5
                    ))

                    db.add(ExpenditureRecord(
                        daily_report_id=rep.id,
                        site_id="CS-PUN-01",
                        cost_code="MAT-CONC-01",
                        category="Materials",
                        planned_amount=320000.0,
                        actual_amount=315000.0,
                        vendor_name="UltraTech Cement",
                        invoice_ref=f"INV-PUN-{day_offset}"
                    ))

                    db.add(ActivityRecord(
                        daily_report_id=rep.id,
                        site_id="CS-PUN-01",
                        name="Pre-pour rebar inspection",
                        status="COMPLETED"
                    ))

        # 5. Seed KRA Definitions & Default Approved Methodology v1.0
        kra_data = [
            (1, "PROGRESS", "Construction Progress", "Weighted physical progress vs baseline across all active work packages.", False),
            (2, "MANPOWER", "Manpower Deployment & Productivity", "Actual labor attendance vs planned trade allocation and planned output.", False),
            (3, "COST", "Cost & Expenditure Control", "Expenditure variance, material procurement efficiency, and budget adherence.", False),
            (4, "SCHEDULE", "Schedule & Milestone Adherence", "Timely completion of critical path milestones and delay recovery.", False),
            (5, "QUALITY", "Work Quality & Defect Prevention", "Quality inspection checklist pass rates, NCR severity, and rework cost control.", False),
            (6, "SAFETY", "Safety Compliance & Incident Prevention", "Human-audited safety checklist score, zero-incident track record, and verified hazard mitigation.", False),
            (7, "CLOSURE", "Task & Corrective Action Closure", "On-time resolution and closure rate of corrective actions and flagged operational items.", False),
            (8, "OVERALL", "Overall Site Performance Index", "Transparent composite performance index calculated from official KRA 1-7 weights.", True)
        ]

        for kra_id, code, name, desc, is_comp in kra_data:
            existing_kra = db.query(KRADefinition).filter(KRADefinition.id == kra_id).first()
            if not existing_kra:
                db.add(KRADefinition(
                    id=kra_id,
                    code=code,
                    name=name,
                    description=desc,
                    is_composite=is_comp
                ))

        db.flush()

        # Seed Methodology v1.0
        admin_user = user_map.get("admin@cld.com")
        existing_meth = db.query(RankingMethodology).filter(RankingMethodology.version_code == "v1.0").first()
        if not existing_meth:
            meth = RankingMethodology(
                version_code="v1.0",
                name="Corporate Standard 8-KRA Methodology",
                is_active=True,
                approved_by=admin_user.id if admin_user else None,
                approved_at=date.today(),
                rationale="Standard organizational ranking weights prioritizing Progress (20%), Cost (20%), Manpower (15%), and Schedule (15%)."
            )
            db.add(meth)
            db.flush()

            # Weights: 1: 20%, 2: 15%, 3: 20%, 4: 15%, 5: 10%, 6: 10%, 7: 10%
            weights_data = [
                (1, 20.0),
                (2, 15.0),
                (3, 20.0),
                (4, 15.0),
                (5, 10.0),
                (6, 10.0),
                (7, 10.0)
            ]
            for kid, wpct in weights_data:
                db.add(RankingWeight(
                    methodology_id=meth.id,
                    kra_id=kid,
                    weight_pct=wpct
                ))
            logger.info("Seeded Ranking Methodology v1.0 with official 8-KRA weights.")

        # 6. Seed Milestones, Quality, Safety & Actions across all sites for rich testing
        for site_info in SITES_SEED:
            s_id = site_info["id"]
            # Seed project milestones if none exist
            baseline = db.query(ProjectBaseline).filter(ProjectBaseline.site_id == s_id, ProjectBaseline.is_active == True).first()
            if baseline:
                existing_ms = db.query(ProjectMilestone).filter(ProjectMilestone.baseline_id == baseline.id).first()
                if not existing_ms:
                    db.add(ProjectMilestone(
                        baseline_id=baseline.id,
                        name="Foundation & Piling Complete",
                        sequence_order=1,
                        target_date=site_info["start_date"] + timedelta(days=90),
                        actual_date=site_info["start_date"] + timedelta(days=88),
                        weightage_pct=25.0,
                        status="COMPLETED"
                    ))
                    db.add(ProjectMilestone(
                        baseline_id=baseline.id,
                        name="Basement & Substructure Works",
                        sequence_order=2,
                        target_date=site_info["start_date"] + timedelta(days=180),
                        actual_date=None,
                        weightage_pct=35.0,
                        status="COMPLETED" if s_id in ["CS-PUN-01", "CS-NAG-05"] else "PENDING"
                    ))

            # Site-specific staff lookup
            staff = {
                "CS-PUN-01": {"pm": "pm.pune@cld.com", "safety": "safety.pune@cld.com", "quality": "quality.pune@cld.com"},
                "CS-MUM-02": {"pm": "pm.mumbai@cld.com", "safety": "safety.mumbai@cld.com", "quality": "quality.mumbai@cld.com"},
                "CS-NAS-03": {"pm": "pm.nashik@cld.com", "safety": "safety.nashik@cld.com", "quality": "quality.nashik@cld.com"},
                "CS-REM-04": {"pm": "pm.remote@cld.com", "safety": "safety.remote@cld.com", "quality": "quality.remote@cld.com"},
                "CS-NAG-05": {"pm": "pm.nagpur@cld.com", "safety": "safety.nagpur@cld.com", "quality": "quality.nagpur@cld.com"},
            }.get(s_id, {})

            site_pm = user_map.get(staff.get("pm", "")) or admin_user
            site_safety = user_map.get(staff.get("safety", "")) or admin_user
            site_quality = user_map.get(staff.get("quality", "")) or admin_user

            # Seed quality inspections & checklists
            existing_qi = db.query(QualityInspection).filter(QualityInspection.site_id == s_id).first()
            if not existing_qi and site_quality:
                qi = QualityInspection(
                    site_id=s_id,
                    inspection_date=date.today() - timedelta(days=2),
                    inspector_id=site_quality.id,
                    inspection_type="Pre-pour Concrete Inspection",
                    wbs_location="Tower 1 - Floor 3 - Grid B4-C8",
                    outcome="PASS" if s_id != "CS-MUM-02" else "FAIL",
                    remarks="Standard structural reinforcement verification completed."
                )
                db.add(qi)
                db.flush()

                db.add(QualityChecklistItem(
                    inspection_id=qi.id,
                    parameter="Rebar diameter, spacing and cover block verification",
                    is_compliant=True,
                    comments="Compliant with structural drawings"
                ))
                db.add(QualityChecklistItem(
                    inspection_id=qi.id,
                    parameter="Formwork alignment, tightness and prop stability",
                    is_compliant=True if s_id != "CS-MUM-02" else False,
                    comments="Minor alignment deviation detected at grid B5" if s_id == "CS-MUM-02" else "Within tolerance"
                ))

            # Seed safety inspection & observations
            existing_si = db.query(SafetyInspection).filter(SafetyInspection.site_id == s_id).first()
            if not existing_si and site_safety:
                si = SafetyInspection(
                    site_id=s_id,
                    inspection_date=date.today() - timedelta(days=1),
                    inspector_id=site_safety.id,
                    inspection_type="WEEKLY_AUDIT",
                    compliance_score_pct=100.0 if s_id != "CS-NAS-03" else 90.0,
                    remarks="Human-audited site safety inspection walkthrough."
                )
                db.add(si)
                db.flush()

                db.add(SafetyChecklistItem(
                    safety_inspection_id=si.id,
                    category="PPE_COMPLIANCE",
                    item_description="Proper manual PPE gear (hard hat, high-vis vest, safety boots) checked on-site",
                    is_compliant=True,
                    severity="LOW",
                    corrective_action_required=False,
                    comments="All crew verified compliant during shift start audit"
                ))
                db.add(SafetyChecklistItem(
                    safety_inspection_id=si.id,
                    category="SCAFFOLDING",
                    item_description="Scaffold tagging, bracing and toe boards compliant",
                    is_compliant=True if s_id != "CS-NAS-03" else False,
                    severity="MEDIUM" if s_id == "CS-NAS-03" else "LOW",
                    corrective_action_required=True if s_id == "CS-NAS-03" else False,
                    comments="Toe board missing on east facade scaffold" if s_id == "CS-NAS-03" else "Green tag verified"
                ))

                db.add(SafetyObservation(
                    site_id=s_id,
                    observer_id=site_safety.id,
                    observation_date=date.today() - timedelta(days=1),
                    category="Working at Height",
                    severity="LOW",
                    description="Guardrails and toe-boards inspected and verified compliant.",
                    status="RESOLVED" if s_id != "CS-NAS-03" else "REPORTED"
                ))

            # Seed corrective action
            existing_ca = db.query(CorrectiveAction).filter(CorrectiveAction.site_id == s_id).first()
            if not existing_ca and site_safety:
                ca = CorrectiveAction(
                    site_id=s_id,
                    source_type="SAFETY_OBSERVATION",
                    title="Install edge protection barrier mesh",
                    description="Ensure safety net and edge barriers are fastened securely on perimeter.",
                    priority="HIGH" if s_id == "CS-NAS-03" else "MEDIUM",
                    due_date=date.today() + timedelta(days=3),
                    status="CLOSED" if s_id in ["CS-PUN-01", "CS-NAG-05"] else "IN_PROGRESS",
                    created_by=site_safety.id
                )
                db.add(ca)

            # Seed daily reports for CS-MUM-02, CS-NAS-03, CS-REM-04, CS-NAG-05 if not existing
            if s_id != "CS-PUN-01":
                for day_offset in range(1, 4):
                    rep_date = date.today() - timedelta(days=day_offset)
                    existing_rep = db.query(DailyReport).filter(
                        DailyReport.site_id == s_id,
                        DailyReport.reporting_date == rep_date
                    ).first()
                    if not existing_rep and site_pm:
                        rep = DailyReport(
                            site_id=s_id,
                            reporting_date=rep_date,
                            status="VALIDATED",
                            current_version=1,
                            submitted_by=site_pm.id,
                            site_manager_remarks=f"Daily operations log for {s_id}."
                        )
                        db.add(rep)
                        db.flush()

                        db.add(ProgressRecord(
                            daily_report_id=rep.id,
                            site_id=s_id,
                            work_package="Substructure Works",
                            activity_name="Reinforcement & Shuttering",
                            unit_of_measure="sqm",
                            planned_quantity=60.0,
                            actual_quantity=58.0 if s_id != "CS-REM-04" else 42.0,
                            cumulative_quantity=180.0 + (day_offset * 50.0)
                        ))

                        db.add(ManpowerRecord(
                            daily_report_id=rep.id,
                            site_id=s_id,
                            trade_category="Masonry & Civil",
                            contractor_name="Prime Builders",
                            planned_count=25,
                            actual_count=24 if s_id != "CS-REM-04" else 18,
                            overtime_hours=0.0
                        ))

                        db.add(ExpenditureRecord(
                            daily_report_id=rep.id,
                            site_id=s_id,
                            cost_code="MAT-CIV-01",
                            category="Materials",
                            planned_amount=250000.0,
                            actual_amount=248000.0 if s_id != "CS-MUM-02" else 285000.0,
                            vendor_name="National Steel & Cement",
                            invoice_ref=f"INV-{s_id}-{day_offset}"
                        ))

        # 7. Seed Weekly Insights Reports
        pune_manager = user_map.get("pm.pune@cld.com")
        admin_user = user_map.get("admin@cld.com")
        if pune_manager and admin_user:
            existing_wr = db.query(WeeklyReport).filter(
                WeeklyReport.site_id == "CS-PUN-01",
                WeeklyReport.week_code == "2026-W43"
            ).first()

            if not existing_wr:
                wr_prev = WeeklyReport(
                    site_id="CS-PUN-01",
                    week_code="2026-W43",
                    start_date=date.today() - timedelta(days=14),
                    end_date=date.today() - timedelta(days=7),
                    status="PUBLISHED",
                    current_version=1,
                    site_manager_id=pune_manager.id,
                    executive_summary="Solid foundation progress achieved during Week 43. Substructure columns poured on schedule with 100% human-audited safety compliance.",
                    top_achievements="Zone 1 basement slab completed 2 days ahead of milestone. Concrete cube strengths exceeded 35 MPa.",
                    critical_concerns="Ready-mix transit delays due to highway lane closure.",
                    corporate_assistance_needed="Coordinate with regional logistics for cement dispatch priority.",
                    published_at=date.today() - timedelta(days=6),
                    published_by=admin_user.id
                )
                db.add(wr_prev)
                db.flush()

                db.add(WeeklyInsightItem(
                    weekly_report_id=wr_prev.id,
                    category="MANAGEMENT_PRIORITY",
                    title="Procure heavy mobile crane for tower crane erection",
                    description="250T telescopic crane required for week 46 mobilization.",
                    severity="HIGH",
                    owner_name="Plant & Machinery Lead",
                    target_date=date.today() + timedelta(days=10),
                    status="RESOLVED"
                ))

                db.add(WeeklyDepartmentalInput(
                    weekly_report_id=wr_prev.id,
                    department="SAFETY",
                    author_id=user_map.get("safety.pune@cld.com", admin_user).id,
                    status="SUBMITTED",
                    narrative="Zero lost-time injuries. 100% of scaffold working platforms inspected with green tags posted.",
                    metrics_json={"inspections": 3, "safe_observations": 14, "incidents": 0}
                ))

                db.add(WeeklyDepartmentalInput(
                    weekly_report_id=wr_prev.id,
                    department="QUALITY",
                    author_id=user_map.get("quality.pune@cld.com", admin_user).id,
                    status="SUBMITTED",
                    narrative="All 16 structural pour checklists verified compliant. Rebar cover blocks 100% certified.",
                    metrics_json={"checklists_passed": 16, "defects_rectified": 2, "open_ncrs": 0}
                ))

        # 8. Seed Approved Construction Documents & Document Chunks for RAG Chatbot
        if admin_user:
            existing_doc = db.query(DocumentUpload).filter(DocumentUpload.site_id == "CS-PUN-01").first()
            if not existing_doc:
                doc1 = DocumentUpload(
                    site_id="CS-PUN-01",
                    filename="Structural_Specification_IS456_Concrete.pdf",
                    file_path="/storage/documents/CS-PUN-01/Structural_Specification_IS456_Concrete.pdf",
                    file_type="PDF",
                    file_size_bytes=1048576,
                    status="PROCESSED",
                    uploaded_by=admin_user.id
                )
                db.add(doc1)
                db.flush()

                db.add(DocumentChunk(
                    document_id=doc1.id,
                    site_id="CS-PUN-01",
                    chunk_index=1,
                    section_title="M35 Mix Design and Curing Protocol",
                    content_text="All structural columns and transfer slabs for Pune Commercial Tower shall utilize M35 grade ready-mix concrete with maximum aggregate size 20mm. Moist curing must continue uninterrupted for a minimum of 14 days under geotextile hessian covers.",
                    token_count=45
                ))
                db.add(DocumentChunk(
                    document_id=doc1.id,
                    site_id="CS-PUN-01",
                    chunk_index=2,
                    section_title="Permissible Construction Tolerances",
                    content_text="Plumbness tolerance for columns up to 30 meters height shall not exceed 10mm. Surface unevenness for unplastered concrete shall not exceed 3mm under a 3m straight edge.",
                    token_count=38
                ))

                doc2 = DocumentUpload(
                    site_id="CS-PUN-01",
                    filename="Safety_Management_Manual_Standard_Procedures.pdf",
                    file_path="/storage/documents/CS-PUN-01/Safety_Management_Manual_Standard_Procedures.pdf",
                    file_type="PDF",
                    file_size_bytes=819200,
                    status="PROCESSED",
                    uploaded_by=admin_user.id
                )
                db.add(doc2)
                db.flush()

                db.add(DocumentChunk(
                    document_id=doc2.id,
                    site_id="CS-PUN-01",
                    chunk_index=1,
                    section_title="Human-Audited Scaffold Tagging Protocol",
                    content_text="Every working scaffold above 2 meters must be physically inspected daily by the certified site safety officer before shift start. Green tags denote safe for use; red tags indicate lockout condition. Strict human observation with zero automated camera reliance.",
                    token_count=48
                ))

                logger.info("Seeded approved construction documents and chunks for RAG.")

        db.commit()
        logger.info("Database seeding completed successfully.")
    except Exception as e:
        db.rollback()
        logger.error(f"Error seeding database: {e}", exc_info=True)
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    seed_database()
