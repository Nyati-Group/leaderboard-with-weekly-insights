import pytest
from datetime import date, timedelta
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def get_token(email: str) -> str:
    res = client.post("/api/v1/auth/login", json={"email": email, "password": "Construction@2026"})
    assert res.status_code == 200
    return res.json()["data"]["access_token"]

def test_quality_management_workflow():
    from app.core.database import SessionLocal
    from app.models.quality_safety import NCRRecord
    db = SessionLocal()
    existing_ncr = db.query(NCRRecord).filter(NCRRecord.ncr_number == "NCR-PUN-2026-001").first()
    if existing_ncr:
        db.delete(existing_ncr)
        db.commit()
    db.close()

    qo_token = get_token("quality.pune@cld.com")
    mumbai_sm_token = get_token("pm.mumbai@cld.com")

    # 1. Site isolation: Pune Quality Officer cannot submit inspection for Mumbai
    cross_res = client.post("/api/v1/quality/inspections", json={
        "site_id": "CS-MUM-02",
        "inspection_date": "2026-10-31",
        "inspection_type": "Pre-pour Concrete",
        "wbs_location": "Tower B",
        "outcome": "PASS"
    }, headers={"Authorization": f"Bearer {qo_token}"})
    assert cross_res.status_code == 403

    # 2. Pune Quality Officer creates inspection with checklist
    insp_res = client.post("/api/v1/quality/inspections", json={
        "site_id": "CS-PUN-01",
        "inspection_date": "2026-10-31",
        "inspection_type": "Rebar & Formwork Check",
        "wbs_location": "5th Floor Slab Zone 1",
        "outcome": "CONDITIONAL_PASS",
        "remarks": "Cover blocks missing on northwest beam.",
        "checklist_items": [
            {"parameter": "Rebar diameter and spacing matches GFC drawing", "is_compliant": True},
            {"parameter": "Cover blocks installed at 1m spacing", "is_compliant": False, "comments": "Missing 15 blocks"}
        ]
    }, headers={"Authorization": f"Bearer {qo_token}"})
    assert insp_res.status_code == 201
    insp_data = insp_res.json()["data"]
    assert insp_data["outcome"] == "CONDITIONAL_PASS"
    assert len(insp_data["checklist_items"]) == 2

    # 3. Quality Officer issues an NCR with rework cost and schedule impact
    ncr_res = client.post("/api/v1/quality/ncrs", json={
        "site_id": "CS-PUN-01",
        "ncr_number": "NCR-PUN-2026-001",
        "issued_to": "Sterling Infra Formworks",
        "root_cause": "Subcontractor omitted cover blocks prior to shuttering close.",
        "corrective_action_required": "Install 40mm mortar cover blocks and re-inspect before pour.",
        "defect_description": "Beam soffit insufficient concrete cover.",
        "defect_severity": "MAJOR",
        "estimated_rework_cost": 45000.0,
        "estimated_delay_days": 1
    }, headers={"Authorization": f"Bearer {qo_token}"})
    assert ncr_res.status_code == 201
    ncr_data = ncr_res.json()["data"]
    ncr_id = ncr_data["id"]
    assert ncr_data["status"] == "ISSUED"
    assert ncr_data["rework_cost"] == 45000.0
    assert ncr_data["delay_days"] == 1

    # 4. Close and verify the NCR
    close_res = client.put(f"/api/v1/quality/ncrs/{ncr_id}/close", headers={"Authorization": f"Bearer {qo_token}"})
    assert close_res.status_code == 200
    assert close_res.json()["data"]["status"] == "CLOSED"

def test_manual_safety_management_workflow():
    so_token = get_token("safety.pune@cld.com")
    mumbai_sm_token = get_token("pm.mumbai@cld.com")

    # 1. Site isolation: Pune Safety Officer cannot create inspection for Mumbai
    cross_res = client.post("/api/v1/safety/inspections", json={
        "site_id": "CS-MUM-02",
        "inspection_date": "2026-10-31",
        "inspection_type": "WEEKLY_AUDIT",
        "checklist_items": []
    }, headers={"Authorization": f"Bearer {so_token}"})
    assert cross_res.status_code == 403

    # 2. Pune Safety Officer conducts walkthrough and submits checklist
    insp_res = client.post("/api/v1/safety/inspections", json={
        "site_id": "CS-PUN-01",
        "inspection_date": "2026-10-31",
        "inspection_type": "WEEKLY_AUDIT",
        "remarks": "Overall compliance satisfactory, one scaffolding tag missing.",
        "checklist_items": [
            {"category": "PPE_COMPLIANCE", "item_description": "Mandatory Helmets & Shoes", "is_compliant": True},
            {"category": "SCAFFOLDING", "item_description": "Green Tag inspection posted", "is_compliant": False, "severity": "MEDIUM", "corrective_action_required": True},
            {"category": "ELECTRICAL", "item_description": "Industrial ELCB distribution board", "is_compliant": True}
        ]
    }, headers={"Authorization": f"Bearer {so_token}"})
    assert insp_res.status_code == 201
    insp_data = insp_res.json()["data"]
    # 2 out of 3 compliant -> 66.67%
    assert 66.0 <= insp_data["compliance_score_pct"] <= 67.0

    # 3. Safety Officer logs a field observation
    obs_res = client.post("/api/v1/safety/observations", json={
        "site_id": "CS-PUN-01",
        "observation_date": "2026-10-31",
        "category": "Working at Height",
        "severity": "HIGH",
        "description": "Worker unhooked safety harness on edge perimeter."
    }, headers={"Authorization": f"Bearer {so_token}"})
    assert obs_res.status_code == 201
    assert obs_res.json()["data"]["status"] == "REPORTED"

    # 4. Safety Officer reports an incident with lost time hours
    inc_res = client.post("/api/v1/safety/incidents", json={
        "site_id": "CS-PUN-01",
        "incident_date": "2026-10-31",
        "severity": "FIRST_AID",
        "title": "Minor hand laceration during rebar bundling",
        "description": "Worker sustained 2cm laceration. First aid administered on site clinic.",
        "injured_count": 1,
        "lost_time_hours": 2.5,
        "root_cause": "Worn-out cut-resistant gloves."
    }, headers={"Authorization": f"Bearer {so_token}"})
    assert inc_res.status_code == 201
    inc_data = inc_res.json()["data"]
    assert inc_data["severity"] == "FIRST_AID"
    assert inc_data["lost_time_hours"] == 2.5

def test_corrective_action_lifecycle_and_audit():
    so_token = get_token("safety.pune@cld.com")
    sm_token = get_token("pm.pune@cld.com")

    # 1. Safety Officer raises a corrective action
    action_res = client.post("/api/v1/actions", json={
        "site_id": "CS-PUN-01",
        "source_type": "SAFETY_OBSERVATION",
        "title": "Replace damaged safety harness and install static lifeline",
        "description": "Edge perimeter on 5th floor requires 100% tie-off lifeline.",
        "priority": "HIGH",
        "due_date": "2026-11-05"
    }, headers={"Authorization": f"Bearer {so_token}"})
    assert action_res.status_code == 201
    action_data = action_res.json()["data"]
    action_id = action_data["id"]
    assert action_data["status"] == "OPEN"
    assert len(action_data["status_history"]) == 1
    assert action_data["status_history"][0]["new_status"] == "OPEN"

    # 2. Add comment
    comment_res = client.post(f"/api/v1/actions/{action_id}/comments", json={
        "comment_text": "Procured 200m wire rope lifeline from warehouse."
    }, headers={"Authorization": f"Bearer {sm_token}"})
    assert comment_res.status_code == 200

    # 3. Transition status to IN_PROGRESS
    prog_res = client.put(f"/api/v1/actions/{action_id}/status", json={
        "new_status": "IN_PROGRESS",
        "notes": "Rigging team currently anchoring lifeline posts."
    }, headers={"Authorization": f"Bearer {sm_token}"})
    assert prog_res.status_code == 200
    assert prog_res.json()["data"]["status"] == "IN_PROGRESS"

    # 4. Transition status to CLOSED
    close_res = client.put(f"/api/v1/actions/{action_id}/status", json={
        "new_status": "CLOSED",
        "notes": "Lifeline verified with pull test. 100% compliant."
    }, headers={"Authorization": f"Bearer {so_token}"})
    assert close_res.status_code == 200
    final_data = close_res.json()["data"]
    assert final_data["status"] == "CLOSED"
    assert len(final_data["status_history"]) == 3
    assert final_data["status_history"][-1]["new_status"] == "CLOSED"
