from urllib.parse import quote

import httpx
from fastapi import HTTPException, status

from app.config import get_settings


class StorageError(RuntimeError):
    pass


class SupabasePrivateStorage:
    def _headers(self, content_type: str | None = None) -> dict[str, str]:
        settings = get_settings()
        if not settings.supabase_url or not settings.supabase_service_role_key:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Private document storage is not configured.")
        headers = {"apikey": settings.supabase_service_role_key, "Authorization": f"Bearer {settings.supabase_service_role_key}"}
        if content_type:
            headers["Content-Type"] = content_type
        return headers

    def upload(self, storage_path: str, content: bytes, content_type: str) -> None:
        settings = get_settings()
        url = f"{settings.supabase_url.rstrip('/')}/storage/v1/object/{settings.supabase_storage_bucket}/{quote(storage_path, safe='/')}"
        try:
            response = httpx.put(url, content=content, headers={**self._headers(content_type), "x-upsert": "false"}, timeout=20.0)
        except httpx.HTTPError as error:
            raise StorageError("Private storage could not be reached.") from error
        if not response.is_success:
            raise StorageError("Private storage rejected the upload.")

    def delete(self, storage_path: str) -> None:
        settings = get_settings()
        url = f"{settings.supabase_url.rstrip('/')}/storage/v1/object/{settings.supabase_storage_bucket}"
        try:
            response = httpx.delete(url, json={"prefixes": [storage_path]}, headers=self._headers(), timeout=20.0)
        except httpx.HTTPError as error:
            raise StorageError("Private storage could not be reached.") from error
        if not response.is_success:
            raise StorageError("Private storage rejected the delete request.")
