-- SherigSpace: contributors can add interactive questions to the videos they contribute.
-- Run once in Supabase -> SQL Editor.
alter table public.contributions
  add column if not exists interactive_questions jsonb;

-- keep it small and tidy (at most 12 questions)
alter table public.contributions drop constraint if exists contributions_iq_size;
alter table public.contributions
  add constraint contributions_iq_size
  check (interactive_questions is null
         or (jsonb_typeof(interactive_questions) = 'array' and jsonb_array_length(interactive_questions) <= 12));
