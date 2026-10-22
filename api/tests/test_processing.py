import pytest

from app.processing import DocumentValidationError, chunk_sections, extract_document


def test_extracts_utf8_text_and_chunks_it() -> None:
    sections = extract_document("guide.txt", "text/plain", b"Welcome to SupportDock. " * 100, 10_000)
    chunks = chunk_sections(sections)
    assert sections[0].text.startswith("Welcome to SupportDock")
    assert len(chunks) >= 2
    assert chunks[0].content


def test_markdown_headings_are_preserved_as_section_metadata() -> None:
    sections = extract_document("faq.md", "text/markdown", b"# Billing\nInvoices arrive monthly.\n\n# Cancellations\nEmail us to cancel.", 10_000)
    chunks = chunk_sections(sections)
    assert [section.section_title for section in sections] == ["Billing", "Cancellations"]
    assert {chunk.section_title for chunk in chunks} == {"Billing", "Cancellations"}


@pytest.mark.parametrize("filename,content", [("malware.exe", b"not allowed"), ("blank.txt", b"   \n\t "), ("pretend.pdf", b"not a pdf")])
def test_rejects_unsupported_empty_or_mismatched_content(filename: str, content: bytes) -> None:
    with pytest.raises(DocumentValidationError):
        extract_document(filename, "application/octet-stream", content, 10_000)


def test_rejects_files_over_the_size_limit() -> None:
    with pytest.raises(DocumentValidationError, match="10 MB limit"):
        extract_document("large.txt", "text/plain", b"x" * 11, 10)
