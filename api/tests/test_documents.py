import uuid
from dataclasses import replace

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.auth import CurrentUser, get_auth_gateway
from app.config import get_settings
from app.documents import DocumentRecord, get_document_service
from app.main import app
import httpx
from app.storage import SupabasePrivateStorage, StorageError

ALICE = str(uuid.uuid4())
BOB = str(uuid.uuid4())
ALICE_WORKSPACE = str(uuid.uuid4())
BOB_WORKSPACE = str(uuid.uuid4())


class FakeAuthGateway:
    async def get_user(self, token: str) -> CurrentUser:
        if token == "alice-token":
            return CurrentUser(id=ALICE, email="alice@example.test")
        if token == "bob-token":
            return CurrentUser(id=BOB, email="bob@example.test")
        raise HTTPException(status_code=401, detail="Invalid or expired session.")


class FakeDocumentService:
    def __init__(self) -> None:
        self.repository = self
        self.storage_paths: set[str] = {"alice/doc-1/guide.txt"}
        self.deleted_metadata: list[str] = []
        self.documents: dict[str, tuple[str, str, DocumentRecord]] = {
            "doc-1": (ALICE_WORKSPACE, ALICE, DocumentRecord("doc-1", ALICE_WORKSPACE, "guide.txt", "text/plain", 14, "alice/doc-1/guide.txt", "ready", None, 14, 1)),
            "doc-2": (BOB_WORKSPACE, BOB, DocumentRecord("doc-2", BOB_WORKSPACE, "bob.txt", "text/plain", 10, "bob/doc-2/bob.txt", "ready", None, 10, 1)),
        }

    def _record(self, workspace_id: str, document_id: str, user_id: str, write: bool = False) -> DocumentRecord:
        item = self.documents.get(document_id)
        if not item or item[0] != workspace_id or item[1] != user_id:
            raise HTTPException(status_code=404, detail="Document not found.")
        return item[2]

    def list(self, workspace_id: str, user_id: str) -> list[DocumentRecord]:
        return [record for workspace, owner, record in self.documents.values() if workspace == workspace_id and owner == user_id]

    def authorize_workspace(self, workspace_id: str, user_id: str, write: bool = False) -> None:
        if workspace_id != ALICE_WORKSPACE or user_id != ALICE:
            raise HTTPException(status_code=404, detail="Workspace not found.")

    def get_for_user(self, workspace_id: str, document_id: str, user_id: str, write: bool = False) -> DocumentRecord:
        return self._record(workspace_id, document_id, user_id, write)

    def upload(self, workspace_id: str, user_id: str, filename: str, content_type: str | None, data: bytes) -> DocumentRecord:
        self.authorize_workspace(workspace_id, user_id, write=True)
        record = DocumentRecord("doc-uploaded", workspace_id, filename, "text/plain", len(data), "alice/doc-uploaded/guide.txt", "ready", None, len(data), 1)
        self.documents[record.id] = (workspace_id, user_id, record)
        self.storage_paths.add(record.storage_path)
        return record

    def delete(self, workspace_id: str, document_id: str, user_id: str) -> None:
        record = self._record(workspace_id, document_id, user_id, write=True)
        self.storage_paths.remove(record.storage_path)
        self.deleted_metadata.append(document_id)
        del self.documents[document_id]


@pytest.fixture
def service() -> FakeDocumentService:
    return FakeDocumentService()


@pytest.fixture
def client(service: FakeDocumentService) -> TestClient:
    app.dependency_overrides[get_auth_gateway] = lambda: FakeAuthGateway()
    app.dependency_overrides[get_document_service] = lambda: service
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_document_routes_require_authentication(client: TestClient) -> None:
    assert client.get(f"/api/v1/workspaces/{ALICE_WORKSPACE}/documents").status_code == 401


def test_document_listing_is_tenant_scoped(client: TestClient) -> None:
    response = client.get(f"/api/v1/workspaces/{ALICE_WORKSPACE}/documents", headers=auth("alice-token"))
    assert response.status_code == 200
    assert [item["original_filename"] for item in response.json()] == ["guide.txt"]


def test_cross_tenant_document_read_is_hidden(client: TestClient) -> None:
    response = client.get(f"/api/v1/workspaces/{ALICE_WORKSPACE}/documents/doc-1", headers=auth("bob-token"))
    assert response.status_code == 404


def test_authorized_upload_returns_processing_result(client: TestClient) -> None:
    response = client.post(f"/api/v1/workspaces/{ALICE_WORKSPACE}/documents", headers=auth("alice-token"), files={"file": ("guide.txt", b"hello document", "text/plain")})
    assert response.status_code == 201
    assert response.json()["status"] == "ready"
    assert response.json()["chunk_count"] == 1


def test_delete_removes_private_file_and_metadata(client: TestClient, service: FakeDocumentService) -> None:
    response = client.delete(f"/api/v1/workspaces/{ALICE_WORKSPACE}/documents/doc-1", headers=auth("alice-token"))
    assert response.status_code == 204
    assert "alice/doc-1/guide.txt" not in service.storage_paths
    assert service.deleted_metadata == ["doc-1"]


def test_cross_tenant_delete_cannot_remove_file(client: TestClient, service: FakeDocumentService) -> None:
    response = client.delete(f"/api/v1/workspaces/{ALICE_WORKSPACE}/documents/doc-1", headers=auth("bob-token"))
    assert response.status_code == 404
    assert "alice/doc-1/guide.txt" in service.storage_paths


def test_supabase_private_storage_uses_post_and_bearer_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")
    monkeypatch.setenv("SUPABASE_STORAGE_BUCKET", "supportdock-documents")
    get_settings.cache_clear()

    captured_requests = []

    def mock_post(url, *args, **kwargs):
        captured_requests.append((url, kwargs))
        request = httpx.Request("POST", url)
        return httpx.Response(200, request=request)

    monkeypatch.setattr(httpx, "post", mock_post)
    storage = SupabasePrivateStorage()
    storage.upload("workspace/doc/file.txt", b"hello", "text/plain")

    assert len(captured_requests) == 1
    url, kwargs = captured_requests[0]
    assert url == "https://example.supabase.co/storage/v1/object/supportdock-documents/workspace/doc/file.txt"
    assert kwargs["headers"]["Authorization"] == "Bearer test-service-key"
    assert kwargs["headers"]["apikey"] == "test-service-key"
    assert kwargs["headers"]["x-upsert"] == "false"
    assert kwargs["content"] == b"hello"


def test_supabase_private_storage_delete_passes_prefixes(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")
    monkeypatch.setenv("SUPABASE_STORAGE_BUCKET", "supportdock-documents")
    get_settings.cache_clear()

    captured_deletes = []

    def mock_request(method, url, *args, **kwargs):
        captured_deletes.append((method, url, kwargs))
        request = httpx.Request(method, url)
        return httpx.Response(200, request=request)

    monkeypatch.setattr(httpx, "request", mock_request)
    storage = SupabasePrivateStorage()
    storage.delete("workspace/doc/file.txt")

    assert len(captured_deletes) == 1
    method, url, kwargs = captured_deletes[0]
    assert method == "DELETE"
    assert url == "https://example.supabase.co/storage/v1/object/supportdock-documents"
    assert kwargs["json"] == {"prefixes": ["workspace/doc/file.txt"]}
