-- SherigSpace: interactive YouTube videos inside class assignments
-- Run this once in Supabase SQL Editor.
-- This keeps the answer key private from students.

begin;



-- Question-level teacher grading. Students never receive rows from this table.
create table if not exists public.assignment_question_grades (
  id uuid primary key default gen_random_uuid(),
  assignment_id text not null,
  student_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null,
  points_awarded numeric(10,2),
  feedback text,
  graded_by uuid references auth.users(id) on delete set null,
  graded_at timestamptz not null default now(),
  unique(assignment_id, student_id, question_id)
);
create index if not exists assignment_question_grades_lookup_idx
  on public.assignment_question_grades(assignment_id, student_id, question_id);
alter table public.assignment_question_grades enable row level security;
drop policy if exists assignment_question_grades_teacher_select on public.assignment_question_grades;
create policy assignment_question_grades_teacher_select on public.assignment_question_grades
for select to authenticated using (
  public.is_admin() or exists (
    select 1 from public.assignments a
    join public.classes c on c.id=a.class_id
    where a.id::text=assignment_question_grades.assignment_id and c.teacher_id=auth.uid()
  )
);
drop policy if exists assignment_question_grades_teacher_write on public.assignment_question_grades;
create policy assignment_question_grades_teacher_write on public.assignment_question_grades
for all to authenticated using (
  public.is_admin() or exists (
    select 1 from public.assignments a
    join public.classes c on c.id=a.class_id
    where a.id::text=assignment_question_grades.assignment_id and c.teacher_id=auth.uid()
  )
) with check (
  public.is_admin() or exists (
    select 1 from public.assignments a
    join public.classes c on c.id=a.class_id
    where a.id::text=assignment_question_grades.assignment_id and c.teacher_id=auth.uid()
  )
);

create table if not exists public.assignment_video_questions (
  id uuid primary key default gen_random_uuid(),
  assignment_id text not null,
  resource_key text not null,
  timestamp_seconds numeric(10,2) not null default 0 check(timestamp_seconds >= 0),
  question text not null,
  question_type text not null default 'multiple_choice'
    check(question_type in ('multiple_choice','true_false','text','fill_blank','image_choice')),
  options jsonb not null default '[]'::jsonb,
  accepted_answers jsonb not null default '[]'::jsonb,
  explanation text,
  points integer not null default 1 check(points >= 0),
  replay_before_seconds numeric(10,2) not null default 30 check(replay_before_seconds >= 0),
  require_correct boolean not null default true,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- If the table already existed from an earlier version, extend the question type check.
do $$
begin
  alter table public.assignment_video_questions
    drop constraint if exists assignment_video_questions_question_type_check;
  alter table public.assignment_video_questions
    add constraint assignment_video_questions_question_type_check
    check(question_type in ('multiple_choice','true_false','text','fill_blank','image_choice'));
exception when duplicate_object then
  null;
end $$;

create index if not exists assignment_video_questions_lookup_idx
  on public.assignment_video_questions(assignment_id, resource_key, timestamp_seconds, sort_order);

create table if not exists public.assignment_video_interactions (
  id uuid primary key default gen_random_uuid(),
  assignment_id text not null,
  resource_key text not null,
  question_id uuid not null references public.assignment_video_questions(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  answer text not null,
  is_correct boolean not null default false,
  points_earned integer not null default 0,
  max_points integer not null default 0,
  answered_at timestamptz not null default now()
);

create index if not exists assignment_video_interactions_student_idx
  on public.assignment_video_interactions(student_id, assignment_id, resource_key);

create table if not exists public.assignment_video_progress (
  id uuid primary key default gen_random_uuid(),
  assignment_id text not null,
  resource_key text not null,
  student_id uuid not null references auth.users(id) on delete cascade,
  watch_seconds integer not null default 0,
  completion_percentage numeric(5,2) not null default 0 check(completion_percentage between 0 and 100),
  completed boolean not null default false,
  questions_answered integer not null default 0,
  questions_total integer not null default 0,
  updated_at timestamptz not null default now(),
  unique(assignment_id, resource_key, student_id)
);

alter table public.assignment_video_questions enable row level security;
alter table public.assignment_video_interactions enable row level security;
alter table public.assignment_video_progress enable row level security;

-- Questions: teachers/admins can manage them. Students retrieve only the safe
-- question fields through the SECURITY DEFINER function below, so accepted_answers
-- never need to be exposed to the browser.
drop policy if exists assignment_video_questions_teacher_all on public.assignment_video_questions;
create policy assignment_video_questions_teacher_all
on public.assignment_video_questions
for all to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.assignments a
    join public.classes c on c.id = a.class_id
    where a.id::text = assignment_video_questions.assignment_id
      and c.teacher_id = auth.uid()
  )
)
with check (
  public.is_admin()
  or exists (
    select 1
    from public.assignments a
    join public.classes c on c.id = a.class_id
    where a.id::text = assignment_video_questions.assignment_id
      and c.teacher_id = auth.uid()
  )
);

-- Students may record only their own attempts on assignments for classes they are enrolled in.
drop policy if exists assignment_video_interactions_student_insert on public.assignment_video_interactions;
create policy assignment_video_interactions_student_insert
on public.assignment_video_interactions
for insert to authenticated
with check (
  student_id = auth.uid()
  and exists (
    select 1
    from public.assignments a
    join public.class_students cs on cs.class_id = a.class_id
    where a.id::text = assignment_video_interactions.assignment_id
      and cs.student_id = auth.uid()
  )
);

drop policy if exists assignment_video_interactions_student_select on public.assignment_video_interactions;
create policy assignment_video_interactions_student_select
on public.assignment_video_interactions
for select to authenticated
using (student_id = auth.uid());

drop policy if exists assignment_video_interactions_teacher_select on public.assignment_video_interactions;
create policy assignment_video_interactions_teacher_select
on public.assignment_video_interactions
for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.assignments a
    join public.classes c on c.id = a.class_id
    where a.id::text = assignment_video_interactions.assignment_id
      and c.teacher_id = auth.uid()
  )
);

-- Progress is writable only by the student who owns it, and only for an enrolled assignment.
drop policy if exists assignment_video_progress_student_all on public.assignment_video_progress;
create policy assignment_video_progress_student_all
on public.assignment_video_progress
for all to authenticated
using (student_id = auth.uid())
with check (
  student_id = auth.uid()
  and exists (
    select 1
    from public.assignments a
    join public.class_students cs on cs.class_id = a.class_id
    where a.id::text = assignment_video_progress.assignment_id
      and cs.student_id = auth.uid()
  )
);

drop policy if exists assignment_video_progress_teacher_select on public.assignment_video_progress;
create policy assignment_video_progress_teacher_select
on public.assignment_video_progress
for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.assignments a
    join public.classes c on c.id = a.class_id
    where a.id::text = assignment_video_progress.assignment_id
      and c.teacher_id = auth.uid()
  )
);

-- Safe question loader. No answer key is returned.
create or replace function public.get_assignment_video_questions(
  p_assignment_id text,
  p_resource_key text
)
returns table(
  id uuid,
  assignment_id text,
  resource_key text,
  timestamp_seconds numeric,
  question text,
  question_type text,
  options jsonb,
  explanation text,
  points integer,
  replay_before_seconds numeric,
  require_correct boolean,
  enabled boolean,
  sort_order integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    public.is_admin()
    or exists (
      select 1
      from public.assignments a
      join public.classes c on c.id = a.class_id
      where a.id::text = p_assignment_id and c.teacher_id = auth.uid()
    )
    or exists (
      select 1
      from public.assignments a
      join public.class_students cs on cs.class_id = a.class_id
      where a.id::text = p_assignment_id and cs.student_id = auth.uid()
    )
  ) then
    raise exception 'You do not have access to this assignment';
  end if;

  return query
  select q.id, q.assignment_id, q.resource_key, q.timestamp_seconds,
         q.question, q.question_type, q.options, q.explanation, q.points,
         q.replay_before_seconds, q.require_correct, q.enabled, q.sort_order
  from public.assignment_video_questions q
  where q.assignment_id = p_assignment_id
    and q.resource_key = p_resource_key
    and q.enabled = true
  order by q.timestamp_seconds, q.sort_order;
end;
$$;

-- Safe answer checker. The browser sends the student's answer, but never receives
-- accepted_answers. It returns only correctness, score and explanation.
create or replace function public.check_assignment_video_answer(
  p_question_id uuid,
  p_answer text
)
returns table(
  is_correct boolean,
  points integer,
  max_points integer,
  explanation text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  q public.assignment_video_questions%rowtype;
  allowed boolean := false;
  normalized text := lower(regexp_replace(trim(coalesce(p_answer,'')), '\s+', ' ', 'g'));
  candidate text;
begin
  select * into q
  from public.assignment_video_questions
  where id = p_question_id and enabled = true;

  if q.id is null then
    raise exception 'Question not found';
  end if;

  if public.is_admin() then
    allowed := true;
  elsif exists (
    select 1
    from public.assignments a
    join public.classes c on c.id = a.class_id
    where a.id::text = q.assignment_id and c.teacher_id = auth.uid()
  ) then
    allowed := true;
  elsif exists (
    select 1
    from public.assignments a
    join public.class_students cs on cs.class_id = a.class_id
    where a.id::text = q.assignment_id and cs.student_id = auth.uid()
  ) then
    allowed := true;
  end if;

  if not allowed then
    raise exception 'You do not have access to this question';
  end if;

  for candidate in select jsonb_array_elements_text(q.accepted_answers)
  loop
    if lower(regexp_replace(trim(candidate), '\s+', ' ', 'g')) = normalized then
      return query select true, q.points, q.points, q.explanation;
      return;
    end if;
  end loop;

  return query select false, 0, q.points, q.explanation;
end;
$$;

revoke all on function public.get_assignment_video_questions(text,text) from public;
revoke all on function public.check_assignment_video_answer(uuid,text) from public;
grant execute on function public.get_assignment_video_questions(text,text) to authenticated;
grant execute on function public.check_assignment_video_answer(uuid,text) to authenticated;


commit;

-- ================================================================
-- SHERIGSPACE ASSESSMENT ENGINE
-- Automatic grading for objective assignment questions.
-- Short/fill-blank/image/audio are graded when accepted answers exist;
-- paragraph questions remain available for teacher review.
-- ================================================================
create or replace function public.grade_assignment_submission(
  p_assignment_id text,
  p_student_id uuid
)
returns table(score_percent numeric, earned_points numeric, max_points numeric, correct_count integer, graded_count integer, manual_count integer, interactive_earned numeric, interactive_max numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed boolean := false;
  ans jsonb;
  keys jsonb;
  q jsonb;
  k text;
  expected jsonb;
  actual text;
  candidates jsonb;
  total numeric := 0;
  earned numeric := 0;
  correct_n integer := 0;
  graded_n integer := 0;
  manual_n integer := 0;
  ok boolean;
  norm_actual text;
  item jsonb;
  qpoints numeric;
  iv_earned numeric := 0;
  iv_max numeric := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_student_id <> auth.uid() and not public.is_admin() then raise exception 'Student mismatch'; end if;

  select exists(
    select 1 from public.assignments a
    join public.classes c on c.id = a.class_id
    join public.class_students cs on cs.class_id = a.class_id
    where a.id::text = p_assignment_id and cs.student_id = p_student_id
  ) or public.is_admin() or exists(
    select 1 from public.assignments a join public.classes c on c.id=a.class_id
    where a.id::text=p_assignment_id and c.teacher_id=auth.uid()
  ) into allowed;
  if not allowed then raise exception 'You do not have access to this assignment'; end if;

  select answers into ans from public.assignment_status
    where assignment_id::text=p_assignment_id and student_id=p_student_id;
  select answers into keys from public.assignment_keys
    where assignment_id::text=p_assignment_id limit 1;

  -- Grade ordinary assignment questions using each question's points.
  if keys is not null then
    for k in select jsonb_object_keys(keys) loop
      select value into q
      from jsonb_array_elements(coalesce((select questions from public.assignments where id::text=p_assignment_id),'[]'::jsonb))
      where value->>'id' = k
      limit 1;

      qpoints := greatest(0, coalesce((q->>'points')::numeric, 1));
      expected := keys -> k;
      actual := coalesce(ans ->> k, '');
      norm_actual := lower(regexp_replace(trim(actual), '\s+', ' ', 'g'));
      candidates := case when jsonb_typeof(expected)='array' then expected else jsonb_build_array(expected) end;
      ok := false;
      for item in select value from jsonb_array_elements(candidates) loop
        if lower(regexp_replace(trim(item #>> '{}'), '\s+', ' ', 'g')) = norm_actual then ok := true; exit; end if;
      end loop;
      graded_n := graded_n + 1;
      total := total + qpoints;
      if ok then earned := earned + qpoints; correct_n := correct_n + 1; end if;
    end loop;
  end if;

  -- Long-answer questions are teacher-graded. Include their available points in
  -- the denominator and any saved teacher marks in the earned points.
  select count(*) into manual_n
  from jsonb_array_elements(coalesce((select questions from public.assignments where id::text=p_assignment_id),'[]'::jsonb)) item
  where coalesce(item->>'type','')='long';

  select coalesce(sum(greatest(0, coalesce((item->>'points')::numeric,1))),0)
    into qpoints
  from jsonb_array_elements(coalesce((select questions from public.assignments where id::text=p_assignment_id),'[]'::jsonb)) item
  where coalesce(item->>'type','')='long';
  total := total + qpoints;

  select coalesce(sum(greatest(0, g.points_awarded)),0)
    into qpoints
  from public.assignment_question_grades g
  where g.assignment_id=p_assignment_id and g.student_id=p_student_id
    and exists (
      select 1 from jsonb_array_elements(coalesce((select questions from public.assignments where id::text=p_assignment_id),'[]'::jsonb)) item
      where item->>'id'=g.question_id and coalesce(item->>'type','')='long'
    );
  earned := earned + qpoints;

  -- Interactive video questions: use only the latest submitted interaction
  -- for each question so retries do not double-count the score.
  select coalesce(sum(x.points_earned),0), coalesce(sum(x.max_points),0)
    into iv_earned, iv_max
  from (
    select distinct on (i.question_id) i.points_earned, i.max_points
    from public.assignment_video_interactions i
    join public.assignment_video_questions q on q.id=i.question_id
    where i.assignment_id=p_assignment_id
      and i.student_id=p_student_id
      and q.enabled=true
    order by i.question_id, i.answered_at desc, i.id desc
  ) x;

  earned := earned + iv_earned;
  total := total + iv_max;

  return query select
    case when total>0 then round((earned/total)*100,2) else null end,
    earned, total, correct_n, graded_n, manual_n, iv_earned, iv_max;
end;
$$;
revoke all on function public.grade_assignment_submission(text,uuid) from public;
grant execute on function public.grade_assignment_submission(text,uuid) to authenticated;

commit;

-- ================================================================
-- SHERIGSPACE V11 QUESTION BANK
-- Private reusable question bank for each teacher.
-- ================================================================
create table if not exists public.question_bank (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  class_level text not null default '',
  topic text not null default 'General',
  question jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists question_bank_teacher_idx on public.question_bank(teacher_id, updated_at desc);
create index if not exists question_bank_topic_idx on public.question_bank(teacher_id, topic);
create index if not exists question_bank_class_idx on public.question_bank(teacher_id, class_level);
alter table public.question_bank enable row level security;
drop policy if exists question_bank_teacher_select on public.question_bank;
create policy question_bank_teacher_select on public.question_bank for select to authenticated using (teacher_id = auth.uid() or public.is_admin());
drop policy if exists question_bank_teacher_insert on public.question_bank;
create policy question_bank_teacher_insert on public.question_bank for insert to authenticated with check (teacher_id = auth.uid() or public.is_admin());
drop policy if exists question_bank_teacher_update on public.question_bank;
create policy question_bank_teacher_update on public.question_bank for update to authenticated using (teacher_id = auth.uid() or public.is_admin()) with check (teacher_id = auth.uid() or public.is_admin());
drop policy if exists question_bank_teacher_delete on public.question_bank;
create policy question_bank_teacher_delete on public.question_bank for delete to authenticated using (teacher_id = auth.uid() or public.is_admin());
create or replace function public.touch_question_bank_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists question_bank_touch_updated_at on public.question_bank;
create trigger question_bank_touch_updated_at before update on public.question_bank for each row execute function public.touch_question_bank_updated_at();
commit;
