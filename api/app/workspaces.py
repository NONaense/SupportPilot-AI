import re
import uuid
from dataclasses import dataclass

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import CurrentUser, get_current_user
from app.config import get_settings
from app.database import get_engine
from app.models import Workspace, WorkspaceMember

router = APIRouter(prefix="/api/v1/workspaces", tags=["workspaces"])


class CreateWorkspaceRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Workspace name cannot be empty or whitespace only.")
        return trimmed


class WorkspaceResponse(BaseModel):
    id: str
    name: str
    slug: str
    role: str


@dataclass(frozen=True)
class WorkspaceRecord:
    id: str
    name: str
    slug: str
    role: str


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "workspace"


class DatabaseWorkspaceRepository:
    def list_for_user(self, user_id: str) -> list[WorkspaceRecord]:
        with Session(get_engine(), expire_on_commit=False) as session:
            rows = session.execute(
                select(Workspace, WorkspaceMember.role)
                .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
                .where(WorkspaceMember.user_id == uuid.UUID(user_id))
                .order_by(Workspace.created_at)
            ).all()
            return [WorkspaceRecord(id=str(workspace.id), name=workspace.name, slug=workspace.slug, role=role) for workspace, role in rows]

    def create_for_owner(self, user_id: str, name: str) -> WorkspaceRecord:
        owner_id = uuid.UUID(user_id)
        suffix = uuid.uuid4().hex[:8]
        workspace = Workspace(name=name.strip(), slug=f"{slugify(name)}-{suffix}", owner_user_id=owner_id)
        with Session(get_engine(), expire_on_commit=False) as session:
            try:
                session.add(workspace)
                session.flush()
                session.add(WorkspaceMember(workspace_id=workspace.id, user_id=owner_id, role="owner"))
                session.commit()
            except IntegrityError as error:
                session.rollback()
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Could not create workspace.") from error
        return WorkspaceRecord(id=str(workspace.id), name=workspace.name, slug=workspace.slug, role="owner")


def get_workspace_repository() -> DatabaseWorkspaceRepository:
    if not get_settings().database_url:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database is not configured.")
    return DatabaseWorkspaceRepository()


@router.get("", response_model=list[WorkspaceResponse])
def list_workspaces(
    user: CurrentUser = Depends(get_current_user),
    repository: DatabaseWorkspaceRepository = Depends(get_workspace_repository),
) -> list[WorkspaceResponse]:
    return [WorkspaceResponse(**record.__dict__) for record in repository.list_for_user(user.id)]


@router.post("", response_model=WorkspaceResponse, status_code=status.HTTP_201_CREATED)
def create_workspace(
    payload: CreateWorkspaceRequest,
    user: CurrentUser = Depends(get_current_user),
    repository: DatabaseWorkspaceRepository = Depends(get_workspace_repository),
) -> WorkspaceResponse:
    record = repository.create_for_owner(user.id, payload.name)
    return WorkspaceResponse(**record.__dict__)
