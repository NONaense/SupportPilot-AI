import uuid
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.auth import CurrentUser, get_auth_gateway
from app.chat import SourceResponse
from app.conversations import (
    ConversationDetailResponse,
    ConversationSummaryResponse,
    UnansweredQuestionResponse,
    WorkspaceMetricsResponse,
    get_conversations_repository,
)
from app.main import app
from app.public_chat import MessageItem

client = TestClient(app)

ADMIN_USER_ID = str(uuid.uuid4())
STRANGER_USER_ID = str(uuid.uuid4())
WORKSPACE_ID = str(uuid.uuid4())
CONVERSATION_ID = str(uuid.uuid4())


class FakeAuthGateway:
    async def get_user(self, access_token: str) -> CurrentUser:
        if access_token == "admin-token":
            return CurrentUser(id=ADMIN_USER_ID, email="admin@test.com")
        if access_token == "stranger-token":
            return CurrentUser(id=STRANGER_USER_ID, email="stranger@test.com")
        raise HTTPException(status_code=401, detail="Invalid token.")


class InMemoryConversationsRepository:
    def get_metrics(self, workspace_id: str, user_id: str) -> WorkspaceMetricsResponse:
        if workspace_id != WORKSPACE_ID or user_id != ADMIN_USER_ID:
            raise HTTPException(status_code=404, detail="Workspace not found.")
        return WorkspaceMetricsResponse(
            workspace_id=workspace_id,
            conversations_count=3,
            messages_count=6,
            sourced_answers_percent=67,
            unanswered_count=1,
            documents_ready=2,
            is_demo_data=False,
        )

    def list_conversations(self, workspace_id: str, user_id: str) -> list[ConversationSummaryResponse]:
        if workspace_id != WORKSPACE_ID or user_id != ADMIN_USER_ID:
            raise HTTPException(status_code=404, detail="Workspace not found.")
        return [
            ConversationSummaryResponse(
                id=CONVERSATION_ID,
                workspace_id=workspace_id,
                created_at="2026-10-24T12:00:00Z",
                updated_at="2026-10-24T12:01:00Z",
                message_count=2,
                last_question="What are your hours?",
                last_answer="We are open 8am to 8pm.",
                has_unanswered=False,
                is_visitor=True,
            ),
            ConversationSummaryResponse(
                id=str(uuid.uuid4()),
                workspace_id=workspace_id,
                created_at="2026-10-24T11:00:00Z",
                updated_at="2026-10-24T11:05:00Z",
                message_count=2,
                last_question="Do you sell rockets?",
                last_answer="I don't know based on the available knowledge base.",
                has_unanswered=True,
                is_visitor=True,
            ),
        ]

    def get_conversation_detail(self, workspace_id: str, conversation_id: str, user_id: str) -> ConversationDetailResponse:
        if workspace_id != WORKSPACE_ID or user_id != ADMIN_USER_ID:
            raise HTTPException(status_code=404, detail="Workspace not found.")
        if conversation_id != CONVERSATION_ID:
            raise HTTPException(status_code=404, detail="Conversation not found.")
        return ConversationDetailResponse(
            id=CONVERSATION_ID,
            workspace_id=workspace_id,
            created_at="2026-10-24T12:00:00Z",
            updated_at="2026-10-24T12:01:00Z",
            is_visitor=True,
            messages=[
                MessageItem(
                    id=str(uuid.uuid4()),
                    role="user",
                    content="What are your hours?",
                    is_mock=False,
                    created_at="2026-10-24T12:00:00Z",
                    sources=[],
                ),
                MessageItem(
                    id=str(uuid.uuid4()),
                    role="assistant",
                    content="We are open 8am to 8pm.",
                    is_mock=True,
                    created_at="2026-10-24T12:00:02Z",
                    sources=[
                        SourceResponse(
                            chunk_id=str(uuid.uuid4()),
                            document_id=str(uuid.uuid4()),
                            document_name="hours.md",
                            snippet="We are open 8am to 8pm Monday to Friday.",
                            page_number=1,
                            section_title="Hours",
                            similarity=0.92,
                        )
                    ],
                ),
            ],
        )

    def get_unanswered(self, workspace_id: str, user_id: str) -> list[UnansweredQuestionResponse]:
        if workspace_id != WORKSPACE_ID or user_id != ADMIN_USER_ID:
            raise HTTPException(status_code=404, detail="Workspace not found.")
        return [
            UnansweredQuestionResponse(
                conversation_id=str(uuid.uuid4()),
                question="Do you sell rockets?",
                created_at="2026-10-24T11:05:00Z",
            )
        ]

    def reply_to_conversation(
        self, workspace_id: str, conversation_id: str, user_id: str, message: str
    ) -> ConversationDetailResponse:
        detail = self.get_conversation_detail(workspace_id, conversation_id, user_id)
        new_msg = MessageItem(
            id=str(uuid.uuid4()),
            role="assistant",
            content=message,
            is_mock=False,
            created_at="2026-10-24T12:02:00Z",
            sources=[],
        )
        return ConversationDetailResponse(
            id=detail.id,
            workspace_id=detail.workspace_id,
            created_at=detail.created_at,
            updated_at="2026-10-24T12:02:00Z",
            is_visitor=detail.is_visitor,
            messages=detail.messages + [new_msg],
        )

    def resolve_conversation(
        self, workspace_id: str, conversation_id: str, user_id: str, note: str | None = None
    ) -> ConversationDetailResponse:
        resolution = note or "[Thread marked as resolved by support agent]"
        return self.reply_to_conversation(workspace_id, conversation_id, user_id, resolution)


@pytest.fixture(autouse=True)
def setup_overrides():
    repo = InMemoryConversationsRepository()
    app.dependency_overrides[get_auth_gateway] = lambda: FakeAuthGateway()
    app.dependency_overrides[get_conversations_repository] = lambda: repo
    yield
    app.dependency_overrides.clear()


def test_workspace_metrics_calculation() -> None:
    res = client.get(
        f"/api/v1/workspaces/{WORKSPACE_ID}/metrics",
        headers={"Authorization": "Bearer admin-token"},
    )
    assert res.status_code == 200
    metrics = res.json()
    assert metrics["conversations_count"] == 3
    assert metrics["messages_count"] == 6
    assert metrics["sourced_answers_percent"] == 67
    assert metrics["unanswered_count"] == 1
    assert metrics["documents_ready"] == 2
    assert metrics["is_demo_data"] is False


def test_list_and_inspect_conversations() -> None:
    # 1. List conversations
    res = client.get(
        f"/api/v1/workspaces/{WORKSPACE_ID}/conversations",
        headers={"Authorization": "Bearer admin-token"},
    )
    assert res.status_code == 200
    convs = res.json()
    assert len(convs) == 2
    assert convs[0]["id"] == CONVERSATION_ID
    assert convs[1]["has_unanswered"] is True

    # 2. Inspect conversation detail
    detail_res = client.get(
        f"/api/v1/workspaces/{WORKSPACE_ID}/conversations/{CONVERSATION_ID}",
        headers={"Authorization": "Bearer admin-token"},
    )
    assert detail_res.status_code == 200
    detail = detail_res.json()
    assert detail["id"] == CONVERSATION_ID
    assert len(detail["messages"]) == 2
    assert detail["messages"][0]["role"] == "user"
    assert detail["messages"][1]["role"] == "assistant"
    assert len(detail["messages"][1]["sources"]) == 1
    assert detail["messages"][1]["sources"][0]["document_name"] == "hours.md"

    # 3. List unanswered questions
    unanswered_res = client.get(
        f"/api/v1/workspaces/{WORKSPACE_ID}/unanswered",
        headers={"Authorization": "Bearer admin-token"},
    )
    assert unanswered_res.status_code == 200
    unanswered = unanswered_res.json()
    assert len(unanswered) == 1
    assert unanswered[0]["question"] == "Do you sell rockets?"


def test_conversations_tenant_isolation_and_auth() -> None:
    # Stranger receives 404 (workspace not found)
    res = client.get(
        f"/api/v1/workspaces/{WORKSPACE_ID}/metrics",
        headers={"Authorization": "Bearer stranger-token"},
    )
    assert res.status_code == 404

    # Missing auth receives 401
    unauth = client.get(f"/api/v1/workspaces/{WORKSPACE_ID}/metrics")
    assert unauth.status_code == 401


def test_admin_reply_and_resolve_conversation() -> None:
    # 1. Admin sends reply to conversation
    res = client.post(
        f"/api/v1/workspaces/{WORKSPACE_ID}/conversations/{CONVERSATION_ID}/reply",
        headers={"Authorization": "Bearer admin-token"},
        json={"message": "Yes, we now provide weekend deliveries."},
    )
    assert res.status_code == 200
    data = res.json()
    assert len(data["messages"]) == 3
    assert data["messages"][-1]["content"] == "Yes, we now provide weekend deliveries."
    assert data["messages"][-1]["role"] == "assistant"

    # 2. Admin marks conversation as resolved
    resolve_res = client.post(
        f"/api/v1/workspaces/{WORKSPACE_ID}/conversations/{CONVERSATION_ID}/resolve",
        headers={"Authorization": "Bearer admin-token"},
    )
    assert resolve_res.status_code == 200
    resolve_data = resolve_res.json()
    assert "[Thread marked as resolved" in resolve_data["messages"][-1]["content"]

    # 3. Unauthorized stranger cannot reply
    stranger_res = client.post(
        f"/api/v1/workspaces/{WORKSPACE_ID}/conversations/{CONVERSATION_ID}/reply",
        headers={"Authorization": "Bearer stranger-token"},
        json={"message": "Hack attempt"},
    )
    assert stranger_res.status_code == 404
