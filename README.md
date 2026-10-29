# SupportDock

> A multi-tenant, privacy-first AI customer support copilot for small businesses.

SupportDock turns private business documentation into a trustworthy, embeddable customer support chatbot. Responses are strictly grounded in retrieved knowledge-base passages, complete with expandable source citations.

---

## Key Features

- 🛡️ **Grounded Retrieval & Anti-Hallucination**: Answers are generated strictly from retrieved document chunks. When evidence is insufficient, SupportDock returns a transparent uncertainty and human-handoff response rather than inventing answers.
- 🏢 **Multi-Tenant Isolation**: Enterprise-grade tenant isolation enforced via PostgreSQL Row Level Security (RLS) policies and server-side role checks.
- 💬 **Embeddable Chat Widget**: Accessible (WAI-ARIA compliant) floating widget with session persistence, expandable source citations, and responsive mobile-ready layout.
- 📄 **Private Document Ingestion**: Secure PDF, Markdown, and TXT upload validation with magic-byte checks, null-byte sanitization, character-overlap chunking, and pgvector cosine embeddings.
- ⚡ **Deterministic Mock Mode**: Safe, zero-cost local simulation provider that requires no paid API keys to test the entire end-to-end RAG pipeline.
- 📊 **Admin Dashboard**: Real-time operational metrics, workspace switching, document re-indexing, and conversation inspection.

---

## Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS |
| **Backend API** | Python 3.12+, FastAPI, Pydantic v2, SQLAlchemy 2 |
| **Database & Auth** | Supabase PostgreSQL 15, `pgvector`, Row Level Security (RLS), GoTrue Auth |
| **Private Storage** | Supabase Storage (`supportdock-documents` private bucket) |
| **AI Providers** | Deterministic simulation mock (default) or OpenAI Responses API |
| **Testing** | 56 automated tests (`pytest`), TypeScript strict type-checking |
| **Target Deployment** | Vercel (Frontend) & Render (Backend) |

---

## Quickstart (Local Development)

### 1. Prerequisites
- Node.js 20+ & npm
- Python 3.12+
- A free [Supabase](https://supabase.com) project for Auth and Database

### 2. Configure Environment Files

```powershell
# Copy templates
Copy-Item web\.env.example web\.env.local
Copy-Item api\.env.example api\.env
```

Add your Supabase Project URL and anon key to `web/.env.local` and your database connection string to `api/.env`.

### 3. Run the Backend API

```powershell
cd api
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
- Interactive Swagger docs: **`http://localhost:8000/docs`**
- Health & readiness check: **`http://localhost:8000/health`**

### 4. Run the Frontend App

```powershell
cd web
npm install
npm run dev
```
- Main web application: **`http://localhost:3000`**
- Embeddable widget demonstration: **`http://localhost:3000/demo/widget`**

---

## Automated Verification & Quality Checks

SupportDock maintains 100% automated test coverage across authentication, ingestion, RAG, and security boundaries:

```powershell
# Run backend test suite (56 tests)
pytest api/tests

# Run frontend typecheck
npm --prefix web run typecheck

# Verify production build
npm --prefix web run build
```

---

## Deep-Dive Documentation

For architecture diagrams, milestone delivery history, and production deployment playbooks, see:

- 📐 **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — System boundaries, data models, and component architecture.
- 🚀 **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** — Step-by-step Vercel + Render free-tier deployment and rollback procedures.
- 📋 **[docs/MILESTONES.md](docs/MILESTONES.md)** — Chronological engineering milestones and acceptance criteria.
