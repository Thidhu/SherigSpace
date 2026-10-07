-- SherigSpace: let a teacher open files their students uploaded to the "task-answers" bucket.
-- Run once in Supabase → SQL Editor. Safe to run again.
--
-- Student files are saved as:  <student_id>/<assignment_id>/<timestamp>-<filename>
-- A teacher may read a file if that student is in one of the teacher's own classes.

drop policy if exists "teachers read student task files" on storage.objects;

create policy "teachers read student task files"
on storage.objects for select
to authenticated
using (
  bucket_id = 'task-answers'
  and exists (
    select 1
    from public.class_students cs
    join public.classes c on c.id = cs.class_id
    where c.teacher_id = auth.uid()
      and cs.student_id::text = (storage.foldername(name))[1]
  )
);
