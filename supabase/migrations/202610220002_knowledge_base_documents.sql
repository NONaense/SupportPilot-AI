-- SupportDock M3: private knowledge-base documents and searchable chunks.
-- Apply after 202610220001_identity_and_workspaces.sql.

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  content_type text not null,
  byte_size integer not null check (byte_size > 0 and byte_size <= 10485760),
  storage_path text not null unique,
  status text not null check (status in ('processing', 'ready', 'error')),
  processing_error text,
  extracted_characters integer not null default 0 check (extracted_characters >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id)
);

create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  workspace_id uuid not null,
  chunk_index integer not null check (chunk_index >= 0),
  content text not null check (char_length(trim(content)) > 0),
  char_start integer not null check (char_start >= 0),
  char_end integer not null check (char_end > char_start),
  page_number integer check (page_number > 0),
  section_title text,
  created_at timestamptz not null default now(),
  foreign key (document_id, workspace_id) references public.documents(id, workspace_id) on delete cascade,
  unique (document_id, chunk_index)
);

create index if not exists documents_workspace_created_idx on public.documents (workspace_id, created_at desc);
create index if not exists document_chunks_workspace_document_idx on public.document_chunks (workspace_id, document_id, chunk_index);

alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;

drop policy if exists "documents_select_member" on public.documents;
create policy "documents_select_member" on public.documents
  for select to authenticated using (
    exists (
      select 1 from public.workspace_members membership
      where membership.workspace_id = documents.workspace_id
        and membership.user_id = (select auth.uid())
    )
  );

drop policy if exists "document_chunks_select_member" on public.document_chunks;
create policy "document_chunks_select_member" on public.document_chunks
  for select to authenticated using (
    exists (
      select 1 from public.workspace_members membership
      where membership.workspace_id = document_chunks.workspace_id
        and membership.user_id = (select auth.uid())
    )
  );

grant select on public.documents, public.document_chunks to authenticated;

-- The API is the only uploader. The service-role key bypasses Storage RLS, while
-- the bucket is private and no browser-side Storage policy is created. This means
-- authenticated users cannot enumerate, upload, or fetch raw files by URL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'supportdock-documents',
  'supportdock-documents',
  false,
  10485760,
  array['application/pdf', 'text/plain', 'text/markdown', 'text/x-markdown']
)
on conflict (id) do update set public = false, file_size_limit = 10485760;
