-- SherigSpace: live classes (a teacher schedules a Google Meet / Zoom / Teams link for a class)
-- Run ONCE in Supabase -> SQL Editor. Safe to run again.
--   * Teachers create / edit / delete live classes for their own classes.
--   * Students see (read only) the live classes of the classes they are in.
--   * Admins can read all of them.

do $$
declare t text;
begin
  select format_type(a.atttypid, a.atttypmod) into t
    from pg_attribute a
   where a.attrelid = 'public.classes'::regclass and a.attname = 'id' and not a.attisdropped;

  if to_regclass('public.live_classes') is null then
    execute format($f$
      create table public.live_classes (
        id           uuid primary key default gen_random_uuid(),
        class_id     %s not null references public.classes(id) on delete cascade,
        title        text not null default 'Live class' check (char_length(btrim(title)) between 1 and 120),
        starts_at    timestamptz not null,
        duration_min integer not null default 60 check (duration_min between 5 and 480),
        link         text not null check (link ~* '^https?://'),
        note         text check (note is null or char_length(note) <= 300),
        created_by   uuid default auth.uid(),
        created_at   timestamptz not null default now()
      )
    $f$, t);
  end if;
end $$;

create index if not exists live_classes_class_time_idx on public.live_classes (class_id, starts_at);

-- helpers (security definer so the policies never loop) ------------------------------------
create or replace function public.live_is_teacher(p_class text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.classes c where c.id::text = p_class and c.teacher_id = auth.uid());
$$;
create or replace function public.live_is_member(p_class text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.class_students cs where cs.class_id::text = p_class and cs.student_id = auth.uid());
$$;
create or replace function public.live_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

alter table public.live_classes enable row level security;

drop policy if exists live_select on public.live_classes;
create policy live_select on public.live_classes for select to authenticated
  using (public.live_is_teacher(class_id::text) or public.live_is_member(class_id::text) or public.live_is_admin());

drop policy if exists live_insert on public.live_classes;
create policy live_insert on public.live_classes for insert to authenticated
  with check (public.live_is_teacher(class_id::text));

drop policy if exists live_update on public.live_classes;
create policy live_update on public.live_classes for update to authenticated
  using (public.live_is_teacher(class_id::text)) with check (public.live_is_teacher(class_id::text));

drop policy if exists live_delete on public.live_classes;
create policy live_delete on public.live_classes for delete to authenticated
  using (public.live_is_teacher(class_id::text) or public.live_is_admin());

grant select, insert, update, delete on public.live_classes to authenticated;
