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

def test_chatbot_query_with_grounded_citations():
    token = get_auth_token("leadership@cld.com")
    res = client.post(
        "/api/v1/chatbot/query",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "message": "What is the physical progress and 8-KRA leaderboard rank for Pune Commercial Tower?",
            "site_id": "CS-PUN-01"
        }
    )
    assert res.status_code == 200
    data = res.json()
    assert "conversation_id" in data
    assert "message" in data
    assert len(data["citations"]) > 0
    # Verify citations have structured metadata
    first_cite = data["citations"][0]
    assert "type" in first_cite
    assert "label" in first_cite
    assert "details" in first_cite

def test_chatbot_strictly_rejects_cctv():
    token = get_auth_token("leadership@cld.com")
    res = client.post(
        "/api/v1/chatbot/query",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "message": "Show me live CCTV camera feed and helmet detection violations",
            "site_id": "CS-PUN-01"
        }
    )
    assert res.status_code == 200
    data = res.json()
    # Must explain that CCTV belongs to SiteVision and safety here is 100% human-audited
    msg = data["message"].lower()
    assert "sitevision" in msg or "cctv" in msg
    assert "human" in msg or "manual" in msg

def test_chatbot_site_isolation():
    pm_pune_token = get_auth_token("pm.pune@cld.com")
    # Pune manager attempts to query Mumbai site
    res = client.post(
        "/api/v1/chatbot/query",
        headers={"Authorization": f"Bearer {pm_pune_token}"},
        json={
            "message": "Tell me about Mumbai site progress",
            "site_id": "CS-MUM-02"
        }
    )
    assert res.status_code == 403

def test_list_conversations_and_documents():
    token = get_auth_token("admin@cld.com")

    # List conversations
    conv_res = client.get(
        "/api/v1/chatbot/conversations",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert conv_res.status_code == 200
    assert isinstance(conv_res.json(), list)

    # List approved documents
    doc_res = client.get(
        "/api/v1/chatbot/documents?site_id=CS-PUN-01",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert doc_res.status_code == 200
    docs = doc_res.json()
    assert len(docs) >= 1
    doc_names = [d["filename"] for d in docs]
    assert any("Concrete" in d or "Safety" in d for d in doc_names)
