-- SherigSpace: feedback & suggestions
-- Run once in Supabase -> SQL Editor.

create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  user_id     uuid references auth.users(id) on delete set null,
  name        text,
  category    text not null default 'other',
  message     text not null check (char_length(message) between 5 and 1500),
  status      text not null default 'new'
);

alter table public.feedback enable row level security;

-- anyone (logged in or not) can send feedback; they cannot read it back
drop policy if exists "feedback_insert_anyone" on public.feedback;
create policy "feedback_insert_anyone" on public.feedback
  for insert to anon, authenticated
  with check (status = 'new' and (user_id is null or user_id = auth.uid()));

-- only admins can read, mark as read, or delete
drop policy if exists "feedback_admin_all" on public.feedback;
create policy "feedback_admin_all" on public.feedback
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
