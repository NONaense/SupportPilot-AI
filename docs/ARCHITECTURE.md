# SupportDock Architecture (Planned)

This diagram describes the intended production architecture. It is a design artifact for future milestones, not evidence that the services below are implemented.

```mermaid
flowchart LR
  Admin[Business admin] --> Web[Next.js web app\nVercel]
  Visitor[Public visitor] --> Widget[Public chat widget\nNext.js]
  Web --> Auth[Supabase Auth]
  Web --> Storage[Supabase Storage]
  Web --> API[FastAPI API\nRender]
  Widget --> API

  API --> DB[(Supabase Postgres\nRLS + pgvector)]
  API --> Storage
  API --> OpenAI[OpenAI Responses API\nserver-side only]
  API --> Redis[(Redis\npublic-chat rate limit)]

  subgraph API responsibilities
    Ingest[Validate, extract, chunk, embed]
    Retrieve[Retrieve evidence and cite]
    Audit[Conversations, statuses, structured logs]
  end
  API --- Ingest
  API --- Retrieve
  API --- Audit
```

## Trust boundaries

- The browser receives only Supabase public configuration and user-scoped access tokens.
- The FastAPI service holds server-only secrets and makes OpenAI requests.
- Supabase RLS protects tenant records even when client access reaches Supabase directly.
- The public widget identifies a published workspace but must never receive privileged credentials.
- Citations are derived from retrieved chunk metadata; generated answers without adequate retrieved evidence are rejected in favor of human handoff.
