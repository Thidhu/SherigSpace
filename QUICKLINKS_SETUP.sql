-- SherigSpace: Quick Links (public, set by the admin) + My Shortcuts (private, one list per teacher)
-- Run ONCE in Supabase -> SQL Editor. Safe to run again.

-- 1) Quick Links: shown to everyone on the home page, above "What is SherigSpace?".
create table if not exists public.quick_links (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  title       text not null check (char_length(title) between 1 and 80),
  url         text not null check (url ~* '^https?://'),
  sort_order  integer
);
alter table public.quick_links enable row level security;

drop policy if exists "quick_links: anyone reads" on public.quick_links;
create policy "quick_links: anyone reads" on public.quick_links
  for select to anon, authenticated using (true);

drop policy if exists "quick_links: admin writes" on public.quick_links;
create policy "quick_links: admin writes" on public.quick_links
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- 2) My Shortcuts: each teacher's own list (Google Drive, other systems...). Nobody else can read it.
create table if not exists public.teacher_shortcuts (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  teacher_id  uuid not null default auth.uid(),
  title       text not null check (char_length(title) between 1 and 80),
  url         text not null check (url ~* '^https?://'),
  sort_order  integer
);
create index if not exists teacher_shortcuts_teacher_idx on public.teacher_shortcuts (teacher_id, sort_order);
alter table public.teacher_shortcuts enable row level security;

drop policy if exists "shortcuts: own rows" on public.teacher_shortcuts;
create policy "shortcuts: own rows" on public.teacher_shortcuts
  for all to authenticated
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());
