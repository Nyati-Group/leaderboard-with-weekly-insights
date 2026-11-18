import pytest
from datetime import date
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def get_token(email: str) -> str:
    res = client.post("/api/v1/auth/login", json={"email": email, "password": "Construction@2026"})
    assert res.status_code == 200
    return res.json()["data"]["access_token"]

def test_daily_report_lifecycle_and_governance():
    from app.core.database import SessionLocal
    from app.models.operations import DailyReport
    
    # Clean up test date record if left from previous runs
    test_date = date(2026, 10, 20)
    db = SessionLocal()
    existing = db.query(DailyReport).filter(
        DailyReport.site_id == "CS-PUN-01",
        DailyReport.reporting_date == test_date
    ).first()
    if existing:
        db.delete(existing)
        db.commit()
    db.close()

    pune_sm_token = get_token("pm.pune@cld.com")
    mumbai_sm_token = get_token("pm.mumbai@cld.com")
    controller_token = get_token("controller@cld.com")

    # 1. Horizontal Isolation: Pune SM cannot create report for Mumbai
    cross_res = client.post("/api/v1/daily-reports", json={
        "site_id": "CS-MUM-02",
        "reporting_date": "2026-10-20",
        "progress_records": []
    }, headers={"Authorization": f"Bearer {pune_sm_token}"})
    assert cross_res.status_code == 403
    assert "Cross-site access denied" in cross_res.json()["detail"]

    # 2. Pune SM creates a draft report for Pune
    draft_payload = {
        "site_id": "CS-PUN-01",
        "reporting_date": "2026-10-20",
        "site_manager_remarks": "Column casting on 4th floor completed on schedule.",
        "progress_records": [
            {
                "work_package": "Superstructure",
                "activity_name": "R.C.C Column Pouring",
                "unit_of_measure": "cum",
                "planned_quantity": 45.0,
                "actual_quantity": 42.5,
                "cumulative_quantity": 380.0,
                "notes": "Slight pump downtime of 30 mins."
            }
        ],
        "manpower_records": [
            {
                "trade_category": "Carpenters",
                "contractor_name": "Sterling Infra Formworks",
                "planned_count": 14,
                "actual_count": 12,
                "overtime_hours": 2.0
            },
            {
                "trade_category": "Bar Benders",
                "contractor_name": "Mahalaxmi Steels",
                "planned_count": 18,
                "actual_count": 18,
                "overtime_hours": 0.0
            }
        ],
        "expenditure_records": [
            {
                "cost_code": "MAT-CONC-04",
                "category": "Materials",
                "planned_amount": 280000.0,
                "actual_amount": 272000.0,
                "vendor_name": "UltraTech RMC",
                "invoice_ref": "UT-PUN-9921"
            }
        ],
        "activity_records": [
            {
                "name": "Beam reinforcement inspection",
                "status": "COMPLETED",
                "blockers": None,
                "mitigation_steps": None
            }
        ]
    }

    create_res = client.post("/api/v1/daily-reports", json=draft_payload, headers={"Authorization": f"Bearer {pune_sm_token}"})
    assert create_res.status_code == 201
    report_data = create_res.json()["data"]
    report_id = report_data["id"]
    assert report_data["status"] == "DRAFT"
    assert report_data["current_version"] == 1
    assert len(report_data["progress_records"]) == 1
    assert len(report_data["manpower_records"]) == 2
    assert len(report_data["expenditure_records"]) == 1

    # 3. Mumbai SM cannot view Pune report -> 403 Forbidden
    mumbai_view_res = client.get(f"/api/v1/daily-reports/{report_id}", headers={"Authorization": f"Bearer {mumbai_sm_token}"})
    assert mumbai_view_res.status_code == 403

    # 4. Pune SM submits the daily report
    submit_res = client.post(f"/api/v1/daily-reports/{report_id}/submit", headers={"Authorization": f"Bearer {pune_sm_token}"})
    assert submit_res.status_code == 200
    assert submit_res.json()["data"]["status"] == "SUBMITTED"

    # 5. Controller reviews and flags a discrepancy
    flag_res = client.post(
        f"/api/v1/daily-reports/{report_id}/flag",
        json={"flagged_reason": "Formwork carpenter attendance variance exceeds 10%. Please reconcile subcontractor timesheet."},
        headers={"Authorization": f"Bearer {controller_token}"}
    )
    assert flag_res.status_code == 200
    flagged_data = flag_res.json()["data"]
    assert flagged_data["status"] == "FLAGGED"
    assert flagged_data["current_version"] == 2
    assert "Formwork carpenter attendance" in flagged_data["flagged_reason"]

    # 6. Site Manager updates the draft to reconcile and resubmits
    draft_payload["site_manager_remarks"] = "Reconciled carpenter attendance: 2 workers transferred to scaffolding."
    update_res = client.post("/api/v1/daily-reports", json=draft_payload, headers={"Authorization": f"Bearer {pune_sm_token}"})
    assert update_res.status_code == 201

    resubmit_res = client.post(f"/api/v1/daily-reports/{report_id}/submit", headers={"Authorization": f"Bearer {pune_sm_token}"})
    assert resubmit_res.status_code == 200
    assert resubmit_res.json()["data"]["status"] == "SUBMITTED"

    # 7. Project Controller validates the corrected submission
    validate_res = client.post(f"/api/v1/daily-reports/{report_id}/validate", headers={"Authorization": f"Bearer {controller_token}"})
    assert validate_res.status_code == 200
    assert validate_res.json()["data"]["status"] == "VALIDATED"

    # 8. Check version snapshots history: Should contain both versions
    versions_res = client.get(f"/api/v1/daily-reports/{report_id}/versions", headers={"Authorization": f"Bearer {pune_sm_token}"})
    assert versions_res.status_code == 200
    versions = versions_res.json()["data"]
    assert len(versions) == 2
    assert versions[0]["version_number"] == 2
    assert versions[1]["version_number"] == 1


def _delete_daily_report(site_id: str, reporting_date: date):
    from app.core.database import SessionLocal
    from app.models.operations import DailyReport

    db = SessionLocal()
    existing = db.query(DailyReport).filter(
        DailyReport.site_id == site_id,
        DailyReport.reporting_date == reporting_date
    ).first()
    if existing:
        db.delete(existing)
        db.commit()
    db.close()


def test_daily_report_role_separation():
    """Read-only and domain-officer roles cannot author daily reports; only Controllers review,
    and nobody validates a report they submitted themselves."""
    test_date = date(2026, 10, 21)
    _delete_daily_report("CS-PUN-01", test_date)

    payload = {"site_id": "CS-PUN-01", "reporting_date": str(test_date), "progress_records": []}
    auth = lambda email: {"Authorization": f"Bearer {get_token(email)}"}

    # Executive Leadership is read-only, even though it can see every site
    exec_res = client.post("/api/v1/daily-reports", json=payload, headers=auth("leadership@cld.com"))
    assert exec_res.status_code == 403

    # Safety and Quality Officers record findings in their own modules, not daily reports
    assert client.post("/api/v1/daily-reports", json=payload, headers=auth("safety.pune@cld.com")).status_code == 403
    assert client.post("/api/v1/daily-reports", json=payload, headers=auth("quality.pune@cld.com")).status_code == 403

    # Site Manager authors the report; officers cannot submit it on their behalf
    create_res = client.post("/api/v1/daily-reports", json=payload, headers=auth("pm.pune@cld.com"))
    assert create_res.status_code == 201
    report_id = create_res.json()["data"]["id"]
    assert client.post(f"/api/v1/daily-reports/{report_id}/submit", headers=auth("quality.pune@cld.com")).status_code == 403
    assert client.post(f"/api/v1/daily-reports/{report_id}/submit", headers=auth("pm.pune@cld.com")).status_code == 200

    # Organization Admins do not review operational content (same rule as weekly reports)
    admin = auth("admin@cld.com")
    assert client.post(f"/api/v1/daily-reports/{report_id}/validate", headers=admin).status_code == 403
    assert client.post(f"/api/v1/daily-reports/{report_id}/flag", json={"flagged_reason": "x"}, headers=admin).status_code == 403

    # A Controller cannot validate a report they submitted themselves
    controller = auth("controller@cld.com")
    _delete_daily_report("CS-PUN-01", test_date)
    own = client.post("/api/v1/daily-reports", json=payload, headers=controller)
    assert own.status_code == 201
    own_id = own.json()["data"]["id"]
    assert client.post(f"/api/v1/daily-reports/{own_id}/submit", headers=controller).status_code == 200
    self_validate = client.post(f"/api/v1/daily-reports/{own_id}/validate", headers=controller)
    assert self_validate.status_code == 403
    assert "Segregation of duties" in self_validate.json()["detail"]

    _delete_daily_report("CS-PUN-01", test_date)
