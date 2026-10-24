-- Migration: 202610240001_milestone5_conversations_and_metrics.sql
-- Description: Enable public visitor conversations, update RLS for workspace member inspection, and add indices.

-- 1. Allow conversations.created_by_user_id to be nullable for public visitors
alter table public.conversations alter column created_by_user_id drop not null;

-- 2. Add visitor_id to identify anonymous visitor sessions
alter table public.conversations add column if not exists visitor_id text;

-- 3. Add indexing for workspace conversation querying
create index if not exists conversations_workspace_updated_idx on public.conversations (workspace_id, updated_at desc);
create index if not exists conversations_visitor_idx on public.conversations (workspace_id, visitor_id);

-- 4. Update RLS policies so workspace members can inspect all workspace conversations
drop policy if exists "conversations_select_owner" on public.conversations;
drop policy if exists "conversations_select_workspace_member" on public.conversations;
create policy "conversations_select_workspace_member" on public.conversations for select to authenticated using (
  exists (select 1 from public.workspace_members m where m.workspace_id = conversations.workspace_id and m.user_id = (select auth.uid()))
);

-- 5. Update RLS policies so workspace members can inspect all messages in their workspace
drop policy if exists "messages_select_owner" on public.messages;
drop policy if exists "messages_select_workspace_member" on public.messages;
create policy "messages_select_workspace_member" on public.messages for select to authenticated using (
  exists (select 1 from public.workspace_members m where m.workspace_id = messages.workspace_id and m.user_id = (select auth.uid()))
);

-- 6. Ensure authenticated users have select permissions
grant select on public.conversations, public.messages to authenticated;
