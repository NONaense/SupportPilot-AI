# SupportDock Milestone Plan

Every milestone begins by publishing its plan, affected files, and acceptance checks in the implementation update before code changes are made. The scope below may evolve, but its security rules are non-negotiable.

## M0 — Repository foundation (complete)

**Plan:** establish monorepo boundaries, local dependency configuration, environment templates, and delivery documentation without implementing product behavior.

**Affected files:** root configuration, `AGENTS.md`, `README.md`, `docs/`, `api/db/init/`, and directory placeholders under `api/` and `web/`.

**Acceptance checks:** required directories and documentation exist; no real credentials exist; `docker compose config` succeeds; no user flows or application features are implemented.

## M1 — Application skeleton, developer tooling, and demo interface (complete)

**Plan:** initialize Next.js App Router/Tailwind/TypeScript and FastAPI/Pydantic projects; add runnable commands, health/demo API, responsive landing page, demo login/register screens, and demo dashboard. SQLAlchemy is deferred until database work in M2.

**Affected files:** `web/**`, `api/**`, root documentation/configuration, and test configuration.

**Acceptance checks:** web builds and type-checks; API health and labelled demo contracts are tested with pytest; all displayed operational data is labelled as demo-only; no secrets are browser-exposed. Vitest and Playwright harnesses are deferred until the first interactive authenticated flow.

## M2 — Identity, workspaces, Supabase integration, and tenant isolation (complete)

**Plan:** add Supabase configuration, Auth-backed registration/sign-in/sign-out/session handling, SQLAlchemy models, a reproducible migration for profiles/workspaces/memberships, backend bearer-token verification, and RLS policies. Documents, chunks, conversations, and pgvector are deferred to their dedicated milestones.

**Affected files:** `api` models/repositories/auth/routes/tests, `web` auth and dashboard routes, Supabase SQL/migrations, environment templates, and docs.

**Acceptance checks:** migration applies to a clean Supabase project; protected API routes reject absent/invalid sessions; workspace creator becomes owner; API listing is user-scoped; RLS blocks cross-tenant reads and browser-side membership changes; no server secret reaches the browser. Live RLS verification requires project credentials and is documented for manual execution.

## M3 — Knowledge base and document processing (complete)

**Plan:** add private PDF/TXT/Markdown upload, server-side file validation, text extraction, searchable source chunks, document statuses/errors, safe deletion, SQLAlchemy models, a Supabase migration, private Storage configuration, and protected workspace UI/API routes. Embeddings and AI responses are deferred.

**Affected files:** `web` authenticated dashboard components, API document/extraction/storage/routes/tests, Supabase migration, environment templates, and docs.

**Acceptance checks:** valid PDF/TXT/Markdown documents up to 10 MB extract into workspace-scoped chunks; invalid/empty/oversized files fail clearly; protected routes reject unauthorized/cross-tenant access; delete removes chunks and requests private-object deletion; browser code contains no Storage service-role key or public file URL. Live Storage and RLS checks require a configured Supabase project.

## M4 — Embeddings, grounded retrieval, and authenticated RAG (complete)

**Plan:** add provider-independent embeddings and language generation, default mock providers, pgvector indexing/retrieval, thresholded workspace-scoped RAG, safe unknown behavior, source citations, conversation persistence, document re-indexing, protected question API, rate limiting, and authenticated dashboard chat.

**Affected files:** API providers/RAG/chat/documents/models/tests, Supabase migration, authenticated dashboard components, environment templates, and documentation.

**Acceptance checks:** embeddings run only server-side; retrieval is workspace-scoped; vectors cascade on document deletion; unrelated or cross-tenant chunks are absent; citations map to retrieved chunks; insufficient evidence returns human handoff; mock answers are visibly marked; provider faults are safe; conversations persist. Live pgvector/provider validation requires configured credentials.

## M5 — Public chat widget, persistence, and dashboard metrics (complete)

**Plan:** connect the frontend chat interface to the real backend API. Implement message submission, loading indicators, errors, conversation history, source display, and conversation persistence. Connect dashboard metrics and conversation inspection views to actual database queries.

**Affected files:** `web/src/app/chat/[slug]/page.tsx`, `web/src/components/dashboard-view.tsx`, `api/app/public_chat.py`, `api/app/conversations.py`, `api/tests/test_public_chat.py`, `api/tests/test_conversations.py`, `supabase/migrations/202610240001_milestone5_conversations_and_metrics.sql`.

**Acceptance checks:** a visitor can chat, refresh the page, and retrieve a saved conversation; the administrator can inspect the same conversation in their authorized dashboard; dashboard metrics show real database counts.

## M6 — Quality, security hardening, and embeddable widget (complete)

**Plan:** audit the completed application for security and reliability. Add rate limits, upload restrictions (magic bytes, 10 MB limit, path traversal sanitization), server-side permission checks, safe logging, API validation, accessible UI states, and error handling. Implement the embeddable chat widget and test on a separate showcase page.

**Affected files:** `api/app/documents.py`, `api/app/rag.py`, `api/app/public_chat.py`, `api/tests/test_security_audit.py`, `web/src/components/chat-widget.tsx`, `web/src/app/demo/widget/page.tsx`.

**Acceptance checks:** the key user workflows pass automated tests, sensitive data remains protected, and the widget works on a separate demonstration page (`/demo/widget`).

## M7 — Deployment and portfolio polish (in progress)

**Plan:** prepare the application for deployment to chosen free-tier cloud platforms (Vercel, Render, Supabase). Verify production environment configuration, database migrations, CORS settings, authentication redirects, storage, and health checks. Write precise deployment instructions, environment variable matrix, and a rollback/recovery checklist. Run all applicable tests and production builds before deployment. Await user approval before initiating live deployment.

**Affected files:** `api/app/main.py`, `api/app/config.py`, `api/tests/test_health.py`, `api/requirements.txt`, `infra/render.yaml`, `docs/DEPLOYMENT.md`, `README.md`, `docs/MILESTONES.md`.

**Acceptance checks:** a publicly accessible demonstration works with persistent storage, correct permissions, and documented setup instructions.
