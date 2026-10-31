import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_root_endpoint():
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "project" in data
    assert "version" in data
    assert data["health"] == "/api/v1/health"

def test_health_check():
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    res_data = response.json()
    assert res_data["success"] is True
    assert res_data["data"]["status"] == "healthy"
    assert "version" in res_data["data"]

def test_health_db_check():
    response = client.get("/api/v1/health/db")
    assert response.status_code == 200
    res_data = response.json()
    assert res_data["success"] is True
    assert res_data["data"]["status"] == "connected"
