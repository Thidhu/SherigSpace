-- SherigSpace: free-mode switch (Admin -> Settings -> Free Mode).
-- Run once in Supabase -> SQL Editor. Safe to run again.
-- Existing rows start as free (true); flip it any time from the admin panel.

alter table public.site_settings
  add column if not exists free_mode boolean not null default true;
