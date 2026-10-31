import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_login_success():
    response = client.post("/api/v1/auth/login", json={
        "email": "admin@cld.com",
        "password": "Construction@2026"
    })
    assert response.status_code == 200
    res = response.json()
    assert res["success"] is True
    data = res["data"]
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["user"]["email"] == "admin@cld.com"
    assert "ORG_ADMIN" in data["user"]["roles"]
    assert data["user"]["has_global_scope"] is True

def test_login_invalid_password():
    response = client.post("/api/v1/auth/login", json={
        "email": "admin@cld.com",
        "password": "WrongPassword123!"
    })
    assert response.status_code == 401
    assert "Incorrect email or password" in response.json()["detail"]

def test_refresh_token_and_logout():
    # 1. Login
    login_res = client.post("/api/v1/auth/login", json={
        "email": "leadership@cld.com",
        "password": "Construction@2026"
    }).json()
    refresh_token = login_res["data"]["refresh_token"]
    access_token = login_res["data"]["access_token"]

    # 2. Refresh
    refresh_res = client.post("/api/v1/auth/refresh", json={
        "refresh_token": refresh_token
    })
    assert refresh_res.status_code == 200
    assert "access_token" in refresh_res.json()["data"]

    # 3. Logout
    logout_res = client.post(
        "/api/v1/auth/logout",
        json={"refresh_token": refresh_token},
        headers={"Authorization": f"Bearer {access_token}"}
    )
    assert logout_res.status_code == 200

    # 4. Attempt to use revoked refresh token -> 401
    revoked_res = client.post("/api/v1/auth/refresh", json={
        "refresh_token": refresh_token
    })
    assert revoked_res.status_code == 401

def test_me_endpoint():
    login_res = client.post("/api/v1/auth/login", json={
        "email": "pm.pune@cld.com",
        "password": "Construction@2026"
    }).json()
    token = login_res["data"]["access_token"]

    me_res = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.status_code == 200
    data = me_res.json()["data"]
    assert data["email"] == "pm.pune@cld.com"
    assert "SITE_MANAGER" in data["roles"]
    assert "CS-PUN-01" in data["assigned_site_ids"]
    assert data["has_global_scope"] is False
