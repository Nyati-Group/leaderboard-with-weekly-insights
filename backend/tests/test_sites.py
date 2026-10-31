import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_list_sites():
    response = client.get("/api/v1/sites")
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
    response = client.get("/api/v1/sites/CS-PUN-01")
    assert response.status_code == 200
    res = response.json()
    assert res["success"] is True
    site = res["data"]
    assert site["id"] == "CS-PUN-01"
    assert site["name"] == "Pune Commercial Tower"
    assert site["metadata"] is not None
    assert site["metadata"]["contract_value"] == 1450000000.00

def test_get_nonexistent_site():
    response = client.get("/api/v1/sites/NON-EXISTENT")
    assert response.status_code == 404
