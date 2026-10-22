import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.config import get_settings
from app.chat import router as chat_router
from app.documents import router as documents_router
from app.workspaces import router as workspaces_router

settings = get_settings()
logging.basicConfig(level=settings.log_level, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("supportdock.api")


@asynccontextmanager
async def lifespan(_: FastAPI):
    logger.info("service_started", extra={"environment": settings.app_env})
    yield
    logger.info("service_stopped")


app = FastAPI(title="SupportDock API", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=[settings.web_origin], allow_credentials=True, allow_methods=["GET", "POST", "DELETE"], allow_headers=["*"])
app.include_router(workspaces_router)
app.include_router(documents_router)
app.include_router(chat_router)


@app.middleware("http")
async def request_logging(request: Request, call_next):
    request_id = request.headers.get("x-request-id", str(uuid.uuid4()))
    started = time.perf_counter()
    response = await call_next(request)
    response.headers["x-request-id"] = request_id
    logger.info("request_complete path=%s method=%s status=%s duration_ms=%.2f request_id=%s", request.url.path, request.method, response.status_code, (time.perf_counter() - started) * 1000, request_id)
    return response


class HealthResponse(BaseModel):
    status: str
    service: str
    environment: str


class DemoSummary(BaseModel):
    workspace: str
    is_demo_data: bool
    conversations_this_week: int
    sourced_answers_percent: int
    documents_ready: int


@app.get("/", tags=["meta"])
async def root() -> dict[str, str]:
    return {"service": "supportdock-api", "docs": "/docs"}


@app.get("/health", response_model=HealthResponse, tags=["meta"])
async def health() -> HealthResponse:
    return HealthResponse(status="ok", service="supportdock-api", environment=settings.app_env)


@app.get("/api/v1/demo/summary", response_model=DemoSummary, tags=["demo"])
async def demo_summary() -> DemoSummary:
    """Temporary, explicitly-labelled UI fixture. It does not persist or access tenant data."""
    return DemoSummary(workspace="Acme Fitness", is_demo_data=True, conversations_this_week=124, sourced_answers_percent=96, documents_ready=2)
