# SupportDock

SupportDock is a production-minded, multi-tenant AI customer-support chatbot copilot for small businesses. Business admins create tenant workspaces, upload private knowledge-base documents (PDF, Markdown, TXT), and embed an accessible customer chat widget whose answers are strictly grounded in retrieved source chunks with clickable citations.

---

## Live Demonstration

- **Demonstration Showcase**: Deployable to Vercel (see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md))
- **Local Demo Widget**: `http://localhost:3000/demo/widget` (interactive embeddable widget on a showcase business site)
- **Local Visitor Chat**: `http://localhost:3000/chat/<workspace-slug>` (fullscreen customer chat)
- **API Swagger Explorer**: `http://localhost:8000/docs`
- **Health & Readiness Check**: `http://localhost:8000/health`

---

## Architecture & Production Stack

SupportDock is designed for zero-friction free-tier cloud deployment while enforcing strict tenant isolation:

- **Frontend**: Next.js 15 (App Router), TypeScript, Tailwind CSS (deployed on **Vercel Hobby**)
- **Backend API**: Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2 (deployed on **Render Free Tier**)
- **Database & Identity**: Supabase PostgreSQL 15, Row Level Security (RLS), pgvector, GoTrue Auth
- **Private Storage**: Supabase Storage (`supportdock-documents` private bucket with server-only access)
- **Retrieval-Augmented Generation (RAG)**: Provider-agnostic embeddings & generation with deterministic zero-cost mock simulation and optional OpenAI Responses integration
- **Embeddable Widget**: WAI-ARIA accessible floating chat launcher with session persistence, expandable citations, and typing indicators

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for architecture diagrams and production deployment guides.

---

## Key Features & Milestones

- **M0 — Repository Foundation**: Clean monorepo boundaries (`web/`, `api/`, `infra/`, `docs/`, `supabase/`).
- **M1 — Application Skeleton**: Responsive landing page, design tokens, mock demo dashboard.
- **M2 — Identity & Workspaces**: Multi-tenant Supabase Auth, workspace creation, owner assignment, RLS policies.
- **M3 — Knowledge Base Ingestion**: Private PDF/TXT/Markdown upload, magic byte validation, null byte detection, 10 MB limit, and character-overlap chunking.
- **M4 — Grounded Retrieval & RAG**: pgvector cosine similarity search, source chunk citations, rate limiting, and safe ungrounded uncertainty fallback (*"I don't know based on the available knowledge base..."*).
- **M5 — Public Chat & Metrics**: Real-time visitor chat persistence across page reload, live PostgreSQL metric aggregations, and admin conversation inspection modal.
- **M6 — Quality & Security Audit**: Path traversal filename sanitization, IP-aware public rate limiting, 56-pixel accessible touch launcher, and 56 automated tests.
- **M7 — Deployment & Portfolio Polish**: Multi-origin CORS support, database connectivity health check, Infrastructure-as-Code blueprint (`infra/render.yaml`), and comprehensive deployment guides.

---

## Repository Layout

```text
api/                  FastAPI service, database models, RAG engine, and pytest suite
api/app/              Application code (auth, chat, documents, rag, workspaces)
api/tests/            56 automated unit, integration, and security tests
docs/                 Architecture, milestone roadmaps, and deployment guide
infra/                Infrastructure-as-Code definitions (Render blueprint render.yaml)
supabase/migrations/  4 sequential, idempotent SQL migrations
web/                  Next.js App Router frontend, Tailwind UI, and ChatWidget component
docker-compose.yml    Local PostgreSQL (pgvector) and Redis dependencies
```

---

## Supabase Setup (Migrations & Storage)

1. Create a free project at [supabase.com](https://supabase.com).
2. In the Supabase **SQL Editor**, run the 4 migrations in `supabase/migrations/` in exact sequential order:
   - `202610220001_identity_and_workspaces.sql`: Users, profiles, workspaces, memberships, and RLS.
   - `202610220002_knowledge_base_documents.sql`: Documents, chunks, and private storage bucket creation.
   - `202610220003_rag_embeddings_and_conversations.sql`: pgvector extension, embeddings table, similarity match function, and conversation tables.
   - `202610240001_milestone5_conversations_and_metrics.sql`: Public visitor conversations, member inspection RLS, and workspace indices.
3. In **Authentication → URL Configuration**, set your frontend domain in **Site URL** and add redirect wildcards (`http://localhost:3000/**`, `https://<your-app>.vercel.app/**`).
4. In **Storage**, confirm `supportdock-documents` is created as a **Private** bucket.

---

## Local Development Quickstart

### 1. Environment Configuration

```powershell
# Copy environment templates
Copy-Item web\.env.example web\.env.local
Copy-Item api\.env.example api\.env
```

- In `web/.env.local`:
  ```ini
  NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
  NEXT_PUBLIC_API_URL=http://localhost:8000
  ```
- In `api/.env`:
  ```ini
  APP_ENV=development
  WEB_ORIGIN=http://localhost:3000
  SUPABASE_URL=https://your-project.supabase.co
  SUPABASE_ANON_KEY=your-anon-key
  SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
  DATABASE_URL=postgresql+psycopg://postgres:your-password@db.your-project.supabase.co:5432/postgres
  EMBEDDING_PROVIDER=mock
  LANGUAGE_MODEL_PROVIDER=mock
  ```

### 2. Run the Backend API

```powershell
cd api
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 3. Run the Frontend App

```powershell
cd web
npm install
npm run dev
```

Visit **`http://localhost:3000`** in your browser.

---

## Running Automated Tests & Quality Checks

SupportDock maintains 100% automated test coverage across critical user and security flows:

```powershell
# 1. Run all 56 backend unit, integration, and security tests
.\api\.venv\Scripts\python.exe -m pytest api\tests

# 2. Run frontend TypeScript typecheck
npm --prefix web run typecheck

# 3. Verify Next.js production build
npm --prefix web run build
```

---

## Production Deployment

SupportDock is configured for one-click free-tier hosting:
- **Backend on Render**: Connect your repo, select root dir `api`, and link environment variables using [`infra/render.yaml`](infra/render.yaml).
- **Frontend on Vercel**: Connect your repo, select root dir `web`, and configure `NEXT_PUBLIC_API_URL` pointing to Render.

For step-by-step instructions, environment variable matrix, and rollback checklists, refer to the complete guide in **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.
