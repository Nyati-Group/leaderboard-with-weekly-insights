from datetime import date, timedelta
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
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
        "description": "Field safety authority for assigned site. Logs observations, verifies AI CCTV hazard detections, submits safety inputs."
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
    {
        "email": "admin@cld.com",
        "full_name": "Global Organization Administrator",
        "roles": ["ORG_ADMIN"],
        "assigned_sites": []  # Global access
    },
    {
        "email": "leadership@cld.com",
        "full_name": "Director of Operations (Executive)",
        "roles": ["EXEC_LEADERSHIP"],
        "assigned_sites": []  # Global read-only
    },
    {
        "email": "controller@cld.com",
        "full_name": "Senior Project Controller",
        "roles": ["PROJECT_CONTROLLER"],
        "assigned_sites": []  # Multi-site validation
    },
    {
        "email": "pm.pune@cld.com",
        "full_name": "Rajesh Sharma (Site Manager Pune)",
        "roles": ["SITE_MANAGER"],
        "assigned_sites": [("CS-PUN-01", "SITE_MANAGER")]
    },
    {
        "email": "safety.pune@cld.com",
        "full_name": "Vikas Patil (Safety Officer Pune)",
        "roles": ["SAFETY_OFFICER"],
        "assigned_sites": [("CS-PUN-01", "SAFETY_OFFICER")]
    },
    {
        "email": "quality.pune@cld.com",
        "full_name": "Ananya Deshmukh (Quality Officer Pune)",
        "roles": ["QUALITY_OFFICER"],
        "assigned_sites": [("CS-PUN-01", "QUALITY_OFFICER")]
    },
    {
        "email": "pm.mumbai@cld.com",
        "full_name": "Amit Kulkarni (Site Manager Mumbai)",
        "roles": ["SITE_MANAGER"],
        "assigned_sites": [("CS-MUM-02", "SITE_MANAGER")]
    }
]

DEFAULT_PASSWORD = "Construction@2026"

def seed_database():
    db: Session = SessionLocal()
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

                # Assign roles
                for r_id in u_data["roles"]:
                    role = db.query(Role).filter(Role.id == r_id).first()
                    if role:
                        user.roles.append(role)

                # Assign sites
                for s_id, role_name in u_data["assigned_sites"]:
                    assignment = SiteAssignment(
                        user_id=user.id,
                        site_id=s_id,
                        assigned_role=role_name,
                        is_active=True
                    )
                    db.add(assignment)
                logger.info(f"Seeded user: {user.email}")
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
