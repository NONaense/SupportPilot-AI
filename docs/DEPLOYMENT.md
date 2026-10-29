# SupportDock Production Deployment & Operations Guide

This guide covers deploying SupportDock to production on recommended free-tier cloud platforms:
- **Frontend**: [Vercel](https://vercel.com) (Hobby Free Tier)
- **Backend API**: [Render](https://render.com) (Free Web Service)
- **Database & Auth & Storage**: [Supabase](https://supabase.com) (Free Tier)

---

## 1. Pre-Deployment Verification Checklist

Before deploying, ensure local quality and security checks pass:

- [x] All automated backend tests pass:
  ```powershell
  .\api\.venv\Scripts\python.exe -m pytest api\tests
  ```
- [x] Frontend TypeScript type check passes:
  ```powershell
  npm --prefix web run typecheck
  ```
- [x] Frontend production build succeeds:
  ```powershell
  npm --prefix web run build
  ```
- [x] No credentials or secrets (`OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`) are placed in `web/` or client code.
- [x] Private Storage bucket `supportdock-documents` is private and inaccessible without server-side service-role authentication.

---

## 2. Environment Variables Matrix

| Variable Name | Required Service | Scope / Visibility | Purpose / Example |
| :--- | :--- | :--- | :--- |
| `APP_ENV` | Render (API) | Server-only | `production` |
| `LOG_LEVEL` | Render (API) | Server-only | `INFO` |
| `WEB_ORIGIN` | Render (API) | Server-only | Comma-separated allowed CORS origins, e.g. `https://supportdock-web.vercel.app,http://localhost:3000` |
| `SUPABASE_URL` | Render (API) & Vercel | Server (API) / Browser (Web) | `https://xxxx.supabase.co` |
| `SUPABASE_ANON_KEY` | Render (API) & Vercel | Server (API) / Browser (Web) | Safe client-side anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Render (API) | **Strictly Server-only** | Service role key for private storage operations |
| `DATABASE_URL` | Render (API) | **Strictly Server-only** | `postgresql+psycopg://postgres:[PASSWORD]@db.xxxx.supabase.co:5432/postgres` |
| `SUPABASE_STORAGE_BUCKET` | Render (API) | Server-only | `supportdock-documents` |
| `EMBEDDING_PROVIDER` | Render (API) | Server-only | `mock` (free deterministic) or `openai` |
| `LANGUAGE_MODEL_PROVIDER` | Render (API) | Server-only | `mock` (free deterministic) or `openai` |
| `OPENAI_API_KEY` | Render (API) | **Strictly Server-only** | Required only if `openai` provider is selected |
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel (Web) | Browser-safe | `https://xxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel (Web) | Browser-safe | Anon key matching `SUPABASE_ANON_KEY` |
| `NEXT_PUBLIC_API_URL` | Vercel (Web) | Browser-safe | Render backend URL, e.g. `https://supportdock-api.onrender.com` |

---

## 3. Step-by-Step Deployment Instructions

### Step 3.1: Supabase Configuration

1. **Create Project**:
   - Go to [Supabase Dashboard](https://supabase.com/dashboard) and create a new project.
2. **Apply Database Migrations**:
   - Open **SQL Editor** in the Supabase Dashboard.
   - Execute the 4 migration scripts in exact sequential order:
     1. [`supabase/migrations/202610220001_identity_and_workspaces.sql`](../supabase/migrations/202610220001_identity_and_workspaces.sql)
     2. [`supabase/migrations/202610220002_knowledge_base_documents.sql`](../supabase/migrations/202610220002_knowledge_base_documents.sql)
     3. [`supabase/migrations/202610220003_rag_embeddings_and_conversations.sql`](../supabase/migrations/202610220003_rag_embeddings_and_conversations.sql)
     4. [`supabase/migrations/202610240001_milestone5_conversations_and_metrics.sql`](../supabase/migrations/202610240001_milestone5_conversations_and_metrics.sql)
3. **Verify Private Storage**:
   - Under **Storage**, verify that the bucket `supportdock-documents` is created and marked **Private**.
4. **Configure Authentication Redirects**:
   - Navigate to **Authentication → URL Configuration**.
   - Under **Site URL**, enter your production frontend URL (e.g., `https://supportdock-web.vercel.app`).
   - Under **Redirect URLs**, add:
     - `http://localhost:3000/**`
     - `https://supportdock-web.vercel.app/**`

---

### Step 3.2: Render API Deployment

1. **Sign in to Render**:
   - Go to [render.com](https://render.com) and click **New + → Web Service**.
2. **Connect Repository**:
   - Select your SupportDock GitHub repository.
3. **Configure Service**:
   - **Name**: `supportdock-api`
   - **Region**: Choose closest to your Supabase region (e.g., Frankfurt / Oregon / Singapore).
   - **Root Directory**: `api`
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Plan**: `Free`
4. **Add Environment Variables**:
   - Add all Render variables listed in the matrix above.
5. **Set Health Check Path**:
   - In **Advanced Settings**, set **Health Check Path** to `/health`.
6. **Deploy**:
   - Click **Create Web Service**.
   - Once deployed, test the live health endpoint in your browser:
     ```
     https://<your-render-app>.onrender.com/health
     ```
     Expected response: `{"status":"ok","service":"supportdock-api","environment":"production","database":"connected"}`.

---

### Step 3.3: Vercel Web Deployment

1. **Sign in to Vercel**:
   - Go to [vercel.com](https://vercel.com) and click **Add New → Project**.
2. **Import Repository**:
   - Select your SupportDock repository.
3. **Configure Project**:
   - **Framework Preset**: `Next.js`
   - **Root Directory**: Click "Edit" and choose `web`.
4. **Environment Variables**:
   - Add:
     - `NEXT_PUBLIC_SUPABASE_URL`: `https://xxxx.supabase.co`
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: `<anon-key>`
     - `NEXT_PUBLIC_API_URL`: `https://<your-render-app>.onrender.com`
5. **Deploy**:
   - Click **Deploy**. Vercel will build and assign a public URL (e.g. `https://supportdock-web.vercel.app`).
6. **Finalize Backend CORS**:
   - Return to your Render Web Service dashboard.
   - Update `WEB_ORIGIN` to include your new Vercel production domain:
     ```
     WEB_ORIGIN=https://supportdock-web.vercel.app,http://localhost:3000
     ```
   - Render will automatically re-deploy with the new origin allowed.

---

## 4. Post-Deployment Smoke Test Guide

Once both services are deployed:

1. **Health Verification**:
   - Open `https://<your-render-app>.onrender.com/health`.
   - Confirm `status: "ok"` and `database: "connected"`.
2. **Account Sign-Up / Sign-In**:
   - Navigate to `https://<your-vercel-app>.vercel.app/register`.
   - Create a test business admin account and verify redirection to `/dashboard`.
3. **Workspace & Document Ingestion**:
   - Create a new workspace (e.g. `Acme Logistics`).
   - Upload a test FAQ document (`.txt`, `.md`, or `.pdf` <= 10 MB).
   - Confirm status updates from `processing` to `ready` with chunk count > 0.
4. **Public Visitor Chat**:
   - Navigate to the workspace's public URL: `https://<your-vercel-app>.vercel.app/chat/<workspace-slug>`.
   - Ask a question contained in the uploaded document.
   - Verify that the answer references the retrieved source with an expandable citation.
   - Refresh the page and confirm the conversation history persists.
5. **Embeddable Chat Widget**:
   - Navigate to `https://<your-vercel-app>.vercel.app/demo/widget?slug=<workspace-slug>`.
   - Click the floating launcher bubble in the bottom right corner.
   - Ask a question, verify response, and test starting a new thread.
6. **Admin Inspection**:
   - Return to `/dashboard`.
   - Verify that metrics show the updated conversation count.
   - Click "Inspect" on the conversation to verify that admin review is operational.

---

## 5. Rollback & Disaster Recovery Checklist

In the event of a deployment failure or corrupted release:

### Immediate Mitigation (Within 5 minutes)
- [ ] **Frontend Rollback (Vercel)**:
  - Go to **Vercel Dashboard → Deployments**.
  - Locate the previous stable deployment, click the `...` menu, and select **Rollback to this deployment**.
  - Vercel instantly routes traffic back to the previous build without a rebuild.
- [ ] **Backend Rollback (Render)**:
  - Go to **Render Dashboard → Deploys**.
  - Select the prior successful commit deploy and click **Rollback to this deploy**.

### Database Recovery
- [ ] **Failed Migration Rollback**:
  - Review the specific migration that failed in Supabase SQL Editor.
  - If schema rollback is required:
    - Tables can be dropped cleanly in reverse dependency order:
      `messages` → `conversations` → `document_chunks` → `documents` → `workspace_members` → `workspaces` → `profiles`.
  - Supabase automatically provides Point-in-Time Recovery (PITR) on Pro or daily backups on Free.
- [ ] **Storage Emergency Cleanup**:
  - If corrupt files need removal, use the Supabase Storage dashboard or run private bucket cleanup via the admin API.

### Environment Variable Rollback
- [ ] If a misconfigured variable caused boot failures:
  - Revert `WEB_ORIGIN`, `DATABASE_URL`, or `OPENAI_API_KEY` in Render environment settings.
  - Trigger manual re-deploy.
