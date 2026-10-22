# SupportDock Agent Guide

## Repository shape

- `web/`: Next.js App Router frontend (TypeScript, Tailwind, Vitest, Playwright).
- `api/`: FastAPI backend (Python 3.12, Pydantic, SQLAlchemy, pytest).
- `docs/`: architecture and delivery documentation.
- `infra/`: operational configuration that is not application code.

## Working agreement

- Keep the OpenAI API key, Supabase service-role key, and other secrets server-side. Never add real credentials to Git.
- Treat all workspace-scoped data as tenant data. New database access must have an RLS policy and a tenant-isolation test.
- The public assistant may answer only from retrieved chunks. If citations are missing or evidence is inadequate, return the approved uncertainty-and-human-handoff response.
- Validate uploads before storage: PDF, TXT, or Markdown only; at most 10 MB for the MVP.
- Sanitize any user-controlled or model-produced Markdown before rendering it.
- Add structured logs that include request/correlation IDs but never secrets or full sensitive customer messages.
- Prefer small, focused changes. Do not overwrite unrelated user changes.

## Required checks by area

- Backend changes: `pytest` in `api/`.
- Frontend changes: unit tests and lint/type checks in `web/`.
- User-facing flows: relevant Playwright coverage.
- Schema or policy changes: migration review plus tenant-isolation tests.

## Completion standard

Before declaring a milestone complete, update its acceptance checks if scope changed, run the relevant checks, and report any intentionally deferred work. This initial foundation milestone contains no application implementation.
