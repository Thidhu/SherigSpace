-- Run once in Supabase → SQL Editor (safe to run again).
-- Gives the Admin panel a "Teachers" page: who is a teacher, how many classes and students each one has.
-- Only people whose profile role is 'admin' get any rows back.
create or replace function public.admin_teacher_overview()
returns table (
  id uuid, name text, email text, joined_at timestamptz,
  class_count int, student_count int,
  sub_status text, sub_expires timestamptz,
  classes jsonb
)
language sql stable security definer set search_path = public as $$
  select
    p.id, p.name, p.email, p.joined_at,
    (select count(*)::int from public.classes c where c.teacher_id = p.id),
    (select count(*)::int from public.class_students cs join public.classes c on c.id = cs.class_id where c.teacher_id = p.id),
    (select ts.status from public.teacher_subscriptions ts where ts.teacher_id = p.id order by ts.created_at desc limit 1),
    (select ts.expires_at from public.teacher_subscriptions ts where ts.teacher_id = p.id and ts.status = 'approved' order by ts.expires_at desc nulls last limit 1),
    coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'level', c.class_level,
        'students', (select count(*) from public.class_students cs where cs.class_id = c.id)
      ) order by c.created_at desc) from public.classes c where c.teacher_id = p.id), '[]'::jsonb)
  from public.profiles p
  where p.role = 'teacher'
    and exists (select 1 from public.profiles a where a.id = auth.uid() and a.role = 'admin')
  order by p.joined_at desc nulls last;
$$;
revoke all on function public.admin_teacher_overview() from public;
grant execute on function public.admin_teacher_overview() to authenticated;
