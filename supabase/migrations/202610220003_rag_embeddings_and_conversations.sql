-- SupportDock M4: pgvector indexing, grounded retrieval, and conversation audit.
-- Apply after the identity and document migrations.

create extension if not exists vector;

alter table public.documents add column if not exists indexing_status text not null default 'pending'
  check (indexing_status in ('pending', 'indexing', 'indexed', 'error'));
alter table public.documents add column if not exists indexing_error text;
alter table public.documents add column if not exists indexing_attempts integer not null default 0 check (indexing_attempts >= 0);
alter table public.documents add column if not exists last_indexed_at timestamptz;

create table if not exists public.chunk_embeddings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  chunk_id uuid not null unique references public.document_chunks(id) on delete cascade,
  embedding vector(256) not null,
  embedding_model text not null,
  created_at timestamptz not null default now()
);

create index if not exists chunk_embeddings_workspace_document_idx on public.chunk_embeddings (workspace_id, document_id);
create index if not exists chunk_embeddings_vector_hnsw_idx on public.chunk_embeddings using hnsw (embedding vector_cosine_ops);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(trim(content)) > 0),
  is_mock boolean not null default false,
  source_chunk_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists conversations_workspace_user_idx on public.conversations (workspace_id, created_by_user_id, updated_at desc);
create index if not exists messages_conversation_created_idx on public.messages (conversation_id, created_at);

alter table public.chunk_embeddings enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

drop policy if exists "chunk_embeddings_select_member" on public.chunk_embeddings;
create policy "chunk_embeddings_select_member" on public.chunk_embeddings for select to authenticated using (
  exists (select 1 from public.workspace_members m where m.workspace_id = chunk_embeddings.workspace_id and m.user_id = (select auth.uid()))
);
drop policy if exists "conversations_select_owner" on public.conversations;
create policy "conversations_select_owner" on public.conversations for select to authenticated using (
  created_by_user_id = (select auth.uid())
);
drop policy if exists "messages_select_owner" on public.messages;
create policy "messages_select_owner" on public.messages for select to authenticated using (
  exists (select 1 from public.conversations c where c.id = messages.conversation_id and c.created_by_user_id = (select auth.uid()))
);
grant select on public.chunk_embeddings, public.conversations, public.messages to authenticated;

create or replace function public.match_document_chunks(
  query_embedding vector(256),
  target_workspace_id uuid,
  match_count integer default 5,
  match_threshold double precision default 0.45
)
returns table (
  chunk_id uuid,
  document_id uuid,
  document_name text,
  content text,
  page_number integer,
  section_title text,
  similarity double precision
)
language sql stable set search_path = public, extensions
as $$
  select c.id, d.id, d.original_filename, c.content, c.page_number, c.section_title,
         1 - (e.embedding <=> query_embedding) as similarity
  from public.chunk_embeddings e
  join public.document_chunks c on c.id = e.chunk_id
  join public.documents d on d.id = e.document_id
  where e.workspace_id = target_workspace_id
    and c.workspace_id = target_workspace_id
    and d.workspace_id = target_workspace_id
    and d.status = 'ready'
    and 1 - (e.embedding <=> query_embedding) >= match_threshold
  order by e.embedding <=> query_embedding
  limit greatest(1, least(match_count, 12));
$$;

grant execute on function public.match_document_chunks to authenticated;
