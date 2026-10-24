import uuid
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.chat import SourceResponse
from app.main import app
from app.public_chat import (
    MessageItem,
    PublicConversationResponse,
    PublicWorkspaceResponse,
    get_public_chat_repository,
)
from app.rag import AskResult, GroundingSource, RagService, get_rag_service

client = TestClient(app)

WORKSPACE_ID = str(uuid.uuid4())
WORKSPACE_SLUG = "acme-transport"
CONVERSATION_ID = str(uuid.uuid4())
VISITOR_ID = "visitor-123"

SOURCE = GroundingSource(
    chunk_id=str(uuid.uuid4()),
    document_id=str(uuid.uuid4()),
    document_name="faq.md",
    content="Truck rental income is exempt from GST under notification 12/2017.",
    page_number=1,
    section_title="Exemption",
    similarity=0.88,
)


class InMemoryPublicChatRepository:
    def __init__(self) -> None:
        self.conversations: dict[str, PublicConversationResponse] = {
            CONVERSATION_ID: PublicConversationResponse(
                id=CONVERSATION_ID,
                workspace_id=WORKSPACE_ID,
                workspace_name="Acme Transport",
                messages=[
                    MessageItem(
                        id=str(uuid.uuid4()),
                        role="user",
                        content="Does truck rental income have GST?",
                        is_mock=False,
                        created_at="2026-10-24T12:00:00Z",
                        sources=[],
                    ),
                    MessageItem(
                        id=str(uuid.uuid4()),
                        role="assistant",
                        content="Truck rental income is exempt from GST.",
                        is_mock=True,
                        created_at="2026-10-24T12:00:02Z",
                        sources=[
                            SourceResponse(
                                chunk_id=SOURCE.chunk_id,
                                document_id=SOURCE.document_id,
                                document_name=SOURCE.document_name,
                                snippet=SOURCE.content,
                                page_number=SOURCE.page_number,
                                section_title=SOURCE.section_title,
                                similarity=SOURCE.similarity,
                            )
                        ],
                    ),
                ],
            )
        }

    def get_workspace_by_slug(self, slug: str) -> PublicWorkspaceResponse:
        if slug == WORKSPACE_SLUG:
            return PublicWorkspaceResponse(id=WORKSPACE_ID, name="Acme Transport", slug=WORKSPACE_SLUG)
        raise HTTPException(status_code=404, detail="Workspace not found.")

    def get_conversation(self, slug: str, conversation_id: str, visitor_id: str | None = None) -> PublicConversationResponse:
        if slug == WORKSPACE_SLUG and conversation_id in self.conversations:
            return self.conversations[conversation_id]
        raise HTTPException(status_code=404, detail="Conversation not found.")


class FakePublicRagService:
    def ask(self, workspace_id: str, user_id: str | None, question: str, conversation_id: str | None = None, visitor_id: str | None = None, client_ip: str | None = None) -> AskResult:
        if "exempt" in question.lower() or "truck" in question.lower():
            return AskResult(
                answer="Truck rental income is exempt from GST.",
                sources=[SOURCE],
                conversation_id=conversation_id or CONVERSATION_ID,
                is_mock=True,
                provider="mock",
                supported=True,
            )
        return AskResult(
            answer="I don't know based on the available knowledge base. Please contact a human for help.",
            sources=[],
            conversation_id=conversation_id or CONVERSATION_ID,
            is_mock=False,
            provider="none",
            supported=False,
        )


@pytest.fixture(autouse=True)
def setup_overrides():
    repo = InMemoryPublicChatRepository()
    service = FakePublicRagService()
    app.dependency_overrides[get_public_chat_repository] = lambda: repo
    app.dependency_overrides[get_rag_service] = lambda: service
    yield
    app.dependency_overrides.clear()


def test_public_workspace_lookup() -> None:
    res = client.get(f"/api/v1/public/workspaces/{WORKSPACE_SLUG}")
    assert res.status_code == 200
    data = res.json()
    assert data["name"] == "Acme Transport"
    assert data["slug"] == WORKSPACE_SLUG

    not_found = client.get("/api/v1/public/workspaces/unknown-slug")
    assert not_found.status_code == 404


def test_public_chat_ask_and_retrieve_conversation() -> None:
    # 1. Ask supported question
    ask_res = client.post(
        f"/api/v1/public/workspaces/{WORKSPACE_SLUG}/ask",
        json={
            "question": "Is truck rental exempt?",
            "visitor_id": VISITOR_ID,
        },
    )
    assert ask_res.status_code == 200
    data = ask_res.json()
    assert data["supported"] is True
    assert len(data["sources"]) == 1
    assert data["sources"][0]["document_name"] == "faq.md"

    # 2. Ask unsupported question
    ask_unsupported = client.post(
        f"/api/v1/public/workspaces/{WORKSPACE_SLUG}/ask",
        json={
            "question": "What is the capital of France?",
            "visitor_id": VISITOR_ID,
        },
    )
    assert ask_unsupported.status_code == 200
    data_unsupported = ask_unsupported.json()
    assert data_unsupported["supported"] is False
    assert len(data_unsupported["sources"]) == 0

    # 3. Retrieve conversation (refresh simulation)
    conv_res = client.get(
        f"/api/v1/public/workspaces/{WORKSPACE_SLUG}/conversations/{CONVERSATION_ID}?visitor_id={VISITOR_ID}"
    )
    assert conv_res.status_code == 200
    conv_data = conv_res.json()
    assert conv_data["id"] == CONVERSATION_ID
    assert len(conv_data["messages"]) == 2
    assert conv_data["messages"][0]["role"] == "user"
    assert conv_data["messages"][1]["role"] == "assistant"
    assert len(conv_data["messages"][1]["sources"]) == 1


def test_public_chat_validation() -> None:
    # Reject empty question
    res = client.post(
        f"/api/v1/public/workspaces/{WORKSPACE_SLUG}/ask",
        json={"question": "   ", "visitor_id": "v1"},
    )
    assert res.status_code == 422

    # Reject empty visitor_id
    res_no_vid = client.post(
        f"/api/v1/public/workspaces/{WORKSPACE_SLUG}/ask",
        json={"question": "Valid question?", "visitor_id": "   "},
    )
    assert res_no_vid.status_code == 422
