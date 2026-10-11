-- SherigSpace: timed tasks / tests / quizzes (countdown like Moodle)
-- Run ONCE in Supabase -> SQL Editor. Safe to run again.
--
-- What it adds
--   1. assignments.time_limit_minutes / time_limit_kind  - the teacher's time limit and the word on the Start button
--   2. assignment_timers                                  - when each student pressed "Start" (written by the SERVER clock,
--                                                           so changing the phone/computer clock does not help anyone)
--   3. sherig_start_task() / sherig_task_timers()         - the two functions the student page calls
--   4. a trigger on assignment_status                     - for timed tasks only: a student cannot submit before pressing Start,
--                                                           can only submit once, and a late finish is recorded (over_time_seconds)
--                                                           so the teacher can see it. Late answers are NOT thrown away, because
--                                                           a weak connection should not cost a child their work.

-- 1) The teacher's settings -------------------------------------------------
alter table public.assignments add column if not exists time_limit_minutes integer;   -- empty = no time limit
alter table public.assignments add column if not exists time_limit_kind    text;      -- test | quiz | exam | task

-- how many seconds after the time limit the answers arrived (0 = on time)
alter table public.assignment_status add column if not exists over_time_seconds integer;

-- 2) When each student started ----------------------------------------------
create table if not exists public.assignment_timers (
  assignment_id text        not null,
  student_id    uuid        not null,
  started_at    timestamptz not null default now(),
  primary key (assignment_id, student_id)
);
alter table public.assignment_timers enable row level security;

-- Students can read their own start time. Nobody can insert/update directly: only sherig_start_task() writes here.
drop policy if exists "timers: student reads own" on public.assignment_timers;
create policy "timers: student reads own" on public.assignment_timers
  for select using (student_id = auth.uid());

-- A teacher can read the start times of tasks in their own classes.
drop policy if exists "timers: teacher reads own classes" on public.assignment_timers;
create policy "timers: teacher reads own classes" on public.assignment_timers
  for select using (exists (
    select 1 from public.assignments a join public.classes c on c.id = a.class_id
    where a.id::text = assignment_timers.assignment_id and c.teacher_id = auth.uid()
  ));

-- 3) Functions used by the student page --------------------------------------
-- Starts the clock the first time a student presses Start (pressing again, or refreshing, never restarts it).
create or replace function public.sherig_start_task(p_assignment_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit   integer;
  v_started timestamptz;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;

  select a.time_limit_minutes into v_limit
    from public.assignments a
   where a.id::text = p_assignment_id
     and exists (select 1 from public.class_students cs where cs.class_id = a.class_id and cs.student_id = auth.uid());

  if not found then raise exception 'This task was not found in your classes.'; end if;
  if v_limit is null or v_limit <= 0 then raise exception 'This task has no time limit.'; end if;

  insert into public.assignment_timers (assignment_id, student_id)
  values (p_assignment_id, auth.uid())
  on conflict (assignment_id, student_id) do nothing;

  select started_at into v_started from public.assignment_timers
   where assignment_id = p_assignment_id and student_id = auth.uid();

  return jsonb_build_object('now', now(), 'started_at', v_started);
end;
$$;

-- The server's clock + all the start times of the signed-in student (so a refresh keeps the countdown).
create or replace function public.sherig_task_timers()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'now', now(),
    'timers', coalesce((
      select jsonb_agg(jsonb_build_object('assignment_id', t.assignment_id, 'started_at', t.started_at))
        from public.assignment_timers t where t.student_id = auth.uid()
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.sherig_start_task(text) from public;
revoke all on function public.sherig_task_timers()    from public;
grant execute on function public.sherig_start_task(text) to authenticated;
grant execute on function public.sherig_task_timers()    to authenticated;

-- 4) Server-side check when a student submits a TIMED task --------------------
-- Teachers (marking, feedback) and tasks without a time limit are never affected.
create or replace function public.sherig_check_time_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit   integer;
  v_started timestamptz;
  v_over    integer;
begin
  -- only a student's own submission is checked
  if auth.uid() is null or auth.uid()::text <> new.student_id::text then return new; end if;
  if new.submitted_at is null then return new; end if;
  -- an update that does not change the submission (e.g. saving the score) is fine
  if tg_op = 'UPDATE' and new.submitted_at is not distinct from old.submitted_at then return new; end if;

  select a.time_limit_minutes into v_limit from public.assignments a where a.id::text = new.assignment_id::text;
  if v_limit is null or v_limit <= 0 then return new; end if;        -- not a timed task

  select t.started_at into v_started from public.assignment_timers t
   where t.assignment_id = new.assignment_id::text and t.student_id = auth.uid();
  if v_started is null then raise exception 'Press Start first - this task has a time limit.'; end if;

  -- one attempt only for timed tasks
  if tg_op = 'UPDATE' and old.submitted_at is not null then
    raise exception 'This timed task was already submitted.';
  end if;

  v_over := greatest(0, floor(extract(epoch from (now() - (v_started + make_interval(mins => v_limit)))))::integer);
  new.over_time_seconds := v_over;
  return new;
end;
$$;

drop trigger if exists trg_sherig_time_limit on public.assignment_status;
create trigger trg_sherig_time_limit
  before insert or update on public.assignment_status
  for each row execute function public.sherig_check_time_limit();
