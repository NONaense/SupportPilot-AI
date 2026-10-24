import logging
import uuid
from dataclasses import dataclass, replace
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.auth import CurrentUser, get_current_user
from app.config import get_settings
from app.database import get_engine
from app.models import Document, DocumentChunk, WorkspaceMember
from app.processing import DocumentValidationError, PreparedChunk, chunk_sections, extract_document
from app.storage import StorageError, SupabasePrivateStorage

logger = logging.getLogger("supportdock.documents")
router = APIRouter(prefix="/api/v1/workspaces/{workspace_id}/documents", tags=["documents"])
WRITE_ROLES = {"owner", "admin"}


class DocumentResponse(BaseModel):
    id: str
    original_filename: str
    content_type: str
    byte_size: int
    status: str
    processing_error: str | None
    extracted_characters: int
    chunk_count: int
    indexing_status: str = "pending"
    indexing_error: str | None = None


@dataclass(frozen=True)
class DocumentRecord:
    id: str
    workspace_id: str
    original_filename: str
    content_type: str
    byte_size: int
    storage_path: str
    status: str
    processing_error: str | None
    extracted_characters: int
    chunk_count: int
    indexing_status: str = "pending"
    indexing_error: str | None = None


class DatabaseDocumentRepository:
    def _role(self, session: Session, workspace_id: uuid.UUID, user_id: uuid.UUID) -> str | None:
        return session.scalar(select(WorkspaceMember.role).where(WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.user_id == user_id))

    def _require_role(self, session: Session, workspace_id: uuid.UUID, user_id: uuid.UUID, write: bool) -> str:
        role = self._role(session, workspace_id, user_id)
        if not role:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found.")
        if write and role not in WRITE_ROLES:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only workspace owners and admins can manage documents.")
        return role

    def list_for_user(self, workspace_id: str, user_id: str) -> list[DocumentRecord]:
        with Session(get_engine()) as session:
            workspace = uuid.UUID(workspace_id)
            self._require_role(session, workspace, uuid.UUID(user_id), write=False)
            rows = session.execute(
                select(Document, DocumentChunk.id)
                .outerjoin(DocumentChunk, DocumentChunk.document_id == Document.id)
                .where(Document.workspace_id == workspace)
                .order_by(Document.created_at.desc())
            ).all()
            grouped: dict[uuid.UUID, tuple[Document, int]] = {}
            for document, chunk_id in rows:
                current = grouped.get(document.id)
                grouped[document.id] = (document, (current[1] if current else 0) + (1 if chunk_id else 0))
            return [self._record(document, chunks) for document, chunks in grouped.values()]

    def authorize_workspace(self, workspace_id: str, user_id: str, write: bool = False) -> None:
        with Session(get_engine()) as session:
            self._require_role(session, uuid.UUID(workspace_id), uuid.UUID(user_id), write=write)

    def create_processing(self, workspace_id: str, user_id: str, filename: str, content_type: str, byte_size: int) -> DocumentRecord:
        with Session(get_engine(), expire_on_commit=False) as session:
            workspace = uuid.UUID(workspace_id)
            self._require_role(session, workspace, uuid.UUID(user_id), write=True)
            document_id = uuid.uuid4()
            safe_name = Path(filename).name
            document = Document(
                id=document_id,
                workspace_id=workspace,
                created_by_user_id=uuid.UUID(user_id),
                original_filename=safe_name,
                content_type=content_type,
                byte_size=byte_size,
                storage_path=f"{workspace}/{document_id}/{safe_name}",
                status="processing",
            )
            session.add(document)
            session.commit()
            return self._record(document, 0)

    def mark_ready(self, document_id: str, chunks: list[PreparedChunk]) -> DocumentRecord:
        with Session(get_engine(), expire_on_commit=False) as session:
            document = session.get(Document, uuid.UUID(document_id))
            if not document:
                raise RuntimeError("Document disappeared while it was processing.")
            session.add_all([
                DocumentChunk(
                    document_id=document.id,
                    workspace_id=document.workspace_id,
                    chunk_index=index,
                    content=chunk.content,
                    char_start=chunk.char_start,
                    char_end=chunk.char_end,
                    page_number=chunk.page_number,
                    section_title=chunk.section_title,
                )
                for index, chunk in enumerate(chunks)
            ])
            document.status = "ready"
            document.processing_error = None
            document.extracted_characters = sum(len(chunk.content) for chunk in chunks)
            session.commit()
            return self._record(document, len(chunks))

    def mark_error(self, document_id: str, safe_error: str) -> None:
        with Session(get_engine()) as session:
            session.execute(update(Document).where(Document.id == uuid.UUID(document_id)).values(status="error", processing_error=safe_error[:500]))
            session.commit()

    def get_for_user(self, workspace_id: str, document_id: str, user_id: str, write: bool = False) -> DocumentRecord:
        with Session(get_engine()) as session:
            workspace = uuid.UUID(workspace_id)
            self._require_role(session, workspace, uuid.UUID(user_id), write=write)
            document = session.scalar(select(Document).where(Document.id == uuid.UUID(document_id), Document.workspace_id == workspace))
            if not document:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
            chunk_count = session.scalar(select(func.count(DocumentChunk.id)).where(DocumentChunk.document_id == document.id)) or 0
            return self._record(document, int(chunk_count))

    def delete_metadata(self, workspace_id: str, document_id: str, user_id: str) -> None:
        with Session(get_engine()) as session:
            workspace = uuid.UUID(workspace_id)
            self._require_role(session, workspace, uuid.UUID(user_id), write=True)
            result = session.execute(delete(Document).where(Document.id == uuid.UUID(document_id), Document.workspace_id == workspace))
            if result.rowcount != 1:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
            session.commit()

    @staticmethod
    def _record(document: Document, chunk_count: int) -> DocumentRecord:
        return DocumentRecord(
            id=str(document.id), workspace_id=str(document.workspace_id), original_filename=document.original_filename,
            content_type=document.content_type, byte_size=document.byte_size, storage_path=document.storage_path,
            status=document.status, processing_error=document.processing_error,
            extracted_characters=document.extracted_characters, chunk_count=chunk_count, indexing_status=document.indexing_status, indexing_error=document.indexing_error,
        )


class DocumentService:
    def __init__(self, repository: DatabaseDocumentRepository, storage: SupabasePrivateStorage, indexer: object | None = None) -> None:
        self.repository = repository
        self.storage = storage
        self.indexer = indexer

    def list(self, workspace_id: str, user_id: str) -> list[DocumentRecord]:
        return self.repository.list_for_user(workspace_id, user_id)

    def upload(self, workspace_id: str, user_id: str, filename: str, content_type: str | None, data: bytes) -> DocumentRecord:
        settings = get_settings()
        self.repository.authorize_workspace(workspace_id, user_id, write=True)
        sections = extract_document(filename, content_type, data, settings.max_upload_bytes)
        chunks = chunk_sections(sections)
        record = self.repository.create_processing(workspace_id, user_id, filename, _stored_content_type(filename), len(data))
        try:
            self.storage.upload(record.storage_path, data, record.content_type)
        except StorageError as error:
            self.repository.mark_error(record.id, "Private storage upload failed. Please retry.")
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="The document could not be stored. Please retry.") from error
        try:
            ready = self.repository.mark_ready(record.id, chunks)
            if self.indexer:
                indexing_status = self.indexer.index_document(workspace_id, record.id, user_id)
                return replace(ready, indexing_status=indexing_status, indexing_error=None if indexing_status == "indexed" else "Indexing failed. Retry this document later.")
            return ready
        except Exception as error:
            logger.exception("document_processing_failed document_id=%s", record.id)
            try:
                self.storage.delete(record.storage_path)
            except StorageError:
                logger.error("document_cleanup_failed document_id=%s", record.id)
            self.repository.mark_error(record.id, "Document processing failed after upload. Please delete it and retry.")
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="The document could not be processed.") from error

    def delete(self, workspace_id: str, document_id: str, user_id: str) -> None:
        record = self.repository.get_for_user(workspace_id, document_id, user_id, write=True)
        try:
            self.storage.delete(record.storage_path)
        except StorageError as error:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="The stored file could not be deleted. No database records were removed.") from error
        try:
            self.repository.delete_metadata(workspace_id, document_id, user_id)
        except Exception as error:
            logger.exception("document_metadata_delete_failed document_id=%s", document_id)
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="The stored file was removed, but document metadata cleanup failed. Contact support.") from error


def _stored_content_type(filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    return "application/pdf" if suffix == ".pdf" else "text/markdown" if suffix in {".md", ".markdown"} else "text/plain"


def get_document_service() -> DocumentService:
    settings = get_settings()
    if not settings.database_url:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database is not configured.")
    from app.rag import get_rag_indexer
    return DocumentService(DatabaseDocumentRepository(), SupabasePrivateStorage(), get_rag_indexer())


def _response(record: DocumentRecord) -> DocumentResponse:
    return DocumentResponse(**{field: getattr(record, field) for field in DocumentResponse.model_fields})


@router.get("", response_model=list[DocumentResponse])
def list_documents(workspace_id: str, user: CurrentUser = Depends(get_current_user), service: DocumentService = Depends(get_document_service)) -> list[DocumentResponse]:
    return [_response(record) for record in service.list(workspace_id, user.id)]


@router.get("/{document_id}", response_model=DocumentResponse)
def get_document(workspace_id: str, document_id: str, user: CurrentUser = Depends(get_current_user), service: DocumentService = Depends(get_document_service)) -> DocumentResponse:
    return _response(service.repository.get_for_user(workspace_id, document_id, user.id))


@router.post("", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    workspace_id: str,
    file: UploadFile = File(...),
    user: CurrentUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
) -> DocumentResponse:
    clean_name = Path(file.filename or "").name.strip()
    if not clean_name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="A valid filename is required.")
    settings = get_settings()
    data = await file.read(settings.max_upload_bytes + 1)
    try:
        return _response(service.upload(workspace_id, user.id, clean_name, file.content_type, data))
    except DocumentValidationError as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)) from error
    finally:
        await file.close()


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(workspace_id: str, document_id: str, user: CurrentUser = Depends(get_current_user), service: DocumentService = Depends(get_document_service)) -> None:
    service.delete(workspace_id, document_id, user.id)


@router.post("/{document_id}/reindex", response_model=DocumentResponse)
def reindex_document(workspace_id: str, document_id: str, user: CurrentUser = Depends(get_current_user), service: DocumentService = Depends(get_document_service)) -> DocumentResponse:
    if not service.indexer:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Indexing is not configured.")
    indexing_status = service.indexer.index_document(workspace_id, document_id, user.id)
    record = service.repository.get_for_user(workspace_id, document_id, user.id, write=True)
    return _response(replace(record, indexing_status=indexing_status))
