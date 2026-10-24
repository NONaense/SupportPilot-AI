import uuid
from unittest.mock import ANY

import pytest
from fastapi.testclient import TestClient

from app.auth import CurrentUser, get_auth_gateway
from app.main import app
from app.workspaces import WorkspaceRecord, get_workspace_repository

ALICE = str(uuid.uuid4())
BOB = str(uuid.uuid4())


class FakeAuthGateway:
    async def get_user(self, access_token: str) -> CurrentUser:
        if access_token == "alice-token":
            return CurrentUser(id=ALICE, email="alice@example.test")
        if access_token == "bob-token":
            return CurrentUser(id=BOB, email="bob@example.test")
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="Invalid or expired session.")


class InMemoryWorkspaceRepository:
    def __init__(self) -> None:
        self.records: list[tuple[str, WorkspaceRecord]] = [
            (ALICE, WorkspaceRecord(id=str(uuid.uuid4()), name="Alice Fitness", slug="alice-fitness", role="owner")),
            (BOB, WorkspaceRecord(id=str(uuid.uuid4()), name="Bob Bakery", slug="bob-bakery", role="owner")),
        ]

    def list_for_user(self, user_id: str) -> list[WorkspaceRecord]:
        return [record for owner_id, record in self.records if owner_id == user_id]

    def create_for_owner(self, user_id: str, name: str) -> WorkspaceRecord:
        record = WorkspaceRecord(id=str(uuid.uuid4()), name=name.strip(), slug=f"{name.lower().replace(' ', '-')}-fixture", role="owner")
        self.records.append((user_id, record))
        return record


@pytest.fixture
def client() -> TestClient:
    repository = InMemoryWorkspaceRepository()
    app.dependency_overrides[get_auth_gateway] = lambda: FakeAuthGateway()
    app.dependency_overrides[get_workspace_repository] = lambda: repository
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_workspace_route_rejects_missing_bearer_token(client: TestClient) -> None:
    response = client.get("/api/v1/workspaces")
    assert response.status_code == 401


def test_workspace_listing_is_scoped_to_verified_owner(client: TestClient) -> None:
    response = client.get("/api/v1/workspaces", headers={"Authorization": "Bearer alice-token"})
    assert response.status_code == 200
    assert response.json() == [{"id": ANY, "name": "Alice Fitness", "slug": "alice-fitness", "role": "owner"}]


def test_cross_tenant_workspace_is_not_returned(client: TestClient) -> None:
    response = client.get("/api/v1/workspaces", headers={"Authorization": "Bearer bob-token"})
    assert response.status_code == 200
    assert [workspace["name"] for workspace in response.json()] == ["Bob Bakery"]
    assert "Alice Fitness" not in str(response.json())


def test_workspace_creation_assigns_authenticated_user_as_owner(client: TestClient) -> None:
    response = client.post("/api/v1/workspaces", headers={"Authorization": "Bearer alice-token"}, json={"name": "Alice Pilates"})
    assert response.status_code == 201
    assert response.json()["role"] == "owner"
    assert response.json()["name"] == "Alice Pilates"


def test_workspace_creation_rejects_whitespace_name(client: TestClient) -> None:
    response = client.post("/api/v1/workspaces", headers={"Authorization": "Bearer alice-token"}, json={"name": "   "})
    assert response.status_code == 422


def test_workspace_route_rejects_invalid_session(client: TestClient) -> None:
    response = client.get("/api/v1/workspaces", headers={"Authorization": "Bearer not-a-session"})
    assert response.status_code == 401
