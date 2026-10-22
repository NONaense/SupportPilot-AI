from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.auth import CurrentUser, get_current_user
from app.rag import AskResult, GroundingSource, RagService, get_rag_service

router = APIRouter(prefix="/api/v1/workspaces/{workspace_id}", tags=["knowledge chat"])


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    conversation_id: str | None = None


class SourceResponse(BaseModel):
    chunk_id: str
    document_id: str
    document_name: str
    snippet: str
    page_number: int | None
    section_title: str | None
    similarity: float


class AskResponse(BaseModel):
    answer: str
    conversation_id: str
    sources: list[SourceResponse]
    supported: bool
    is_mock: bool
    provider: str


def _source(source: GroundingSource) -> SourceResponse:
    return SourceResponse(chunk_id=source.chunk_id, document_id=source.document_id, document_name=source.document_name, snippet=source.content[:280], page_number=source.page_number, section_title=source.section_title, similarity=round(source.similarity, 4))


@router.post("/ask", response_model=AskResponse)
def ask_workspace_knowledge(workspace_id: str, payload: AskRequest, user: CurrentUser = Depends(get_current_user), service: RagService = Depends(get_rag_service)) -> AskResponse:
    result: AskResult = service.ask(workspace_id, user.id, payload.question.strip(), payload.conversation_id)
    return AskResponse(answer=result.answer, conversation_id=result.conversation_id, sources=[_source(source) for source in result.sources], supported=result.supported, is_mock=result.is_mock, provider=result.provider)
