import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import text

from app.chat import router as chat_router
from app.config import get_settings
from app.conversations import router as conversations_router
from app.documents import router as documents_router
from app.public_chat import router as public_chat_router
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
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)
app.include_router(workspaces_router)
app.include_router(documents_router)
app.include_router(chat_router)
app.include_router(conversations_router)
app.include_router(public_chat_router)


@app.middleware("http")
async def request_logging(request: Request, call_next):
    request_id = request.headers.get("x-request-id", str(uuid.uuid4()))
    started = time.perf_counter()
    response = await call_next(request)
    response.headers["x-request-id"] = request_id
    logger.info(
        "request_complete path=%s method=%s status=%s duration_ms=%.2f request_id=%s",
        request.url.path,
        request.method,
        response.status_code,
        (time.perf_counter() - started) * 1000,
        request_id,
    )
    return response


class HealthResponse(BaseModel):
    status: str
    service: str
    environment: str
    database: str = "unconfigured"


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
    db_status = "unconfigured"
    if settings.database_url:
        try:
            from app.database import get_engine
            with get_engine().connect() as conn:
                conn.execute(text("SELECT 1"))
            db_status = "connected"
        except Exception:
            db_status = "error"

    return HealthResponse(
        status="ok" if db_status != "error" else "degraded",
        service="supportdock-api",
        environment=settings.app_env,
        database=db_status,
    )


@app.get("/api/v1/demo/summary", response_model=DemoSummary, tags=["demo"])
async def demo_summary() -> DemoSummary:
    """Temporary, explicitly-labelled UI fixture. It does not persist or access tenant data."""
    return DemoSummary(
        workspace="Acme Fitness",
        is_demo_data=True,
        conversations_this_week=124,
        sourced_answers_percent=96,
        documents_ready=2,
    )
