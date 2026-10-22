from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health_returns_service_metadata() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["service"] == "supportdock-api"
    assert response.headers["x-request-id"]


def test_demo_summary_is_explicitly_labelled() -> None:
    response = client.get("/api/v1/demo/summary")
    assert response.status_code == 200
    assert response.json() == {
        "workspace": "Acme Fitness",
        "is_demo_data": True,
        "conversations_this_week": 124,
        "sourced_answers_percent": 96,
        "documents_ready": 2,
    }
