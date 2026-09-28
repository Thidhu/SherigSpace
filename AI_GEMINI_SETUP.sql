-- SherigSpace v15: AI usage protection
-- Run this once in Supabase SQL Editor.

create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  tool text not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_teacher_created_idx
  on public.ai_usage (teacher_id, created_at desc);

alter table public.ai_usage enable row level security;

-- Teachers do not need direct client access to this table. The Edge Function
-- records usage with its server-side client.
drop policy if exists "ai_usage_no_client_select" on public.ai_usage;
drop policy if exists "ai_usage_no_client_insert" on public.ai_usage;
drop policy if exists "ai_usage_no_client_update" on public.ai_usage;
drop policy if exists "ai_usage_no_client_delete" on public.ai_usage;

-- No client policies are intentionally created.
-- The Edge Function uses its privileged server client for usage counting.
