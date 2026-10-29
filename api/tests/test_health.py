from fastapi.testclient import TestClient

from app.config import Settings
from app.main import app


client = TestClient(app)


def test_health_returns_service_metadata() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["service"] == "supportdock-api"
    assert "database" in response.json()
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


def test_settings_cors_origins_parsing() -> None:
    # Single origin
    s1 = Settings(web_origin="http://localhost:3000")
    assert s1.cors_origins == ["http://localhost:3000"]

    # Comma-separated multiple origins
    s2 = Settings(web_origin="http://localhost:3000, https://supportdock-web.vercel.app, https://demo.example.com")
    assert s2.cors_origins == [
        "http://localhost:3000",
        "https://supportdock-web.vercel.app",
        "https://demo.example.com",
    ]

    # Empty string fallback
    s3 = Settings(web_origin="")
    assert s3.cors_origins == ["http://localhost:3000"]
