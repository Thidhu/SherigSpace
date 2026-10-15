-- SherigSpace: let students open library items (lesson / resource / video / article) that their teacher assigned.
-- Run ONCE in Supabase -> SQL Editor. Safe to run again.
--
-- The student page asks this function for the item behind a "Task based on my TLM library".
-- It answers when:  the caller is an admin / teacher / class owner,  OR  the caller is a student of a class
-- that has a task using this exact item.  Everyone else gets nothing.  Because the teacher chose the item
-- for the class, the link is returned even for premium items.

drop function if exists public.sherig_content_item(text, text);

create or replace function public.sherig_content_item(p_table text, p_id text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  t  text := lower(coalesce(p_table, ''));
  ok boolean := false;
  r  jsonb;
begin
  if auth.uid() is null then return null; end if;
  if t not in ('lessons', 'resources', 'videos', 'articles', 'games') then return null; end if;

  if exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'teacher'))
     or exists (select 1 from public.classes c where c.teacher_id = auth.uid()) then
    ok := true;
  else
    select exists (
      select 1
        from public.assignments a
        join public.class_students cs on cs.class_id::text = a.class_id::text
       where cs.student_id = auth.uid()
         and a.kind = 'tlm'
         and a.item_type = t
         and a.item_id::text = p_id
    ) into ok;
  end if;

  if not ok then return null; end if;
  execute format('select to_jsonb(x) from public.%I x where x.id::text = $1 limit 1', t) into r using p_id;
  return r;
end $$;

revoke all on function public.sherig_content_item(text, text) from public;
grant execute on function public.sherig_content_item(text, text) to authenticated;
