import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def get_token_for(email: str, password: str = "Construction@2026") -> str:
    res = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, f"Failed login for {email}: {res.text}"
    return res.json()["data"]["access_token"]

def test_unauthenticated_request_fails():
    res = client.get("/api/v1/sites")
    assert res.status_code == 401

def test_vertical_privilege_escalation_prevented():
    """Site Manager and Safety Officer cannot access admin user management endpoints."""
    sm_token = get_token_for("pm.pune@cld.com")
    so_token = get_token_for("safety.pune@cld.com")
    admin_token = get_token_for("admin@cld.com")

    # 1. Admin can list users
    admin_res = client.get("/api/v1/users", headers={"Authorization": f"Bearer {admin_token}"})
    assert admin_res.status_code == 200
    assert len(admin_res.json()["data"]) >= 7

    # 2. Site Manager tries to list users -> 403 Forbidden
    sm_res = client.get("/api/v1/users", headers={"Authorization": f"Bearer {sm_token}"})
    assert sm_res.status_code == 403

    # 3. Safety Officer tries to list users -> 403 Forbidden
    so_res = client.get("/api/v1/users", headers={"Authorization": f"Bearer {so_token}"})
    assert so_res.status_code == 403

    # 4. Site Manager tries to create a user -> 403 Forbidden
    sm_create_res = client.post("/api/v1/users", json={
        "email": "hacker@evil.com",
        "full_name": "Injected User",
        "password": "Password123!",
        "roles": ["ORG_ADMIN"]
    }, headers={"Authorization": f"Bearer {sm_token}"})
    assert sm_create_res.status_code == 403

def test_horizontal_privilege_escalation_prevented():
    """Site Managers can only access their assigned sites. Cross-site access is strictly denied."""
    pune_sm_token = get_token_for("pm.pune@cld.com")
    mumbai_sm_token = get_token_for("pm.mumbai@cld.com")
    admin_token = get_token_for("admin@cld.com")
    leadership_token = get_token_for("leadership@cld.com")

    # 1. Global roles can access all sites
    assert client.get("/api/v1/sites/CS-PUN-01", headers={"Authorization": f"Bearer {admin_token}"}).status_code == 200
    assert client.get("/api/v1/sites/CS-MUM-02", headers={"Authorization": f"Bearer {admin_token}"}).status_code == 200
    assert client.get("/api/v1/sites/CS-PUN-01", headers={"Authorization": f"Bearer {leadership_token}"}).status_code == 200
    assert client.get("/api/v1/sites/CS-MUM-02", headers={"Authorization": f"Bearer {leadership_token}"}).status_code == 200

    # 2. Pune Site Manager accessing Pune -> 200 OK
    pune_own_res = client.get("/api/v1/sites/CS-PUN-01", headers={"Authorization": f"Bearer {pune_sm_token}"})
    assert pune_own_res.status_code == 200
    assert pune_own_res.json()["data"]["id"] == "CS-PUN-01"

    # 3. Pune Site Manager attempting to access Mumbai -> 403 FORBIDDEN (Horizontal escalation blocked!)
    pune_cross_res = client.get("/api/v1/sites/CS-MUM-02", headers={"Authorization": f"Bearer {pune_sm_token}"})
    assert pune_cross_res.status_code == 403
    assert "Cross-site access denied" in pune_cross_res.json()["detail"]

    # 4. Mumbai Site Manager accessing Mumbai -> 200 OK
    mumbai_own_res = client.get("/api/v1/sites/CS-MUM-02", headers={"Authorization": f"Bearer {mumbai_sm_token}"})
    assert mumbai_own_res.status_code == 200

    # 5. Mumbai Site Manager attempting to access Pune -> 403 FORBIDDEN (Horizontal escalation blocked!)
    mumbai_cross_res = client.get("/api/v1/sites/CS-PUN-01", headers={"Authorization": f"Bearer {mumbai_sm_token}"})
    assert mumbai_cross_res.status_code == 403

    # 6. List sites query filtering test:
    # Admin sees all 5 sites
    admin_list = client.get("/api/v1/sites", headers={"Authorization": f"Bearer {admin_token}"}).json()["data"]
    assert len(admin_list) == 5

    # Pune Site Manager only sees 1 site (CS-PUN-01)
    pune_list = client.get("/api/v1/sites", headers={"Authorization": f"Bearer {pune_sm_token}"}).json()["data"]
    assert len(pune_list) == 1
    assert pune_list[0]["id"] == "CS-PUN-01"
