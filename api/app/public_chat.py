import uuid
from datetime import datetime
from typing import Protocol

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.chat import AskResponse, SourceResponse, _source
from app.database import get_engine
from app.models import Conversation, Document, DocumentChunk, Message, Workspace
from app.rag import AskResult, GroundingSource, RagService, get_rag_service

router = APIRouter(prefix="/api/v1/public/workspaces", tags=["public chat"])


class PublicWorkspaceResponse(BaseModel):
    id: str
    name: str
    slug: str


class PublicAskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    conversation_id: str | None = None
    visitor_id: str = Field(min_length=1, max_length=120)

    @field_validator("question")
    @classmethod
    def validate_question(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Question cannot be empty or whitespace only.")
        return trimmed

    @field_validator("conversation_id")
    @classmethod
    def validate_conversation_id(cls, value: str | None) -> str | None:
        if not value or not value.strip():
            return None
        try:
            return str(uuid.UUID(value.strip()))
        except ValueError:
            raise ValueError("conversation_id must be a valid UUID.")

    @field_validator("visitor_id")
    @classmethod
    def validate_visitor_id(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("visitor_id cannot be empty.")
        return trimmed


class MessageItem(BaseModel):
    id: str
    role: str
    content: str
    is_mock: bool
    created_at: str
    sources: list[SourceResponse] = []


class PublicConversationResponse(BaseModel):
    id: str
    workspace_id: str
    workspace_name: str
    messages: list[MessageItem]


class PublicChatRepository(Protocol):
    def get_workspace_by_slug(self, slug: str) -> PublicWorkspaceResponse: ...
    def get_conversation(self, slug: str, conversation_id: str, visitor_id: str | None = None) -> PublicConversationResponse: ...


class DatabasePublicChatRepository:
    def get_workspace_by_slug(self, slug: str) -> PublicWorkspaceResponse:
        with Session(get_engine()) as session:
            workspace = session.scalar(select(Workspace).where(Workspace.slug == slug.strip()))
            if not workspace:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found.")
            return PublicWorkspaceResponse(id=str(workspace.id), name=workspace.name, slug=workspace.slug)

    def get_conversation(self, slug: str, conversation_id: str, visitor_id: str | None = None) -> PublicConversationResponse:
        try:
            conv_uuid = uuid.UUID(conversation_id.strip())
        except ValueError:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

        with Session(get_engine()) as session:
            workspace = session.scalar(select(Workspace).where(Workspace.slug == slug.strip()))
            if not workspace:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found.")

            query = select(Conversation).where(Conversation.id == conv_uuid, Conversation.workspace_id == workspace.id)
            if visitor_id:
                query = query.where(Conversation.visitor_id == visitor_id.strip())
            conversation = session.scalar(query)
            if not conversation:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

            raw_messages = session.scalars(select(Message).where(Message.conversation_id == conversation.id).order_by(Message.created_at)).all()

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

            return PublicConversationResponse(
                id=str(conversation.id),
                workspace_id=str(workspace.id),
                workspace_name=workspace.name,
                messages=items,
            )


def get_public_chat_repository() -> PublicChatRepository:
    return DatabasePublicChatRepository()


@router.get("/{slug}", response_model=PublicWorkspaceResponse)
def get_public_workspace(slug: str, repo: PublicChatRepository = Depends(get_public_chat_repository)) -> PublicWorkspaceResponse:
    return repo.get_workspace_by_slug(slug)


@router.post("/{slug}/ask", response_model=AskResponse)
def ask_public_workspace(
    slug: str,
    payload: PublicAskRequest,
    repo: PublicChatRepository = Depends(get_public_chat_repository),
    service: RagService = Depends(get_rag_service),
) -> AskResponse:
    workspace = repo.get_workspace_by_slug(slug)
    result: AskResult = service.ask(
        workspace_id=workspace.id,
        user_id=None,
        question=payload.question.strip(),
        conversation_id=payload.conversation_id,
        visitor_id=payload.visitor_id,
    )
    return AskResponse(
        answer=result.answer,
        conversation_id=result.conversation_id,
        sources=[_source(source) for source in result.sources],
        supported=result.supported,
        is_mock=result.is_mock,
        provider=result.provider,
    )


@router.get("/{slug}/conversations/{conversation_id}", response_model=PublicConversationResponse)
def get_public_conversation(
    slug: str,
    conversation_id: str,
    visitor_id: str | None = Query(default=None),
    repo: PublicChatRepository = Depends(get_public_chat_repository),
) -> PublicConversationResponse:
    return repo.get_conversation(slug, conversation_id, visitor_id)
