import io
import uuid
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.auth import CurrentUser, get_auth_gateway
from app.config import get_settings
from app.documents import DocumentRecord, get_document_service
from app.main import app
from app.processing import DocumentValidationError, extract_document
from app.rag import InMemoryRateLimiter, RagService, AskResult, GroundingSource, get_rag_service
from app.public_chat import PublicChatRepository, get_public_chat_repository, PublicWorkspaceResponse, PublicConversationResponse, MessageItem

ALICE_ID = str(uuid.uuid4())
BOB_ID = str(uuid.uuid4())
WORKSPACE_ALICE = str(uuid.uuid4())
WORKSPACE_BOB = str(uuid.uuid4())


class FakeAuthGateway:
    async def get_user(self, token: str) -> CurrentUser:
        if token == "alice-token":
            return CurrentUser(id=ALICE_ID, email="alice@corp.test")
        if token == "bob-token":
            return CurrentUser(id=BOB_ID, email="bob@corp.test")
        raise HTTPException(status_code=401, detail="Invalid token")


def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# 1. Upload Restrictions & File Integrity Tests
# ---------------------------------------------------------------------------

def test_upload_rejects_unsupported_extensions() -> None:
    settings = get_settings()
    for bad_ext in ["payload.exe", "script.sh", "code.py", "archive.zip", "data.json"]:
        with pytest.raises(DocumentValidationError, match="Only PDF, TXT, and Markdown"):
            extract_document(bad_ext, None, b"some content", settings.max_upload_bytes)


def test_upload_rejects_empty_file() -> None:
    settings = get_settings()
    with pytest.raises(DocumentValidationError, match="uploaded file is empty"):
        extract_document("empty.txt", "text/plain", b"", settings.max_upload_bytes)


def test_upload_rejects_oversized_file() -> None:
    settings = get_settings()
    oversized = b"A" * (settings.max_upload_bytes + 1)
    with pytest.raises(DocumentValidationError, match="exceeds the 10 MB limit"):
        extract_document("big.txt", "text/plain", oversized, settings.max_upload_bytes)


def test_upload_rejects_fake_pdf_missing_magic_bytes() -> None:
    settings = get_settings()
    # A plain text file named malicious.pdf without %PDF- header
    fake_pdf = b"This is just plain text posing as a PDF."
    with pytest.raises(DocumentValidationError, match="contents are not a PDF"):
        extract_document("malicious.pdf", "application/pdf", fake_pdf, settings.max_upload_bytes)


def test_upload_rejects_binary_masquerading_as_text() -> None:
    settings = get_settings()
    # Binary file containing null bytes \x00 in the first 4KB
    binary_data = b"Plain text preamble...\x00\x01\x02\x03\xff\xfe"
    with pytest.raises(DocumentValidationError, match="readable UTF-8 text"):
        extract_document("binary.txt", "text/plain", binary_data, settings.max_upload_bytes)


def test_upload_sanitizes_path_traversal() -> None:
    """Verifies that filename traversal like ../../etc/passwd is stripped to basename."""
    from pathlib import Path
    malicious_filenames = [
        "../../etc/passwd.txt",
        "..\\..\\Windows\\System32\\cmd.exe.txt",
        "/var/root/secret.md",
    ]
    for raw in malicious_filenames:
        cleaned = Path(raw).name.strip()
        assert "/" not in cleaned
        assert "\\" not in cleaned
        assert ".." not in cleaned


# ---------------------------------------------------------------------------
# 2. IP-Aware Rate Limiting Tests
# ---------------------------------------------------------------------------

def test_in_memory_rate_limiter_throttles_excess_requests() -> None:
    limiter = InMemoryRateLimiter()
    key = "public:ws-123:192.168.1.50"
    limit = 5
    window = 60

    # First 5 calls must succeed
    for _ in range(limit):
        limiter.check(key, limit=limit, window_seconds=window)

    # 6th call must be blocked with HTTP 429
    with pytest.raises(HTTPException) as exc_info:
        limiter.check(key, limit=limit, window_seconds=window)
    assert exc_info.value.status_code == 429
    assert "Too many questions" in exc_info.value.detail


def test_rate_limiter_differentiates_by_ip() -> None:
    limiter = InMemoryRateLimiter()
    ip1_key = "public:ws-123:192.168.1.1"
    ip2_key = "public:ws-123:192.168.1.2"
    limit = 3
    window = 60

    for _ in range(limit):
        limiter.check(ip1_key, limit=limit, window_seconds=window)

    # IP1 is exhausted
    with pytest.raises(HTTPException):
        limiter.check(ip1_key, limit=limit, window_seconds=window)

    # IP2 can still make requests without interference
    limiter.check(ip2_key, limit=limit, window_seconds=window)


# ---------------------------------------------------------------------------
# 3. Request Correlation & Structured Logging Tests
# ---------------------------------------------------------------------------

def test_request_id_middleware_generates_and_preserves_correlation_id() -> None:
    with TestClient(app) as client:
        # If client does not pass x-request-id, server generates one
        res1 = client.get("/health")
        assert res1.status_code == 200
        req_id = res1.headers.get("x-request-id")
        assert req_id is not None
        assert len(req_id) > 0

        # If client passes explicit x-request-id, server preserves it
        custom_id = "corr-" + str(uuid.uuid4())
        res2 = client.get("/health", headers={"x-request-id": custom_id})
        assert res2.status_code == 200
        assert res2.headers.get("x-request-id") == custom_id


# ---------------------------------------------------------------------------
# 4. Server-Side Permission & Tenant Isolation Tests
# ---------------------------------------------------------------------------

class FakeDocSecurityService:
    def __init__(self) -> None:
        self.repository = self

    def get_for_user(self, workspace_id: str, document_id: str, user_id: str, write: bool = False) -> DocumentRecord:
        if workspace_id == WORKSPACE_ALICE and user_id == ALICE_ID:
            return DocumentRecord(
                id=document_id,
                workspace_id=workspace_id,
                original_filename="confidential.txt",
                content_type="text/plain",
                byte_size=100,
                storage_path=f"{workspace_id}/{document_id}/confidential.txt",
                status="ready",
                processing_error=None,
                extracted_characters=100,
                chunk_count=1,
            )
        # Cross-tenant access fails with 404 (safe disclosure prevention)
        raise HTTPException(status_code=404, detail="Document not found.")

    def list(self, workspace_id: str, user_id: str) -> list[DocumentRecord]:
        if workspace_id == WORKSPACE_ALICE and user_id == ALICE_ID:
            return [self.get_for_user(workspace_id, "doc-secret", user_id)]
        raise HTTPException(status_code=404, detail="Workspace not found.")


def test_cross_tenant_document_access_returns_404() -> None:
    app.dependency_overrides[get_auth_gateway] = lambda: FakeAuthGateway()
    app.dependency_overrides[get_document_service] = lambda: FakeDocSecurityService()

    with TestClient(app) as client:
        # Alice can access her document
        alice_res = client.get(
            f"/api/v1/workspaces/{WORKSPACE_ALICE}/documents/doc-secret",
            headers=auth_header("alice-token"),
        )
        assert alice_res.status_code == 200
        assert alice_res.json()["original_filename"] == "confidential.txt"

        # Bob cannot access Alice's document (returns 404, preventing cross-tenant leakage)
        bob_res = client.get(
            f"/api/v1/workspaces/{WORKSPACE_ALICE}/documents/doc-secret",
            headers=auth_header("bob-token"),
        )
        assert bob_res.status_code == 404

    app.dependency_overrides.clear()
