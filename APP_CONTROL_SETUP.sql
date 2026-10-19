-- SherigSpace: control app protection from Admin -> Settings (and follow Free Mode)
-- Run ONCE in Supabase -> SQL Editor. Safe to run again.  (It includes everything from APP_ACCESS_SETUP.sql.)
--
--   Free Mode ON  + "Follow Free Mode"  ->  apps are open to everyone (as today).
--   Free Mode OFF + "Follow Free Mode"  ->  apps are protected: they open only inside sherigspace.com,
--                                            and only for the people allowed below.
--   You can also force "Always protect" or "Never protect" from the admin page.
--
-- "Who may open a protected app":
--   signed_in : anyone signed in to SherigSpace
--   members   : paid members (membership / premium membership), teachers, admins, and students in a teacher's class

-- 1) the two settings --------------------------------------------------------------------------------
alter table public.site_settings add column if not exists free_mode      boolean not null default true;
alter table public.site_settings add column if not exists app_protection text    not null default 'follow_free_mode';
alter table public.site_settings add column if not exists app_audience   text    not null default 'members';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'site_settings_app_protection_chk') then
    alter table public.site_settings add constraint site_settings_app_protection_chk check (app_protection in ('follow_free_mode','always','never'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'site_settings_app_audience_chk') then
    alter table public.site_settings add constraint site_settings_app_audience_chk check (app_audience in ('signed_in','members'));
  end if;
end $$;

-- 2) one-time tickets (the app never sees anybody's login) -----------------------------------------------
create table if not exists public.app_tickets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  created_at timestamptz not null default now(),
  used_at    timestamptz
);
create index if not exists app_tickets_user_time_idx on public.app_tickets (user_id, created_at);
alter table public.app_tickets enable row level security;
revoke all on public.app_tickets from anon, authenticated;

-- 3) who is allowed -------------------------------------------------------------------------------------------
create or replace function public.sherig_is_staff(p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_uid is not null and (
       exists (select 1 from public.profiles p where p.id = p_uid and p.role in ('admin','teacher'))
    or exists (select 1 from public.teacher_subscriptions t where t.teacher_id = p_uid and t.status = 'approved' and (t.expires_at is null or t.expires_at > now()))
    or exists (select 1 from public.classes c where c.teacher_id = p_uid)
  );
$$;

-- the same membership maths the website uses: paid quarters (3 months each, never before 5 Oct 2026) and bonus days are stacked in order
create or replace function public.sherig_is_member(p_uid uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  qstart constant timestamptz := timestamptz '2026-10-05 00:00:00+00';
  until_ timestamptz := null;
  r record; start_ timestamptz;
begin
  if p_uid is null then return false; end if;
  if exists (select 1 from public.purchases where user_id = p_uid and item_type = 'premium_membership' and status = 'approved') then return true; end if;
  for r in
    execute $q$
      select coalesce(reviewed_at, 'epoch'::timestamptz) as t, true as pay, 0 as days
        from public.purchases where user_id = $1 and item_type = 'membership' and status = 'approved'
      union all
      select coalesce(created_at, 'epoch'::timestamptz), false, coalesce(days, 0)
        from public.membership_bonus where user_id = $1
      order by 1
    $q$ using p_uid
  loop
    if r.pay then
      start_ := greatest(r.t, qstart, coalesce(until_, '-infinity'::timestamptz));
      until_ := start_ + interval '3 months';
    elsif r.days > 0 then
      start_ := greatest(r.t, coalesce(until_, '-infinity'::timestamptz));
      until_ := start_ + make_interval(days => r.days);
    end if;
  end loop;
  return until_ is not null and until_ > now();
exception when undefined_table then
  -- no bonus table on this project: use purchases only
  for r in select coalesce(reviewed_at, 'epoch'::timestamptz) as t from public.purchases where user_id = p_uid and item_type = 'membership' and status = 'approved' order by 1 loop
    start_ := greatest(r.t, qstart, coalesce(until_, '-infinity'::timestamptz));
    until_ := start_ + interval '3 months';
  end loop;
  return until_ is not null and until_ > now();
end $$;

create or replace function public.sherig_app_policy()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s record; prot boolean;
begin
  select free_mode, app_protection, app_audience into s from public.site_settings where id = 1;
  if not found then return jsonb_build_object('protect', false, 'audience', 'members'); end if;   -- like the site: no settings row = free
  prot := case coalesce(s.app_protection, 'follow_free_mode')
            when 'always' then true when 'never' then false
            else not coalesce(s.free_mode, true) end;
  return jsonb_build_object('protect', prot, 'audience', coalesce(s.app_audience, 'members'));
end $$;

-- the decision for one person (internal helper)
create or replace function public.sherig_app_decide(p_uid uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare pol jsonb := public.sherig_app_policy(); ok boolean;
begin
  if not (pol->>'protect')::boolean then return jsonb_build_object('protect', false, 'allowed', true); end if;
  if p_uid is null then return jsonb_build_object('protect', true, 'allowed', false, 'reason', 'signin'); end if;
  if pol->>'audience' = 'signed_in' then return jsonb_build_object('protect', true, 'allowed', true); end if;
  ok := public.sherig_is_staff(p_uid) or public.sherig_is_member(p_uid)
        or exists (select 1 from public.class_students cs where cs.student_id = p_uid);
  if ok then return jsonb_build_object('protect', true, 'allowed', true); end if;
  return jsonb_build_object('protect', true, 'allowed', false, 'reason', 'members');
end $$;

-- 4) what the website and the apps call -------------------------------------------------------------------------
create or replace function public.sherig_app_access()
returns jsonb language sql stable security definer set search_path = public as $$
  select public.sherig_app_decide(auth.uid());
$$;

-- the website asks for a pass: either "open freely", "not allowed (why)", or a one-time ticket
create or replace function public.sherig_app_pass()
returns jsonb language plpgsql security definer set search_path = public as $$
declare d jsonb; t uuid;
begin
  d := public.sherig_app_decide(auth.uid());
  if not (d->>'allowed')::boolean or not (d->>'protect')::boolean then return d; end if;
  delete from public.app_tickets where created_at < now() - interval '1 hour';
  if (select count(*) from public.app_tickets where user_id = auth.uid() and created_at > now() - interval '1 minute') >= 30 then
    return jsonb_build_object('protect', true, 'allowed', false, 'reason', 'busy');
  end if;
  insert into public.app_tickets (user_id) values (auth.uid()) returning id into t;
  return d || jsonb_build_object('ticket', t);
end $$;

-- older scripts ask for a bare ticket: same rules
create or replace function public.sherig_app_ticket()
returns uuid language plpgsql security definer set search_path = public as $$
declare d jsonb;
begin
  d := public.sherig_app_pass();
  return nullif(d->>'ticket', '')::uuid;
end $$;

-- the app checks a ticket (works once, within 2 minutes)
create or replace function public.sherig_app_redeem(p_ticket uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  update public.app_tickets set used_at = now()
   where id = p_ticket and used_at is null and created_at > now() - interval '2 minutes'
  returning true into ok;
  return coalesce(ok, false);
end $$;

revoke all on function public.sherig_is_staff(uuid), public.sherig_is_member(uuid), public.sherig_app_decide(uuid) from public, anon, authenticated;
revoke all on function public.sherig_app_policy(), public.sherig_app_access(), public.sherig_app_pass(), public.sherig_app_ticket(), public.sherig_app_redeem(uuid) from public;
grant execute on function public.sherig_app_policy() to anon, authenticated;
grant execute on function public.sherig_app_access() to anon, authenticated;
grant execute on function public.sherig_app_pass() to anon, authenticated;
grant execute on function public.sherig_app_ticket() to authenticated;
grant execute on function public.sherig_app_redeem(uuid) to anon, authenticated;
