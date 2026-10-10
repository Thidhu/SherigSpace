-- Run once in Supabase → SQL Editor.
-- Lets you arrange the order (▲ ▼) of videos, lessons, resources, articles and games from the Admin page.
alter table public.videos    add column if not exists sort_order integer;
alter table public.lessons   add column if not exists sort_order integer;
alter table public.resources add column if not exists sort_order integer;
alter table public.articles  add column if not exists sort_order integer;
alter table public.games     add column if not exists sort_order integer;
