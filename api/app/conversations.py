import uuid
from datetime import datetime
from typing import Protocol

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import CurrentUser, get_current_user
from app.chat import SourceResponse
from app.database import get_engine
from app.models import Conversation, Document, DocumentChunk, Message, WorkspaceMember
from app.public_chat import MessageItem
from app.rag import UNKNOWN_ANSWER

router = APIRouter(prefix="/api/v1/workspaces/{workspace_id}", tags=["conversations & metrics"])


class WorkspaceMetricsResponse(BaseModel):
    workspace_id: str
    conversations_count: int
    messages_count: int
    sourced_answers_percent: int
    unanswered_count: int
    documents_ready: int
    is_demo_data: bool = False


class ConversationSummaryResponse(BaseModel):
    id: str
    workspace_id: str
    created_at: str
    updated_at: str
    message_count: int
    last_question: str | None
    last_answer: str | None
    has_unanswered: bool
    is_visitor: bool


class ConversationDetailResponse(BaseModel):
    id: str
    workspace_id: str
    created_at: str
    updated_at: str
    is_visitor: bool
    messages: list[MessageItem]


class UnansweredQuestionResponse(BaseModel):
    conversation_id: str
    question: str
    created_at: str


class ConversationsRepository(Protocol):
    def get_metrics(self, workspace_id: str, user_id: str) -> WorkspaceMetricsResponse: ...
    def list_conversations(self, workspace_id: str, user_id: str) -> list[ConversationSummaryResponse]: ...
    def get_conversation_detail(self, workspace_id: str, conversation_id: str, user_id: str) -> ConversationDetailResponse: ...
    def get_unanswered(self, workspace_id: str, user_id: str) -> list[UnansweredQuestionResponse]: ...


class DatabaseConversationsRepository:
    def _require_workspace_member(self, session: Session, workspace_id: uuid.UUID, user_id: uuid.UUID) -> str:
        role = session.scalar(
            select(WorkspaceMember.role).where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.user_id == user_id,
            )
        )
        if not role:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found.")
        return role

    def get_metrics(self, workspace_id: str, user_id: str) -> WorkspaceMetricsResponse:
        ws_uuid = uuid.UUID(workspace_id)
        with Session(get_engine()) as session:
            self._require_workspace_member(session, ws_uuid, uuid.UUID(user_id))

            conv_count = session.scalar(
                select(func.count(Conversation.id)).where(Conversation.workspace_id == ws_uuid)
            ) or 0

            msg_count = session.scalar(
                select(func.count(Message.id)).where(Message.workspace_id == ws_uuid)
            ) or 0

            assistant_msgs = session.scalars(
                select(Message).where(Message.workspace_id == ws_uuid, Message.role == "assistant")
            ).all()

            total_assistant = len(assistant_msgs)
            unanswered_count = sum(1 for m in assistant_msgs if m.content == UNKNOWN_ANSWER or not m.source_chunk_ids)
            supported_count = total_assistant - unanswered_count
            sourced_percent = round((supported_count / total_assistant) * 100) if total_assistant > 0 else 100

            docs_ready = session.scalar(
                select(func.count(Document.id)).where(Document.workspace_id == ws_uuid, Document.status == "ready")
            ) or 0

            return WorkspaceMetricsResponse(
                workspace_id=workspace_id,
                conversations_count=int(conv_count),
                messages_count=int(msg_count),
                sourced_answers_percent=int(sourced_percent),
                unanswered_count=int(unanswered_count),
                documents_ready=int(docs_ready),
                is_demo_data=False,
            )

    def list_conversations(self, workspace_id: str, user_id: str) -> list[ConversationSummaryResponse]:
        ws_uuid = uuid.UUID(workspace_id)
        with Session(get_engine()) as session:
            self._require_workspace_member(session, ws_uuid, uuid.UUID(user_id))

            conversations = session.scalars(
                select(Conversation)
                .where(Conversation.workspace_id == ws_uuid)
                .order_by(Conversation.updated_at.desc())
                .limit(50)
            ).all()

            results: list[ConversationSummaryResponse] = []
            for conv in conversations:
                messages = session.scalars(
                    select(Message)
                    .where(Message.conversation_id == conv.id)
                    .order_by(Message.created_at.asc())
                ).all()

                user_msgs = [m.content for m in messages if m.role == "user"]
                asst_msgs = [m for m in messages if m.role == "assistant"]

                last_q = user_msgs[-1] if user_msgs else None
                last_a = asst_msgs[-1].content if asst_msgs else None
                has_unanswered = any(m.content == UNKNOWN_ANSWER for m in asst_msgs)

                results.append(
                    ConversationSummaryResponse(
                        id=str(conv.id),
                        workspace_id=str(conv.workspace_id),
                        created_at=conv.created_at.isoformat(),
                        updated_at=conv.updated_at.isoformat(),
                        message_count=len(messages),
                        last_question=last_q,
                        last_answer=last_a,
                        has_unanswered=has_unanswered,
                        is_visitor=conv.created_by_user_id is None,
                    )
                )

            return results

    def get_conversation_detail(self, workspace_id: str, conversation_id: str, user_id: str) -> ConversationDetailResponse:
        ws_uuid = uuid.UUID(workspace_id)
        conv_uuid = uuid.UUID(conversation_id)
        with Session(get_engine()) as session:
            self._require_workspace_member(session, ws_uuid, uuid.UUID(user_id))

            conv = session.scalar(
                select(Conversation).where(Conversation.id == conv_uuid, Conversation.workspace_id == ws_uuid)
            )
            if not conv:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

            raw_messages = session.scalars(
                select(Message).where(Message.conversation_id == conv.id).order_by(Message.created_at.asc())
            ).all()

            all_chunk_ids: set[uuid.UUID] = set()
            for msg in raw_messages:
                all_chunk_ids.update(msg.source_chunk_ids)

            chunk_map: dict[str, SourceResponse] = {}
            if all_chunk_ids:
                chunk_rows = session.execute(
                    select(DocumentChunk, Document.original_filename)
                    .join(Document, Document.id == DocumentChunk.document_id)
                    .where(DocumentChunk.id.in_(all_chunk_ids))
                ).all()
                for chunk, doc_name in chunk_rows:
                    chunk_map[str(chunk.id)] = SourceResponse(
                        chunk_id=str(chunk.id),
                        document_id=str(chunk.document_id),
                        document_name=doc_name,
                        snippet=chunk.content[:280],
                        page_number=chunk.page_number,
                        section_title=chunk.section_title,
                        similarity=1.0,
                    )

            items: list[MessageItem] = []
            for msg in raw_messages:
                msg_sources = [chunk_map[str(cid)] for cid in msg.source_chunk_ids if str(cid) in chunk_map]
                items.append(
                    MessageItem(
                        id=str(msg.id),
                        role=msg.role,
                        content=msg.content,
                        is_mock=msg.is_mock,
                        created_at=msg.created_at.isoformat(),
                        sources=msg_sources,
                    )
                )

            return ConversationDetailResponse(
                id=str(conv.id),
                workspace_id=str(conv.workspace_id),
                created_at=conv.created_at.isoformat(),
                updated_at=conv.updated_at.isoformat(),
                is_visitor=conv.created_by_user_id is None,
                messages=items,
            )

    def get_unanswered(self, workspace_id: str, user_id: str) -> list[UnansweredQuestionResponse]:
        ws_uuid = uuid.UUID(workspace_id)
        with Session(get_engine()) as session:
            self._require_workspace_member(session, ws_uuid, uuid.UUID(user_id))

            unanswered_msgs = session.scalars(
                select(Message)
                .where(
                    Message.workspace_id == ws_uuid,
                    Message.role == "assistant",
                    Message.content == UNKNOWN_ANSWER,
                )
                .order_by(Message.created_at.desc())
                .limit(50)
            ).all()

            results: list[UnansweredQuestionResponse] = []
            for asst_msg in unanswered_msgs:
                prev_user_msg = session.scalar(
                    select(Message.content)
                    .where(
                        Message.conversation_id == asst_msg.conversation_id,
                        Message.role == "user",
                        Message.created_at <= asst_msg.created_at,
                    )
                    .order_by(Message.created_at.desc())
                )
                results.append(
                    UnansweredQuestionResponse(
                        conversation_id=str(asst_msg.conversation_id),
                        question=prev_user_msg or "Unknown question",
                        created_at=asst_msg.created_at.isoformat(),
                    )
                )

            return results


def get_conversations_repository() -> ConversationsRepository:
    return DatabaseConversationsRepository()


@router.get("/metrics", response_model=WorkspaceMetricsResponse)
def get_workspace_metrics(
    workspace_id: str,
    user: CurrentUser = Depends(get_current_user),
    repo: ConversationsRepository = Depends(get_conversations_repository),
) -> WorkspaceMetricsResponse:
    return repo.get_metrics(workspace_id, user.id)


@router.get("/conversations", response_model=list[ConversationSummaryResponse])
def list_workspace_conversations(
    workspace_id: str,
    user: CurrentUser = Depends(get_current_user),
    repo: ConversationsRepository = Depends(get_conversations_repository),
) -> list[ConversationSummaryResponse]:
    return repo.list_conversations(workspace_id, user.id)


@router.get("/conversations/{conversation_id}", response_model=ConversationDetailResponse)
def get_conversation_detail(
    workspace_id: str,
    conversation_id: str,
    user: CurrentUser = Depends(get_current_user),
    repo: ConversationsRepository = Depends(get_conversations_repository),
) -> ConversationDetailResponse:
    return repo.get_conversation_detail(workspace_id, conversation_id, user.id)


@router.get("/unanswered", response_model=list[UnansweredQuestionResponse])
def get_unanswered_questions(
    workspace_id: str,
    user: CurrentUser = Depends(get_current_user),
    repo: ConversationsRepository = Depends(get_conversations_repository),
) -> list[UnansweredQuestionResponse]:
    return repo.get_unanswered(workspace_id, user.id)
