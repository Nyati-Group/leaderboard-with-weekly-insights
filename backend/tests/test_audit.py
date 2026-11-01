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

def test_audit_logs_retrieval_and_filtering():
    admin_token = get_auth_token("admin@cld.com")
    res = client.get(
        "/api/v1/audit/logs?limit=20",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert res.status_code == 200
    logs = res.json()
    assert isinstance(logs, list)
    for log in logs:
        assert "event_type" in log
        assert "timestamp" in log
        assert "resource_type" in log

def test_audit_logs_access_control():
    # Site safety officer cannot access compliance audit ledger
    safety_token = get_auth_token("safety.pune@cld.com")
    res = client.get(
        "/api/v1/audit/logs",
        headers={"Authorization": f"Bearer {safety_token}"}
    )
    assert res.status_code == 403

    # Controller can access compliance audit ledger
    controller_token = get_auth_token("controller@cld.com")
    c_res = client.get(
        "/api/v1/audit/logs?limit=5",
        headers={"Authorization": f"Bearer {controller_token}"}
    )
    assert c_res.status_code == 200
