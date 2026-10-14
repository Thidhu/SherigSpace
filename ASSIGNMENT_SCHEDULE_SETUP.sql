-- Run once in Supabase → SQL Editor (safe to run again).
-- Adds: scheduled tasks, draft tasks and teacher reminders.
alter table public.assignments add column if not exists publish_at  timestamptz;          -- scheduled release time (empty = visible right away)
alter table public.assignments add column if not exists is_draft    boolean not null default false;  -- draft = hidden from students until published
alter table public.assignments add column if not exists reminded_at timestamptz;          -- set when the teacher presses "Remind"
create index if not exists assignments_publish_at_idx on public.assignments (publish_at);

-- Own date shown to students (so a teacher can match the plan when a task could not be posted on time):
alter table public.assignments add column if not exists shown_date date;
