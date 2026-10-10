-- SherigSpace: students can never become teachers.
-- Run once in Supabase -> SQL Editor. Safe to run again.

-- 1) One place that answers "is this account a student?"
create or replace function public.is_enrolled_student(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.class_students where student_id = uid)
      or exists (select 1 from public.profiles where id = uid and role = 'student');
$$;

-- 2) Block students at the database (not just the page): they cannot
--    request a teacher subscription or create a class, even by calling
--    the API directly.
create or replace function public.block_students_from_teacher_tables()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_enrolled_student(new.teacher_id) then
    raise exception 'Student accounts cannot use the teacher tools.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_block_students_subscriptions on public.teacher_subscriptions;
create trigger trg_block_students_subscriptions
  before insert or update on public.teacher_subscriptions
  for each row execute function public.block_students_from_teacher_tables();

drop trigger if exists trg_block_students_classes on public.classes;
create trigger trg_block_students_classes
  before insert or update on public.classes
  for each row execute function public.block_students_from_teacher_tables();

-- 3) Optional tidy-up: enrolled students whose profile role was left as 'user'.
--    (Your role-protection trigger may refuse this when run from the SQL Editor;
--    it is only cosmetic because steps 1-2 and the pages already treat enrolled
--    accounts as students.)
do $$
begin
  update public.profiles p
     set role = 'student'
   where p.role = 'user'
     and exists (select 1 from public.class_students cs where cs.student_id = p.id);
exception when others then
  raise notice 'Role tidy-up skipped: %', sqlerrm;
end $$;
