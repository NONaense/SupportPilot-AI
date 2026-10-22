import io
import re
from dataclasses import dataclass
from pathlib import Path

from pypdf import PdfReader

ALLOWED_EXTENSIONS = {".pdf", ".txt", ".md", ".markdown"}
MAX_CHUNK_CHARS = 1_000
CHUNK_OVERLAP_CHARS = 150


class DocumentValidationError(ValueError):
    pass


@dataclass(frozen=True)
class ExtractedSection:
    text: str
    page_number: int | None = None
    section_title: str | None = None


@dataclass(frozen=True)
class PreparedChunk:
    content: str
    char_start: int
    char_end: int
    page_number: int | None
    section_title: str | None


def extract_document(filename: str, content_type: str | None, data: bytes, max_bytes: int) -> list[ExtractedSection]:
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise DocumentValidationError("Only PDF, TXT, and Markdown files are supported.")
    if not data:
        raise DocumentValidationError("The uploaded file is empty.")
    if len(data) > max_bytes:
        raise DocumentValidationError("The uploaded file exceeds the 10 MB limit.")
    if suffix == ".pdf":
        if not data.startswith(b"%PDF-"):
            raise DocumentValidationError("The file extension says PDF, but its contents are not a PDF.")
        return _extract_pdf(data)
    if content_type and content_type.startswith("application/pdf"):
        raise DocumentValidationError("The uploaded file type does not match its extension.")
    if b"\x00" in data[:4096]:
        raise DocumentValidationError("Text and Markdown files must contain readable UTF-8 text.")
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        raise DocumentValidationError("Text and Markdown files must be UTF-8 encoded.") from error
    return _markdown_sections(text) if suffix in {".md", ".markdown"} else _non_empty_sections([ExtractedSection(text=text)])


def _extract_pdf(data: bytes) -> list[ExtractedSection]:
    try:
        reader = PdfReader(io.BytesIO(data))
        sections = [ExtractedSection(text=page.extract_text() or "", page_number=index + 1) for index, page in enumerate(reader.pages)]
    except Exception as error:
        raise DocumentValidationError("The PDF could not be read. It may be corrupt or image-only.") from error
    return _non_empty_sections(sections)


def _non_empty_sections(sections: list[ExtractedSection]) -> list[ExtractedSection]:
    normalized = [ExtractedSection(text=_normalize(section.text), page_number=section.page_number, section_title=section.section_title) for section in sections]
    result = [section for section in normalized if section.text]
    if not result:
        raise DocumentValidationError("No readable text was found in this document.")
    return result


def _markdown_sections(text: str) -> list[ExtractedSection]:
    current_title: str | None = None
    current_lines: list[str] = []
    sections: list[ExtractedSection] = []
    for line in text.splitlines():
        heading = re.match(r"^#{1,6}\s+(.+?)\s*#*\s*$", line)
        if heading:
            if current_lines:
                sections.append(ExtractedSection(text="\n".join(current_lines), section_title=current_title))
            current_title = heading.group(1).strip()
            current_lines = []
        else:
            current_lines.append(line)
    if current_lines:
        sections.append(ExtractedSection(text="\n".join(current_lines), section_title=current_title))
    return _non_empty_sections(sections or [ExtractedSection(text=text)])


def chunk_sections(sections: list[ExtractedSection]) -> list[PreparedChunk]:
    chunks: list[PreparedChunk] = []
    for section in sections:
        start = 0
        text = section.text
        while start < len(text):
            end = min(start + MAX_CHUNK_CHARS, len(text))
            if end < len(text):
                boundary = text.rfind(" ", start + MAX_CHUNK_CHARS // 2, end)
                if boundary > start:
                    end = boundary
            content = text[start:end].strip()
            if content:
                chunks.append(PreparedChunk(content=content, char_start=start, char_end=end, page_number=section.page_number, section_title=section.section_title))
            if end >= len(text):
                break
            start = max(end - CHUNK_OVERLAP_CHARS, start + 1)
    if not chunks:
        raise DocumentValidationError("No searchable text chunks could be created.")
    return chunks


def _normalize(text: str) -> str:
    return re.sub(r"[ \t]+", " ", re.sub(r"\r\n?", "\n", text)).strip()
