import pytest
from datetime import date, timedelta
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def get_auth_token(email: str = "admin@cld.com", password: str = "Construction@2026") -> str:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password}
    )
    assert response.status_code == 200, f"Login failed for {email}: {response.text}"
    return response.json()["data"]["access_token"]

def test_weekly_report_governance_workflow():
    pm_pune_token = get_auth_token("pm.pune@cld.com")
    safety_pune_token = get_auth_token("safety.pune@cld.com")
    quality_pune_token = get_auth_token("quality.pune@cld.com")
    controller_token = get_auth_token("controller@cld.com")
    admin_token = get_auth_token("admin@cld.com")

    # Use a test-specific week code
    test_week = f"2026-W99"

    # Clean up any existing report in db directly if needed
    from app.core.database import SessionLocal
    from app.models.weekly_insights import WeeklyReport
    db = SessionLocal()
    try:
        old_rep = db.query(WeeklyReport).filter(WeeklyReport.site_id == "CS-PUN-01", WeeklyReport.week_code == test_week).first()
        if old_rep:
            db.delete(old_rep)
            db.commit()
    finally:
        db.close()

    # Step 1: Site Manager creates a draft weekly report for CS-PUN-01
    create_payload = {
        "site_id": "CS-PUN-01",
        "week_code": test_week,
        "start_date": str(date.today() - timedelta(days=7)),
        "end_date": str(date.today()),
        "executive_summary": "Steady superstructure concrete progress across Tower 1.",
        "top_achievements": "Completed Level 4 slab pour ahead of schedule.",
        "critical_concerns": "Rebar supply delivery delayed by 2 days due to regional transport strike.",
        "corporate_assistance_needed": "Expedite vendor invoice approval for UltraTech.",
        "insight_items": [
            {
                "category": "MATERIAL_BOTTLENECK",
                "title": "Rebar batch delivery hold",
                "description": "50 MT steel stuck in logistics corridor.",
                "severity": "HIGH",
                "owner_name": "Procurement Lead"
            }
        ]
    }

    create_res = client.post(
        "/api/v1/weekly-reports",
        headers={"Authorization": f"Bearer {pm_pune_token}"},
        json=create_payload
    )
    assert create_res.status_code == 201
    report_id = create_res.json()["id"]

    # Step 2: Safety Officer submits weekly safety input
    safety_input_res = client.post(
        f"/api/v1/weekly-reports/{report_id}/departmental-input",
        headers={"Authorization": f"Bearer {safety_pune_token}"},
        json={
            "department": "SAFETY",
            "narrative": "100% human-audited safety compliance on site. Zero lost-time incidents, 1 minor first-aid resolved.",
            "metrics_json": {
                "zero_incidents": True,
                "audits_completed": 4,
                "toolbox_talks": 6
            }
        }
    )
    assert safety_input_res.status_code == 200
    assert safety_input_res.json()["department"] == "SAFETY"

    # Step 3: Quality Officer submits weekly quality input
    quality_input_res = client.post(
        f"/api/v1/weekly-reports/{report_id}/departmental-input",
        headers={"Authorization": f"Bearer {quality_pune_token}"},
        json={
            "department": "QUALITY",
            "narrative": "Concrete cube compressive strength verified at 35 MPa. 2 minor checklist defects rectified.",
            "metrics_json": {
                "checklist_pass_rate": 96.5,
                "cube_tests_passed": 12,
                "open_ncrs": 0
            }
        }
    )
    assert quality_input_res.status_code == 200
    assert quality_input_res.json()["department"] == "QUALITY"

    # Step 4: Site Manager submits report for controller review
    # Check current status before submit
    rep_res = client.get(f"/api/v1/weekly-reports/{report_id}", headers={"Authorization": f"Bearer {pm_pune_token}"})
    if rep_res.json()["status"] in ["DRAFT", "FLAGGED"]:
        submit_res = client.post(
            f"/api/v1/weekly-reports/{report_id}/submit",
            headers={"Authorization": f"Bearer {pm_pune_token}"}
        )
        assert submit_res.status_code == 200
        assert submit_res.json()["status"] == "SUBMITTED"

    # Step 5: Project Controller flags a discrepancy
    review_res = client.post(
        f"/api/v1/weekly-reports/{report_id}/review",
        headers={"Authorization": f"Bearer {controller_token}"},
        json={
            "decision": "FLAGGED",
            "discrepancies_found": "Reported concrete volume exceeds batching plant delivery notes by 12 cum.",
            "action_items": "Verify delivery chits with batch plant ledger and resubmit."
        }
    )
    assert review_res.status_code == 200
    assert review_res.json()["status"] == "FLAGGED"
    assert review_res.json()["current_version"] == 2

    # Step 6: Site Manager updates and resubmits
    update_res = client.put(
        f"/api/v1/weekly-reports/{report_id}",
        headers={"Authorization": f"Bearer {pm_pune_token}"},
        json={
            "executive_summary": "Reconciled concrete pour volume with batch plant ledger (corrected by -12 cum)."
        }
    )
    assert update_res.status_code == 200

    resubmit_res = client.post(
        f"/api/v1/weekly-reports/{report_id}/submit",
        headers={"Authorization": f"Bearer {pm_pune_token}"}
    )
    assert resubmit_res.status_code == 200
    assert resubmit_res.json()["status"] == "SUBMITTED"

    # Step 7: Project Controller validates the corrected report
    validate_res = client.post(
        f"/api/v1/weekly-reports/{report_id}/review",
        headers={"Authorization": f"Bearer {controller_token}"},
        json={
            "decision": "VALIDATED",
            "discrepancies_found": None,
            "action_items": "Discrepancy reconciled. Approved for executive publication."
        }
    )
    assert validate_res.status_code == 200
    assert validate_res.json()["status"] == "VALIDATED"

    # Step 8: Admin publishes and locks report
    publish_res = client.post(
        f"/api/v1/weekly-reports/{report_id}/publish",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert publish_res.status_code == 200
    assert publish_res.json()["status"] == "PUBLISHED"
    assert publish_res.json()["published_at"] is not None

    # Step 9: Verify locked report cannot be modified
    locked_res = client.put(
        f"/api/v1/weekly-reports/{report_id}",
        headers={"Authorization": f"Bearer {pm_pune_token}"},
        json={"executive_summary": "Attempt to edit locked report"}
    )
    assert locked_res.status_code == 400

    # Step 10: Verify versions history has captured immutable snapshots
    versions_res = client.get(
        f"/api/v1/weekly-reports/{report_id}/versions",
        headers={"Authorization": f"Bearer {pm_pune_token}"}
    )
    assert versions_res.status_code == 200
    assert len(versions_res.json()) >= 2

def test_horizontal_isolation_weekly_reports():
    pm_pune_token = get_auth_token("pm.pune@cld.com")

    # Pune Manager attempts to create a report for Mumbai
    res = client.post(
        "/api/v1/weekly-reports",
        headers={"Authorization": f"Bearer {pm_pune_token}"},
        json={
            "site_id": "CS-MUM-02",
            "week_code": "2026-W44",
            "start_date": "2026-10-24",
            "end_date": "2026-10-31"
        }
    )
    assert res.status_code == 403
