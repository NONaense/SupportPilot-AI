# SupportDock

SupportDock is a production-minded, multi-tenant AI customer-support chatbot for small businesses. Business admins create workspaces, upload knowledge-base documents, and embed a public chat experience whose responses are grounded in retrieved source chunks with clickable citations.

## Current status

**Milestone 4 — grounded retrieval and RAG** indexes workspace document chunks, performs tenant-scoped pgvector retrieval, returns source citations, and persists authenticated conversations. It defaults to a deterministic, visibly labelled mock provider, so local development does not call or charge an AI provider. The Acme Fitness preview remains fictional/non-persistent at `/demo`.

## Planned stack

- Frontend: Next.js App Router, TypeScript, Tailwind CSS
- Backend: Python 3.12, FastAPI, Pydantic, SQLAlchemy
- Platform: Supabase Postgres, Auth, Storage, and pgvector
- AI: OpenAI Responses API
- Tests: pytest, Vitest, Playwright
- Deployment: Vercel (web) and Render (API)

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the planned system boundary diagram.

## Layout

```text
api/                  FastAPI service and backend tests
api/db/init/          Local Postgres bootstrap SQL
docs/                 Architecture and milestone plan
infra/                Operational configuration reserved for later milestones
web/                  Next.js app and frontend tests
docker-compose.yml    Local Postgres (pgvector) and Redis dependencies
```

## Local prerequisites

- Docker Desktop (optional but recommended for local Postgres and Redis)
- Node.js 20+
- Python 3.12+
- A Supabase project or the Supabase CLI for Auth and Storage during feature implementation

## Supabase setup (Windows PowerShell)

This milestone needs a Supabase project for live authentication and persistence. The free tier is sufficient for development; do not enable paid features for this project without reviewing provider pricing yourself.

1. Create a project in the [Supabase dashboard](https://supabase.com/dashboard), then open **Project Settings → API**.
2. Copy the Project URL and the anon/publishable key. The anon key is safe for the browser only because the database policies below enforce RLS; it is not an administrator key.
3. In **Authentication → URL Configuration**, add `http://localhost:3000` to Redirect URLs. In **Authentication → Providers**, ensure Email is enabled.
4. Create local environment files in PowerShell:

```powershell
Copy-Item web\.env.example web\.env.local
Copy-Item api\.env.example api\.env
```

5. Edit `web\.env.local` with the Project URL and anon key. Edit `api\.env` with the same two values and a server-side Postgres connection string from **Project Settings → Database**. Use Supabase’s Transaction pooler connection string if your network does not support IPv6.
6. Keep `SUPABASE_SERVICE_ROLE_KEY` only in `api\.env`. Do not copy it into a `NEXT_PUBLIC_` variable, browser code, a screenshot, or Git.
7. Apply all three migrations in `supabase/migrations/` in filename order. In the Supabase SQL Editor, run [identity/workspaces](supabase/migrations/202610220001_identity_and_workspaces.sql) first, then [knowledge base documents](supabase/migrations/202610220002_knowledge_base_documents.sql), followed by [RAG embeddings and conversations](supabase/migrations/202610220003_rag_embeddings_and_conversations.sql). Alternatively, install the Supabase CLI and run `supabase db push` from the repository root after linking your project.

The migrations create a profile for every Auth user, workspace ownership/membership records, private knowledge-base records/chunks, and RLS rules. They deliberately give browser clients no permission to create memberships, elevate their role, or access Storage objects directly.

### Private document storage

The second migration creates a private `supportdock-documents` bucket with a 10 MB limit and no browser Storage policies. In PowerShell, keep the service-role key in the API configuration only:

```powershell
Copy-Item api\.env.example api\.env
notepad api\.env
```

Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, and `SUPABASE_STORAGE_BUCKET=supportdock-documents`. The browser needs only the URL and anon key in `web\.env.local`; never place `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, or an OpenAI key there. The API uses the service-role key exclusively for private object upload/delete after it authorizes the workspace request.

## Optional local infrastructure

1. Copy `.env.example` to `.env` and choose a non-default local database password.
2. Run `docker compose up -d`.
3. Confirm services with `docker compose ps`.

The compose file provides a local Postgres instance with the `vector` extension and Redis for the planned public-chat rate limiter. Supabase Auth and Storage remain Supabase-managed concerns; later milestones will document either a Supabase CLI setup or a hosted project configuration. Docker Compose does not expose or replace production secrets.

## Environment templates

- Root `.env.example`: local infrastructure only.
- [`web/.env.example`](web/.env.example): browser-safe Supabase public configuration.
- [`api/.env.example`](api/.env.example): server-only configuration, including placeholders for secrets.

Never place an OpenAI key or Supabase service-role key in `web/` or use a `NEXT_PUBLIC_` variable for either.

## Run the application shell

### Frontend

```bash
cd web
# PowerShell
Copy-Item .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`. Production verification uses `npm run build`; serve it locally with `npm run start`.

### Backend

```bash
cd api
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
python -m uvicorn app.main:app --reload --port 8000
```

Open `http://localhost:8000/docs` for the API explorer. Run backend checks with `python -m pytest`.

The dashboard calls `/api/v1/workspaces` with the Supabase access token. The API verifies that token with Supabase Auth and scopes every query to its user ID. The `/demo` route is deliberately separate and does not make database calls.

### Upload a knowledge-base document

1. Start the API and web app using the commands above, then sign in.
2. Create a workspace from `/dashboard`.
3. Select a PDF, UTF-8 TXT, or UTF-8 Markdown document using **Upload document**. Files must be 10 MB or smaller, non-empty, and contain extractable text. PDFs must have a valid PDF signature and readable text layer.
4. The dashboard displays browser upload progress and the server’s `processing`, `ready`, or `error` result. Only workspace owners/admins can upload or delete.

Files remain private; this milestone intentionally does not provide a raw-file download URL. Deleting a document first deletes its private object, then cascades deletion to its chunks. If object deletion fails, the document metadata is retained and the API reports the failure.

### Enable RAG and ask a question

1. Apply [the RAG migration](supabase/migrations/202610220003_rag_embeddings_and_conversations.sql) after the first two migrations. It enables pgvector, creates 256-dimensional chunk embeddings, similarity-search SQL, and conversation/message tables.
2. Keep `EMBEDDING_PROVIDER=mock` and `LANGUAGE_MODEL_PROVIDER=mock` for safe local development. Upload a short FAQ, then ask a question from `/dashboard`. The response is intentionally labelled **Mock response**; it is not an AI answer.
3. For OpenAI, obtain explicit approval to use the account/API key, then in `api\.env` set both provider variables to `openai` and set `OPENAI_API_KEY`. The key remains server-only. Restart the API and use **Retry index** for previously uploaded documents.

The optional OpenAI setup uses `text-embedding-3-small` with `EMBEDDING_DIMENSIONS=256`, matching the pgvector schema. OpenAI documents that this model defaults to 1536 dimensions and supports a `dimensions` parameter; do not change this environment value without also migrating the vector column. Embeddings are billed by input tokens, while answer generation is driven by model input/output tokens. Set provider-side spend/rate limits before enabling a live key. [Official OpenAI embeddings guide](https://developers.openai.com/api/docs/guides/embeddings) and [Responses API reference](https://developers.openai.com/api/reference/resources/responses/methods/create).

The API applies a per-process limit of `CHAT_RATE_LIMIT` questions per user/workspace per `CHAT_RATE_WINDOW_SECONDS` (default: 20/minute). For multi-instance production deployment, replace this in-memory limiter with a shared Redis-backed limiter before relying on it for abuse prevention.

An answer is generated only after the workspace-filtered similarity search meets `RAG_MATCH_THRESHOLD`. Otherwise SupportDock returns: “I don't know based on the available knowledge base. Please contact a human for help.” Citations are server-generated from retrieved chunks; the model never chooses citation IDs.

## Verify tenant isolation

Automated tests exercise API authorization and its user-scoped repository contract. Once a real Supabase project is configured, perform this manual RLS check before release:

1. Register two users and create one workspace with each account.
2. Sign in as user A and query `workspaces` through the Supabase client or dashboard SQL role using user A’s JWT; only user A’s workspace must be visible.
3. Repeat as user B; user A’s workspace must not be visible.
4. Verify neither user can insert a `workspace_members` row or change `owner_user_id` directly.

RLS evaluation requires a live Supabase Auth/Postgres project and therefore is not run by the repository’s credential-free test suite.

Private Supabase Storage operations and document RLS likewise require a configured project and are not claimed as verified by local tests.

pgvector indexing, SQL similarity search, and live provider behavior also require a configured Supabase/OpenAI environment and are not claimed as verified by local tests.

## Development and deployment intent

The web app will deploy to Vercel and the FastAPI service to Render. Supabase remains the production system of record for Postgres, Auth, Storage, and pgvector. No paid dependency is required for the foundation; use free tiers or self-hosted local tooling where available, while checking each provider's current limits before production use.

## Contributing

Read [AGENTS.md](AGENTS.md) before changing code. Each milestone must state its planned files and acceptance checks before implementation, then run relevant tests before completion.
