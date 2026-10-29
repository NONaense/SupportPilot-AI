from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    log_level: str = "INFO"
    api_port: int = 8000
    web_origin: str = "http://localhost:3000"
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    database_url: str = ""
    supabase_storage_bucket: str = "supportdock-documents"
    max_upload_bytes: int = 10 * 1024 * 1024
    openai_api_key: str = ""
    embedding_provider: str = "mock"
    language_model_provider: str = "mock"
    embedding_model: str = "text-embedding-3-small"
    embedding_dimensions: int = 256
    response_model: str = "gpt-4.1-mini"
    rag_match_threshold: float = 0.45
    rag_max_chunks: int = 5
    rag_question_max_chars: int = 2000
    chat_rate_limit: int = 20
    chat_rate_window_seconds: int = 60

    @property
    def cors_origins(self) -> list[str]:
        origins = [item.strip() for item in self.web_origin.split(",") if item.strip()]
        return origins or ["http://localhost:3000"]

    model_config = SettingsConfigDict(env_file=(".env", "api/.env"), extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
