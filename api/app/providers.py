import hashlib
import logging
import math
import re
import time
from dataclasses import dataclass
from typing import Protocol

import httpx

from app.config import get_settings

logger = logging.getLogger("supportdock.providers")


class ProviderError(RuntimeError):
    pass


@dataclass(frozen=True)
class GroundingSource:
    chunk_id: str
    document_id: str
    document_name: str
    content: str
    page_number: int | None
    section_title: str | None
    similarity: float


@dataclass(frozen=True)
class GenerationResult:
    text: str
    is_mock: bool
    provider: str


class EmbeddingProvider(Protocol):
    model: str
    def embed(self, texts: list[str]) -> list[list[float]]: ...


class LanguageModelProvider(Protocol):
    def generate_grounded_answer(self, question: str, sources: list[GroundingSource]) -> GenerationResult: ...


class MockEmbeddingProvider:
    model = "mock-hash-256"

    def embed(self, texts: list[str]) -> list[list[float]]:
        return [_mock_embedding(text) for text in texts]


class MockLanguageModelProvider:
    def generate_grounded_answer(self, question: str, sources: list[GroundingSource]) -> GenerationResult:
        # Deliberately deterministic and visibly non-production. It only exposes retrieved source text.
        source = sources[0]
        candidates = re.split(r"(?<=[.!?])\s+", source.content.strip())
        sentence = next((candidate for candidate in candidates if not re.search(r"ignore|system|instruction|assistant", candidate, re.I)), "The cited source contains relevant information.")
        return GenerationResult(text=f"[Mock answer] Based on the retrieved knowledge base: {sentence}", is_mock=True, provider="mock")


class OpenAIEmbeddingProvider:
    def __init__(self) -> None:
        settings = get_settings()
        if not settings.openai_api_key:
            raise ProviderError("OPENAI_API_KEY is required when EMBEDDING_PROVIDER=openai.")
        self.model = settings.embedding_model
        self.dimensions = settings.embedding_dimensions
        if self.dimensions != 256:
            raise ProviderError("EMBEDDING_DIMENSIONS must be 256 until the pgvector migration is changed.")
        self.api_key = settings.openai_api_key

    def embed(self, texts: list[str]) -> list[list[float]]:
        try:
            response = httpx.post("https://api.openai.com/v1/embeddings", headers={"Authorization": f"Bearer {self.api_key}"}, json={"model": self.model, "input": texts, "dimensions": self.dimensions, "encoding_format": "float"}, timeout=20.0)
        except httpx.TimeoutException as error:
            raise ProviderError("Embedding provider timed out.") from error
        except httpx.HTTPError as error:
            raise ProviderError("Embedding provider is unavailable.") from error
        if not response.is_success:
            raise ProviderError("Embedding provider rejected the request.")
        vectors = [item["embedding"] for item in response.json().get("data", [])]
        if len(vectors) != len(texts) or any(len(vector) != self.dimensions for vector in vectors):
            raise ProviderError("Embedding provider returned an unexpected vector dimension.")
        return vectors


class OpenAILanguageModelProvider:
    def __init__(self) -> None:
        settings = get_settings()
        if not settings.openai_api_key:
            raise ProviderError("OPENAI_API_KEY is required when LANGUAGE_MODEL_PROVIDER=openai.")
        self.model = settings.response_model
        self.api_key = settings.openai_api_key

    def generate_grounded_answer(self, question: str, sources: list[GroundingSource]) -> GenerationResult:
        instructions = """You are SupportDock, a business customer support assistant. Answer the customer's question grounded in the retrieved context below.

Rules:
1. Truth-first: Rely strictly on the retrieved context for facts, policies, numbers, prices, names, requirements, and dates. Do not invent facts, policies, prices, citations, or external information not present in the context.
2. Greetings and chit-chat: If the customer offers a greeting (e.g. "hi", "hello") or asks who you are, respond politely and briefly introduce yourself as SupportDock.
3. Partial / Multi-part questions: If part of the customer's question is answered in the context (for example, skills or policies explicitly listed in the document), answer that part accurately. If the customer asks for extra details, outside definitions, or explanations not present in the document (such as definitions of listed programming languages or outside concepts), provide the supported part and explicitly state that the document does not contain the additional definitions or details.
4. Unsupported questions: If the retrieved context contains no relevant information to answer the question at all, reply exactly:
I don't know based on the available knowledge base. Please contact a human for help."""
        context = "\n\n".join(f"[SOURCE {index + 1}: {source.document_name}; chunk={source.chunk_id}; page={source.page_number or 'n/a'}; section={source.section_title or 'n/a'}]\nBEGIN UNTRUSTED RETRIEVED DOCUMENT\n{source.content}\nEND UNTRUSTED RETRIEVED DOCUMENT" for index, source in enumerate(sources))
        payload = {"model": self.model, "instructions": instructions, "input": f"BEGIN UNTRUSTED CUSTOMER QUESTION\n{question}\nEND UNTRUSTED CUSTOMER QUESTION\n\nRETRIEVED CONTEXT:\n{context}", "temperature": 0, "store": False, "max_output_tokens": 500}
        try:
            response = httpx.post("https://api.openai.com/v1/responses", headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}, json=payload, timeout=30.0)
        except httpx.TimeoutException as error:
            raise ProviderError("Language model timed out.") from error
        except httpx.HTTPError as error:
            raise ProviderError("Language model is unavailable.") from error
        if not response.is_success:
            logger.error("OpenAI language model rejected request (%s): %s", response.status_code, response.text[:200])
            raise ProviderError(f"OpenAI API error ({response.status_code}): {response.text[:120]}")
        data = response.json()
        text = _extract_response_text(data)
        if not text:
            raise ProviderError("Language model returned no answer.")
        return GenerationResult(text=text.strip(), is_mock=False, provider="openai")


class GeminiEmbeddingProvider:
    def __init__(self) -> None:
        settings = get_settings()
        if not settings.gemini_api_key:
            raise ProviderError("GEMINI_API_KEY is required when EMBEDDING_PROVIDER=gemini.")
        self.model = settings.gemini_embedding_model
        self.dimensions = settings.embedding_dimensions
        self.api_key = settings.gemini_api_key

    def embed(self, texts: list[str]) -> list[list[float]]:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:embedContent?key={self.api_key}"
        vectors: list[list[float]] = []
        for text in texts:
            payload = {
                "model": f"models/{self.model}",
                "content": {"parts": [{"text": text}]},
                "outputDimensionality": self.dimensions,
            }
            last_err = None
            response = None
            for attempt in range(3):
                try:
                    response = httpx.post(url, json=payload, timeout=20.0)
                except httpx.TimeoutException as error:
                    last_err = ProviderError("Gemini embedding provider timed out.")
                    time.sleep(1.0)
                    continue
                except httpx.HTTPError as error:
                    last_err = ProviderError("Gemini embedding provider is unavailable.")
                    time.sleep(1.0)
                    continue

                if response.status_code in (429, 503):
                    time.sleep(1.5)
                    continue
                break

            if response is None or not response.is_success:
                status_code = response.status_code if response else 500
                resp_text = response.text[:200] if response else str(last_err)
                logger.error("Gemini embedding provider rejected request (%s): %s", status_code, resp_text)
                if status_code in (429, 503):
                    raise ProviderError("The embedding service is experiencing high demand right now. Please try again in a few moments.")
                raise ProviderError(f"Gemini embedding API error ({status_code}): {resp_text[:120]}")

            data = response.json()
            embedding_vals = data.get("embedding", {}).get("values", [])
            if len(embedding_vals) != self.dimensions:
                raise ProviderError(f"Gemini embedding provider returned {len(embedding_vals)} dimensions, expected {self.dimensions}.")
            vectors.append(embedding_vals)

        return vectors


class GeminiLanguageModelProvider:
    def __init__(self) -> None:
        settings = get_settings()
        if not settings.gemini_api_key:
            raise ProviderError("GEMINI_API_KEY is required when LANGUAGE_MODEL_PROVIDER=gemini.")
        self.model = settings.gemini_response_model
        self.api_key = settings.gemini_api_key

    def generate_grounded_answer(self, question: str, sources: list[GroundingSource]) -> GenerationResult:
        instructions = """You are SupportDock, a business customer support assistant. Answer the customer's question grounded in the retrieved context below.

Rules:
1. Truth-first: Rely strictly on the retrieved context for facts, policies, numbers, prices, names, requirements, and dates. Do not invent facts, policies, prices, citations, or external information not present in the context.
2. Greetings and chit-chat: If the customer offers a greeting (e.g. "hi", "hello") or asks who you are, respond politely and briefly introduce yourself as SupportDock.
3. Partial / Multi-part questions: If part of the customer's question is answered in the context (for example, skills or policies explicitly listed in the document), answer that part accurately. If the customer asks for extra details, outside definitions, or explanations not present in the document (such as definitions of listed programming languages or outside concepts), provide the supported part and explicitly state that the document does not contain the additional definitions or details.
4. Unsupported questions: If the retrieved context contains no relevant information to answer the question at all, reply exactly:
I don't know based on the available knowledge base. Please contact a human for help."""
        context = "\n\n".join(
            f"[SOURCE {index + 1}: {source.document_name}; chunk={source.chunk_id}; page={source.page_number or 'n/a'}; section={source.section_title or 'n/a'}]\nBEGIN UNTRUSTED RETRIEVED DOCUMENT\n{source.content}\nEND UNTRUSTED RETRIEVED DOCUMENT"
            for index, source in enumerate(sources)
        )
        payload = {
            "system_instruction": {"parts": [{"text": instructions}]},
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {
                            "text": f"BEGIN UNTRUSTED CUSTOMER QUESTION\n{question}\nEND UNTRUSTED CUSTOMER QUESTION\n\nRETRIEVED CONTEXT:\n{context}"
                        }
                    ],
                }
            ],
            "generationConfig": {"temperature": 0.0, "maxOutputTokens": 500},
        }

        # Build fallback model list to survive transient Google capacity spikes
        candidate_models = [self.model]
        for fallback in ("gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.0-flash"):
            if fallback not in candidate_models:
                candidate_models.append(fallback)

        last_error = None
        for model_name in candidate_models:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={self.api_key}"
            for attempt in range(2):
                try:
                    response = httpx.post(url, json=payload, timeout=30.0)
                except httpx.TimeoutException as error:
                    last_error = ProviderError("Gemini language model timed out.")
                    time.sleep(1.0)
                    continue
                except httpx.HTTPError as error:
                    last_error = ProviderError("Gemini language model is unavailable.")
                    time.sleep(1.0)
                    continue

                if response.status_code in (429, 503):
                    logger.warning("Gemini model %s returned %s on attempt %d: %s", model_name, response.status_code, attempt, response.text[:120])
                    last_error = ProviderError("The AI service is experiencing high demand right now. Please wait a moment and try your question again.")
                    time.sleep(1.5)
                    continue

                if not response.is_success:
                    logger.error("Gemini language model %s rejected request (%s): %s", model_name, response.status_code, response.text[:200])
                    last_error = ProviderError(f"Gemini API error ({response.status_code}): {response.text[:120]}")
                    break  # Non-retryable error for this model, try next fallback

                data = response.json()
                candidates = data.get("candidates", [])
                if not candidates:
                    last_error = ProviderError("Gemini language model returned no candidates.")
                    break
                first_candidate = candidates[0]
                parts = first_candidate.get("content", {}).get("parts", [])
                text = "".join(part.get("text", "") for part in parts).strip()
                if not text:
                    last_error = ProviderError("Gemini language model returned an empty response.")
                    break
                return GenerationResult(text=text, is_mock=False, provider="gemini")

        raise last_error or ProviderError("The AI service is currently unavailable. Please try again.")


def _extract_response_text(data: dict) -> str:
    if direct := data.get("output_text"):
        return str(direct).strip()
    texts: list[str] = []
    for item in data.get("output", []):
        if isinstance(item, dict) and item.get("type") == "message":
            for content in item.get("content", []):
                if isinstance(content, dict) and content.get("type") == "output_text" and "text" in content:
                    texts.append(content["text"])
                elif isinstance(content, dict) and "text" in content:
                    texts.append(content["text"])
                elif isinstance(content, str):
                    texts.append(content)
    return "\n".join(texts).strip()


def get_embedding_provider() -> EmbeddingProvider:
    provider = get_settings().embedding_provider.lower()
    if provider == "gemini":
        return GeminiEmbeddingProvider()
    if provider == "openai":
        return OpenAIEmbeddingProvider()
    return MockEmbeddingProvider()


def get_language_model_provider() -> LanguageModelProvider:
    provider = get_settings().language_model_provider.lower()
    if provider == "gemini":
        return GeminiLanguageModelProvider()
    if provider == "openai":
        return OpenAILanguageModelProvider()
    return MockLanguageModelProvider()


def _mock_embedding(text: str, dimensions: int = 256) -> list[float]:
    values = [0.0] * dimensions
    for token in re.findall(r"[a-z0-9]+", text.lower()):
        digest = hashlib.sha256(token.encode()).digest()
        index = int.from_bytes(digest[:2], "big") % dimensions
        values[index] += 1 if digest[2] % 2 else -1
    magnitude = math.sqrt(sum(value * value for value in values))
    return [value / magnitude for value in values] if magnitude else values
