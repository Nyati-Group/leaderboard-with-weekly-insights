import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def get_admin_token() -> str:
    res = client.post("/api/v1/auth/login", json={
        "email": "admin@cld.com",
        "password": "Construction@2026"
    })
    return res.json()["data"]["access_token"]

def test_list_sites():
    token = get_admin_token()
    response = client.get("/api/v1/sites", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    res = response.json()
    assert res["success"] is True
    sites = res["data"]
    assert len(sites) == 5
    site_ids = [s["id"] for s in sites]
    assert "CS-PUN-01" in site_ids
    assert "CS-MUM-02" in site_ids
    assert "CS-NAS-03" in site_ids
    assert "CS-REM-04" in site_ids
    assert "CS-NAG-05" in site_ids

def test_get_single_site():
    token = get_admin_token()
    response = client.get("/api/v1/sites/CS-PUN-01", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    res = response.json()
    assert res["success"] is True
    site = res["data"]
    assert site["id"] == "CS-PUN-01"
    assert site["name"] == "Pune Commercial Tower"
    assert site["metadata"] is not None
    assert site["metadata"]["contract_value"] == 1450000000.00

def test_get_nonexistent_site():
    token = get_admin_token()
    response = client.get("/api/v1/sites/NON-EXISTENT", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 404
