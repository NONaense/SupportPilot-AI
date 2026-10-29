import logging
import threading
import time
import uuid
from dataclasses import dataclass
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import delete, select, text, update
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_engine
from app.models import Conversation, Document, DocumentChunk, Message, Workspace, WorkspaceMember
from app.providers import EmbeddingProvider, GroundingSource, LanguageModelProvider, ProviderError, get_embedding_provider, get_language_model_provider

logger = logging.getLogger("supportdock.rag")

UNKNOWN_ANSWER = "I don't know based on the available knowledge base. Please contact a human for help."


@dataclass(frozen=True)
class AskResult:
    answer: str
    sources: list[GroundingSource]
    conversation_id: str
    is_mock: bool
    provider: str
    supported: bool


class InMemoryRateLimiter:
    def __init__(self) -> None:
        self._requests: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def check(self, key: str, limit: int, window_seconds: int) -> None:
        now = time.monotonic()
        with self._lock:
            values = [timestamp for timestamp in self._requests.get(key, []) if timestamp > now - window_seconds]
            if len(values) >= limit:
                raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many questions. Please wait before trying again.")
            values.append(now)
            self._requests[key] = values


class DatabaseRagRepository:
    def _require_member(self, session: Session, workspace_id: uuid.UUID, user_id: uuid.UUID, write: bool = False) -> str:
        role = session.scalar(select(WorkspaceMember.role).where(WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.user_id == user_id))
        if not role:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found.")
        if write and role not in {"owner", "admin"}:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only workspace owners and admins can re-index documents.")
        return role

    def chunks_for_indexing(self, workspace_id: str, document_id: str, user_id: str) -> list[tuple[str, str]]:
        with Session(get_engine()) as session:
            workspace = uuid.UUID(workspace_id)
            self._require_member(session, workspace, uuid.UUID(user_id), write=True)
            document = session.scalar(select(Document).where(Document.id == uuid.UUID(document_id), Document.workspace_id == workspace))
            if not document:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
            if document.status != "ready":
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only ready documents can be indexed.")
            if document.indexing_status == "indexing":
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Document is currently being indexed.")
            document.indexing_status = "indexing"
            document.indexing_attempts += 1
            document.indexing_error = None
            session.commit()
            rows = session.execute(select(DocumentChunk.id, DocumentChunk.content).where(DocumentChunk.document_id == document.id, DocumentChunk.workspace_id == workspace).order_by(DocumentChunk.chunk_index)).all()
            return [(str(chunk_id), content) for chunk_id, content in rows]

    def save_embeddings(self, workspace_id: str, document_id: str, vectors: list[tuple[str, list[float]]], model: str) -> None:
        with Session(get_engine()) as session:
            workspace = uuid.UUID(workspace_id)
            document = session.scalar(select(Document).where(Document.id == uuid.UUID(document_id), Document.workspace_id == workspace))
            if not document:
                raise RuntimeError("Document was removed during indexing.")
            session.execute(text("delete from chunk_embeddings where document_id = :document_id"), {"document_id": document.id})
            for chunk_id, vector in vectors:
                session.execute(text("""insert into chunk_embeddings (workspace_id, document_id, chunk_id, embedding, embedding_model)
                    values (:workspace_id, :document_id, :chunk_id, cast(:embedding as vector), :model)"""), {"workspace_id": workspace, "document_id": document.id, "chunk_id": uuid.UUID(chunk_id), "embedding": _vector_literal(vector), "model": model})
            document.indexing_status = "indexed"
            document.indexing_error = None
            document.last_indexed_at = datetime.utcnow()
            session.commit()

    def mark_index_error(self, workspace_id: str, document_id: str, message: str) -> None:
        with Session(get_engine()) as session:
            session.execute(update(Document).where(Document.id == uuid.UUID(document_id), Document.workspace_id == uuid.UUID(workspace_id)).values(indexing_status="error", indexing_error=message[:500]))
            session.commit()

    def retrieve(self, workspace_id: str, user_id: str | None, vector: list[float], limit: int, threshold: float) -> list[GroundingSource]:
        with Session(get_engine()) as session:
            workspace = uuid.UUID(workspace_id)
            if user_id:
                self._require_member(session, workspace, uuid.UUID(user_id))
            else:
                if not session.scalar(select(Workspace.id).where(Workspace.id == workspace)):
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found.")
            rows = session.execute(text("""select * from match_document_chunks(cast(:embedding as vector), :workspace_id, :match_count, :match_threshold)"""), {"embedding": _vector_literal(vector), "workspace_id": workspace, "match_count": limit, "match_threshold": threshold}).mappings().all()
            return [GroundingSource(chunk_id=str(row["chunk_id"]), document_id=str(row["document_id"]), document_name=row["document_name"], content=row["content"], page_number=row["page_number"], section_title=row["section_title"], similarity=float(row["similarity"])) for row in rows]

    def persist_exchange(self, workspace_id: str, user_id: str | None, question: str, answer: str, source_ids: list[str], is_mock: bool, conversation_id: str | None, visitor_id: str | None = None) -> str:
        with Session(get_engine(), expire_on_commit=False) as session:
            workspace = uuid.UUID(workspace_id)
            if user_id:
                owner = uuid.UUID(user_id)
                self._require_member(session, workspace, owner)
                if conversation_id:
                    conversation = session.scalar(select(Conversation).where(Conversation.id == uuid.UUID(conversation_id), Conversation.workspace_id == workspace, Conversation.created_by_user_id == owner))
                    if not conversation:
                        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")
                else:
                    conversation = Conversation(workspace_id=workspace, created_by_user_id=owner)
                    session.add(conversation)
                    session.flush()
            else:
                if not session.scalar(select(Workspace.id).where(Workspace.id == workspace)):
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found.")
                if conversation_id:
                    query = select(Conversation).where(Conversation.id == uuid.UUID(conversation_id), Conversation.workspace_id == workspace)
                    if visitor_id:
                        query = query.where(Conversation.visitor_id == visitor_id)
                    conversation = session.scalar(query)
                    if not conversation:
                        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")
                else:
                    conversation = Conversation(workspace_id=workspace, created_by_user_id=None, visitor_id=visitor_id)
                    session.add(conversation)
                    session.flush()
            session.add(Message(conversation_id=conversation.id, workspace_id=workspace, role="user", content=question, is_mock=False, source_chunk_ids=[]))
            session.add(Message(conversation_id=conversation.id, workspace_id=workspace, role="assistant", content=answer, is_mock=is_mock, source_chunk_ids=[uuid.UUID(source_id) for source_id in source_ids]))
            conversation.updated_at = datetime.utcnow()
            session.commit()
            return str(conversation.id)


class RagIndexer:
    def __init__(self, repository: DatabaseRagRepository, embeddings: EmbeddingProvider) -> None:
        self.repository = repository
        self.embeddings = embeddings

    def index_document(self, workspace_id: str, document_id: str, user_id: str) -> str:
        try:
            chunks = self.repository.chunks_for_indexing(workspace_id, document_id, user_id)
            if not chunks:
                raise ProviderError("Document has no chunks to index.")
            vectors = self.embeddings.embed([content for _, content in chunks])
            if len(vectors) != len(chunks):
                raise ProviderError("Embedding provider returned incomplete results.")
            self.repository.save_embeddings(workspace_id, document_id, list(zip([chunk_id for chunk_id, _ in chunks], vectors)), self.embeddings.model)
            return "indexed"
        except HTTPException:
            raise
        except Exception:
            # Never persist provider payloads or document content in errors/logs.
            self.repository.mark_index_error(workspace_id, document_id, "Indexing failed. Retry this document later.")
            return "error"


class RagService:
    def __init__(self, repository: DatabaseRagRepository, embeddings: EmbeddingProvider, language_model: LanguageModelProvider, rate_limiter: InMemoryRateLimiter) -> None:
        self.repository = repository
        self.embeddings = embeddings
        self.language_model = language_model
        self.rate_limiter = rate_limiter

    def ask(self, workspace_id: str, user_id: str | None, question: str, conversation_id: str | None = None, visitor_id: str | None = None, client_ip: str | None = None) -> AskResult:
        settings = get_settings()
        limiter_key = f"{workspace_id}:{user_id}" if user_id else f"public:{workspace_id}:{client_ip or visitor_id or 'anon'}"
        self.rate_limiter.check(limiter_key, settings.chat_rate_limit, settings.chat_rate_window_seconds)
        try:
            query_vector = self.embeddings.embed([question])[0]
            sources = self.repository.retrieve(workspace_id, user_id, query_vector, settings.rag_max_chunks, settings.rag_match_threshold)
            sources = [source for source in sources if source.similarity >= settings.rag_match_threshold]
        except ProviderError as error:
            logger.error("Knowledge search failed: %s", error)
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Knowledge search is temporarily unavailable: {error}") from error
        if not sources:
            conversation = self.repository.persist_exchange(workspace_id, user_id, question, UNKNOWN_ANSWER, [], False, conversation_id, visitor_id=visitor_id)
            return AskResult(answer=UNKNOWN_ANSWER, sources=[], conversation_id=conversation, is_mock=False, provider="none", supported=False)
        try:
            generated = self.language_model.generate_grounded_answer(question, sources)
        except ProviderError as error:
            logger.error("Answer generation failed: %s", error)
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Answer generation is temporarily unavailable: {error}") from error
        conversation = self.repository.persist_exchange(workspace_id, user_id, question, generated.text, [source.chunk_id for source in sources], generated.is_mock, conversation_id, visitor_id=visitor_id)
        return AskResult(answer=generated.text, sources=sources, conversation_id=conversation, is_mock=generated.is_mock, provider=generated.provider, supported=True)


def _vector_literal(vector: list[float]) -> str:
    return "[" + ",".join(f"{value:.8f}" for value in vector) + "]"


_rate_limiter = InMemoryRateLimiter()


def get_rag_service() -> RagService:
    if not get_settings().database_url:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database is not configured.")
    return RagService(DatabaseRagRepository(), get_embedding_provider(), get_language_model_provider(), _rate_limiter)


def get_rag_indexer() -> RagIndexer:
    if not get_settings().database_url:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database is not configured.")
    return RagIndexer(DatabaseRagRepository(), get_embedding_provider())
