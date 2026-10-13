-- SherigSpace: class chat (students chat with their own class; the teacher moderates)
-- Run ONCE in Supabase -> SQL Editor. Safe to run again.
--
-- What it adds
--   1. classes.chat_enabled      - the teacher's On/Off switch. Chat is OFF for every class until the teacher turns it on.
--   2. class_messages            - the messages. Text only, 1-500 characters, one shared room per class (no private messages).
--   3. class_chat_mutes          - students a teacher has muted (they can still read, but cannot post).
--   4. Row-level security        - only the class's own students and its teacher can read the room; students can only
--                                  post when chat is On and they are not muted; a teacher can delete any message,
--                                  a student can delete only their own.
--   5. A trigger on class_messages - the SERVER fills in who sent it (name + role), so nobody can pretend to be someone
--                                  else, and limits a student to 12 messages a minute.
--   6. student_chat_classes()    - what the student page calls to find which of its classes have chat switched on.

-- 1) Teacher's switch --------------------------------------------------------
alter table public.classes add column if not exists chat_enabled boolean not null default false;

-- 2) + 3) Tables (the class_id column copies the type of classes.id, whatever it is) ----------
do $$
declare t text;
begin
  select format_type(a.atttypid, a.atttypmod) into t
    from pg_attribute a
   where a.attrelid = 'public.classes'::regclass and a.attname = 'id' and not a.attisdropped;

  if to_regclass('public.class_messages') is null then
    execute format($f$
      create table public.class_messages (
        id          uuid primary key default gen_random_uuid(),
        class_id    %s not null references public.classes(id) on delete cascade,
        sender_id   uuid not null,
        sender_name text not null default '',
        sender_role text not null default 'student',
        body        text not null check (char_length(btrim(body)) between 1 and 500),
        created_at  timestamptz not null default now()
      )
    $f$, t);
  end if;

  if to_regclass('public.class_chat_mutes') is null then
    execute format($f$
      create table public.class_chat_mutes (
        class_id   %s not null references public.classes(id) on delete cascade,
        student_id uuid not null,
        muted_at   timestamptz not null default now(),
        primary key (class_id, student_id)
      )
    $f$, t);
  end if;
end $$;

create index if not exists class_messages_class_time_idx on public.class_messages (class_id, created_at desc);
create index if not exists class_messages_sender_time_idx on public.class_messages (sender_id, created_at desc);

-- 4) Who may do what (security-definer helpers so the policies never loop) ------------------
create or replace function public.chat_is_teacher(p_class text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.classes c where c.id::text = p_class and c.teacher_id = auth.uid());
$$;

create or replace function public.chat_can_read(p_class text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.chat_is_teacher(p_class)
      or exists (select 1 from public.class_students cs where cs.class_id::text = p_class and cs.student_id = auth.uid());
$$;

create or replace function public.chat_can_post(p_class text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.chat_is_teacher(p_class)
      or (
           exists (select 1 from public.classes c where c.id::text = p_class and c.chat_enabled)
       and exists (select 1 from public.class_students cs where cs.class_id::text = p_class and cs.student_id = auth.uid())
       and not exists (select 1 from public.class_chat_mutes m where m.class_id::text = p_class and m.student_id = auth.uid())
         );
$$;

alter table public.class_messages  enable row level security;
alter table public.class_chat_mutes enable row level security;

drop policy if exists "chat: read own class" on public.class_messages;
create policy "chat: read own class" on public.class_messages
  for select to authenticated
  using (public.chat_can_read(class_id::text));

drop policy if exists "chat: post" on public.class_messages;
create policy "chat: post" on public.class_messages
  for insert to authenticated
  with check (sender_id = auth.uid() and public.chat_can_post(class_id::text));

drop policy if exists "chat: delete own or teacher" on public.class_messages;
create policy "chat: delete own or teacher" on public.class_messages
  for delete to authenticated
  using (sender_id = auth.uid() or public.chat_is_teacher(class_id::text));

-- mutes: a student can see only their own row; only the class teacher can add or remove one
drop policy if exists "mutes: read" on public.class_chat_mutes;
create policy "mutes: read" on public.class_chat_mutes
  for select to authenticated
  using (student_id = auth.uid() or public.chat_is_teacher(class_id::text));

drop policy if exists "mutes: teacher adds" on public.class_chat_mutes;
create policy "mutes: teacher adds" on public.class_chat_mutes
  for insert to authenticated
  with check (public.chat_is_teacher(class_id::text));

drop policy if exists "mutes: teacher removes" on public.class_chat_mutes;
create policy "mutes: teacher removes" on public.class_chat_mutes
  for delete to authenticated
  using (public.chat_is_teacher(class_id::text));

-- 5) Server fills in the sender and slows down flooding ---------------------------------------
create or replace function public.class_messages_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name   text;
  v_role   text;
  v_recent integer;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;

  new.sender_id  := auth.uid();
  new.body       := btrim(new.body);
  new.created_at := now();

  if exists (select 1 from public.classes c where c.id = new.class_id and c.teacher_id = auth.uid()) then
    v_role := 'teacher';
    select nullif(btrim(p.name), '') into v_name from public.profiles p where p.id = auth.uid();
    v_name := coalesce(v_name, 'Teacher');
  else
    v_role := 'student';
    select nullif(btrim(cs.display_name), '') into v_name
      from public.class_students cs
     where cs.class_id = new.class_id and cs.student_id = auth.uid()
     limit 1;
    v_name := coalesce(v_name, 'Student');

    select count(*) into v_recent from public.class_messages
     where sender_id = auth.uid() and created_at > now() - interval '1 minute';
    if v_recent >= 12 then
      raise exception 'You are sending messages too fast. Please wait a moment.';
    end if;
  end if;

  new.sender_role := v_role;
  new.sender_name := v_name;
  return new;
end;
$$;

drop trigger if exists trg_class_messages_before_insert on public.class_messages;
create trigger trg_class_messages_before_insert
  before insert on public.class_messages
  for each row execute function public.class_messages_before_insert();

-- 6) For the student page: "which of my classes have chat on, and am I muted?" ---------------
create or replace function public.student_chat_classes()
returns table (id text, name text, chat_enabled boolean, muted boolean)
language sql stable security definer set search_path = public as $$
  select c.id::text,
         c.name::text,
         coalesce(c.chat_enabled, false),
         exists (select 1 from public.class_chat_mutes m where m.class_id = c.id and m.student_id = auth.uid())
    from public.classes c
    join public.class_students cs on cs.class_id = c.id
   where cs.student_id = auth.uid()
   order by c.name;
$$;
grant execute on function public.student_chat_classes() to authenticated;

-- 7) Instant delivery (otherwise the page still refreshes every few seconds) --------------------
do $$
begin
  alter publication supabase_realtime add table public.class_messages;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
