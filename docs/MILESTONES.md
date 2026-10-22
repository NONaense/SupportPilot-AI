# SupportDock Milestone Plan

Every milestone begins by publishing its plan, affected files, and acceptance checks in the implementation update before code changes are made. The scope below may evolve, but its security rules are non-negotiable.

## M0 — Repository foundation (complete)

**Plan:** establish monorepo boundaries, local dependency configuration, environment templates, and delivery documentation without implementing product behavior.

**Affected files:** root configuration, `AGENTS.md`, `README.md`, `docs/`, `api/db/init/`, and directory placeholders under `api/` and `web/`.

**Acceptance checks:** required directories and documentation exist; no real credentials exist; `docker compose config` succeeds; no user flows or application features are implemented.

## M1 — Application skeleton, developer tooling, and demo interface

**Plan:** initialize Next.js App Router/Tailwind/TypeScript and FastAPI/Pydantic projects; add runnable commands, health/demo API, responsive landing page, demo login/register screens, and demo dashboard. SQLAlchemy is deferred until database work in M2.

**Affected files:** `web/**`, `api/**`, root documentation/configuration, and test configuration.

**Acceptance checks:** web builds and type-checks; API health and labelled demo contracts are tested with pytest; all displayed operational data is labelled as demo-only; no secrets are browser-exposed. Vitest and Playwright harnesses are deferred until the first interactive authenticated flow.

## M2 — Identity, workspaces, Supabase integration, and tenant isolation

**Plan:** add Supabase configuration, Auth-backed registration/sign-in/sign-out/session handling, SQLAlchemy models, a reproducible migration for profiles/workspaces/memberships, backend bearer-token verification, and RLS policies. Documents, chunks, conversations, and pgvector are deferred to their dedicated milestones.

**Affected files:** `api` models/repositories/auth/routes/tests, `web` auth and dashboard routes, Supabase SQL/migrations, environment templates, and docs.

**Acceptance checks:** migration applies to a clean Supabase project; protected API routes reject absent/invalid sessions; workspace creator becomes owner; API listing is user-scoped; RLS blocks cross-tenant reads and browser-side membership changes; no server secret reaches the browser. Live RLS verification requires project credentials and is documented for manual execution.

## M3 — Knowledge base and document processing

**Plan:** add private PDF/TXT/Markdown upload, server-side file validation, text extraction, searchable source chunks, document statuses/errors, safe deletion, SQLAlchemy models, a Supabase migration, private Storage configuration, and protected workspace UI/API routes. Embeddings and AI responses are deferred.

**Affected files:** `web` authenticated dashboard components, API document/extraction/storage/routes/tests, Supabase migration, environment templates, and docs.

**Acceptance checks:** valid PDF/TXT/Markdown documents up to 10 MB extract into workspace-scoped chunks; invalid/empty/oversized files fail clearly; protected routes reject unauthorized/cross-tenant access; delete removes chunks and requests private-object deletion; browser code contains no Storage service-role key or public file URL. Live Storage and RLS checks require a configured Supabase project.

## M4 — Embeddings, grounded retrieval, and authenticated RAG

**Plan:** add provider-independent embeddings and language generation, default mock providers, pgvector indexing/retrieval, thresholded workspace-scoped RAG, safe unknown behavior, source citations, conversation persistence, document re-indexing, protected question API, rate limiting, and authenticated dashboard chat.

**Affected files:** API providers/RAG/chat/documents/models/tests, Supabase migration, authenticated dashboard components, environment templates, and documentation.

**Acceptance checks:** embeddings run only server-side; retrieval is workspace-scoped; vectors cascade on document deletion; unrelated or cross-tenant chunks are absent; citations map to retrieved chunks; insufficient evidence returns human handoff; mock answers are visibly marked; provider faults are safe; conversations persist. Live pgvector/provider validation requires configured credentials.

## M5 — Public chat widget and operational hardening

**Plan:** build the embeddable/public chat route on the authenticated RAG foundation, add visitor-safe workspace lookup/rate limiting, markdown sanitization, production observability, and additional abuse/security review.

**Affected files:** public web/widget components, API chat/retrieval/response modules, Redis integration, migrations, unit/integration/E2E tests.

**Acceptance checks:** supported questions return clickable document-name citations with supporting snippets; insufficient evidence returns the specified uncertainty plus human-handoff response; invented citations are impossible by contract/test; rate limits apply; conversations persist per workspace.

## M6 — Admin conversation views and operational hardening

**Plan:** add conversation browsing, document status/deletion UX, structured logging, correlation IDs, error handling, monitoring hooks, accessibility, and abuse/security review.

**Affected files:** admin pages, API observability/error modules, tests, operational documentation.

**Acceptance checks:** admin can view only its workspace conversations; errors are actionable and redact secrets; critical user paths meet accessibility and responsive checks; security checklist passes.

## M7 — Demo data, deployment, and release validation

**Plan:** create fictional Acme Fitness source documents and idempotent seed data; add Vercel/Render deployment instructions, environment-variable inventory, release checks, and a production smoke-test guide.

**Affected files:** seed scripts/documents, deployment configuration, README/docs, end-to-end tests.

**Acceptance checks:** Acme Fitness demo answers are grounded and cited; fresh environment can be deployed with documented variables; all pytest, Vitest, Playwright, build, and migration checks pass; no production secret is committed.
