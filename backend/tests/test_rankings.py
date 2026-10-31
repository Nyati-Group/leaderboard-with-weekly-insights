import pytest
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

def test_get_active_methodology():
    token = get_auth_token("leadership@cld.com")
    response = client.get(
        "/api/v1/rankings/methodologies/active",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["version_code"] == "v1.0"
    assert data["is_active"] is True
    assert len(data["weights"]) == 7
    total_weight = sum(w["weight_pct"] for w in data["weights"])
    assert total_weight == 100.0

def test_get_kra_definitions():
    token = get_auth_token("leadership@cld.com")
    response = client.get(
        "/api/v1/rankings/definitions",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 8
    kra_codes = [k["code"] for k in data]
    assert "PROGRESS" in kra_codes
    assert "MANPOWER" in kra_codes
    assert "COST" in kra_codes
    assert "SCHEDULE" in kra_codes
    assert "QUALITY" in kra_codes
    assert "SAFETY" in kra_codes
    assert "CLOSURE" in kra_codes
    assert "OVERALL" in kra_codes

def test_calculate_and_retrieve_leaderboard():
    # Admin triggers calculation
    admin_token = get_auth_token("admin@cld.com")
    calc_res = client.post(
        "/api/v1/rankings/calculate",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"period_id": "2026-W44"}
    )
    assert calc_res.status_code == 200
    snapshots = calc_res.json()
    assert len(snapshots) >= 5

    # Check that positions are assigned in order
    positions = [s["ranking_position"] for s in snapshots if s["ranking_position"] is not None]
    assert positions == list(range(1, len(positions) + 1))

    # Leadership reads leaderboard
    lead_token = get_auth_token("leadership@cld.com")
    lb_res = client.get(
        "/api/v1/rankings/leaderboard?period_id=2026-W44",
        headers={"Authorization": f"Bearer {lead_token}"}
    )
    assert lb_res.status_code == 200
    lb_data = lb_res.json()
    assert len(lb_data) == len(snapshots)
    for s in lb_data:
        assert "composite_score" in s
        assert "data_completeness_pct" in s
        assert len(s["scores"]) == 7

def test_deterministic_repeatability():
    controller_token = get_auth_token("controller@cld.com")
    res1 = client.post(
        "/api/v1/rankings/calculate",
        headers={"Authorization": f"Bearer {controller_token}"},
        json={"period_id": "2026-W44"}
    )
    assert res1.status_code == 200
    scores_run1 = [(s["site_id"], s["composite_score"], s["ranking_position"]) for s in res1.json()]

    res2 = client.post(
        "/api/v1/rankings/calculate",
        headers={"Authorization": f"Bearer {controller_token}"},
        json={"period_id": "2026-W44"}
    )
    assert res2.status_code == 200
    scores_run2 = [(s["site_id"], s["composite_score"], s["ranking_position"]) for s in res2.json()]

    assert scores_run1 == scores_run2, "Deterministic 8-KRA calculations must produce identical results across runs."

def test_site_manager_cannot_trigger_calculation():
    pm_token = get_auth_token("pm.pune@cld.com")
    res = client.post(
        "/api/v1/rankings/calculate",
        headers={"Authorization": f"Bearer {pm_token}"},
        json={"period_id": "2026-W44"}
    )
    assert res.status_code == 403

def test_site_ranking_breakdown():
    lead_token = get_auth_token("leadership@cld.com")
    res = client.get(
        "/api/v1/rankings/sites/CS-PUN-01/breakdown?period_id=2026-W44",
        headers={"Authorization": f"Bearer {lead_token}"}
    )
    assert res.status_code == 200
    breakdown = res.json()
    assert breakdown["site_id"] == "CS-PUN-01"
    assert len(breakdown["scores"]) == 7
    # Verify KRA scores contain transparent metric details
    for sc in breakdown["scores"]:
        assert sc["details_json"] is not None
