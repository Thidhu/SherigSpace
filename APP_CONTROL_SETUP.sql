-- SherigSpace: control app protection from Admin (follows Free Mode), per-app rules, device limit, usage
-- Run ONCE in Supabase -> SQL Editor. Safe to run again. (It includes everything from APP_ACCESS_SETUP.sql and the first
-- version of this file, so you can run it on top of either.)
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

-- extra settings: how many devices one paid member may use (0 = no limit) and how long a device counts as "in use"
alter table public.site_settings add column if not exists app_device_limit      int not null default 0;
alter table public.site_settings add column if not exists app_device_window_min int not null default 60;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'site_settings_app_device_limit_chk') then
    alter table public.site_settings add constraint site_settings_app_device_limit_chk check (app_device_limit between 0 and 20);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'site_settings_app_device_window_chk') then
    alter table public.site_settings add constraint site_settings_app_device_window_chk check (app_device_window_min between 5 and 1440);
  end if;
end $$;

-- per-app rules: "default" = follow the settings above; or free / signed_in / members for ONE app
create table if not exists public.app_rules (
  app_key    text primary key check (char_length(app_key) between 3 and 120),
  mode       text not null default 'default' check (mode in ('default','free','signed_in','members')),
  updated_at timestamptz not null default now()
);
alter table public.app_rules enable row level security;
revoke all on public.app_rules from anon, authenticated;

-- which app was opened, and by whom
create table if not exists public.app_opens (
  id        bigserial primary key,
  app_key   text not null,
  user_id   uuid,
  opened_at timestamptz not null default now()
);
create index if not exists app_opens_key_time_idx on public.app_opens (app_key, opened_at);
create index if not exists app_opens_time_idx on public.app_opens (opened_at);
alter table public.app_opens enable row level security;
revoke all on public.app_opens from anon, authenticated;

-- devices that used a paid membership recently
create table if not exists public.app_devices (
  user_id    uuid not null,
  device_id  text not null check (char_length(device_id) between 1 and 80),
  first_seen timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  primary key (user_id, device_id)
);
alter table public.app_devices enable row level security;
revoke all on public.app_devices from anon, authenticated;

-- older versions of these functions had other signatures: remove them first
drop function if exists public.sherig_app_policy();
drop function if exists public.sherig_app_decide(uuid);
drop function if exists public.sherig_app_access();
drop function if exists public.sherig_app_pass();

-- the rule that applies to ONE app (p_key = its address, e.g. lpgenerator.sherigspace.com)
create or replace function public.sherig_app_policy(p_key text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s record; prot boolean; aud text; m text;
begin
  select free_mode, app_protection, app_audience into s from public.site_settings where id = 1;
  if not found then return jsonb_build_object('protect', false, 'audience', 'members'); end if;   -- like the site: no settings row = free
  prot := case coalesce(s.app_protection, 'follow_free_mode')
            when 'always' then true when 'never' then false
            else not coalesce(s.free_mode, true) end;
  aud := coalesce(s.app_audience, 'members');
  if p_key is not null then
    select mode into m from public.app_rules where app_key = lower(p_key);
    if found then
      if m = 'free' then prot := false;
      elsif m = 'signed_in' then prot := true; aud := 'signed_in';
      elsif m = 'members' then prot := true; aud := 'members';
      end if;                                  -- 'default' keeps the settings above
    end if;
  end if;
  return jsonb_build_object('protect', prot, 'audience', aud);
end $$;

-- the decision for one person and one app (internal helper). "via" says why they were let in.
create or replace function public.sherig_app_decide(p_uid uuid, p_key text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare pol jsonb := public.sherig_app_policy(p_key);
begin
  if not (pol->>'protect')::boolean then return jsonb_build_object('protect', false, 'allowed', true); end if;
  if p_uid is null then return jsonb_build_object('protect', true, 'allowed', false, 'reason', 'signin'); end if;
  if pol->>'audience' = 'signed_in' then return jsonb_build_object('protect', true, 'allowed', true, 'via', 'signed_in'); end if;
  if public.sherig_is_staff(p_uid) then return jsonb_build_object('protect', true, 'allowed', true, 'via', 'staff'); end if;
  if exists (select 1 from public.class_students cs where cs.student_id = p_uid) then return jsonb_build_object('protect', true, 'allowed', true, 'via', 'student'); end if;
  if public.sherig_is_member(p_uid) then return jsonb_build_object('protect', true, 'allowed', true, 'via', 'member'); end if;
  return jsonb_build_object('protect', true, 'allowed', false, 'reason', 'members');
end $$;

create or replace function public.sherig_app_access(p_key text default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select public.sherig_app_decide(auth.uid(), p_key) - 'via';
$$;

-- the website asks for a pass: "open freely", "not allowed (why)", or a one-time ticket
create or replace function public.sherig_app_pass(p_key text default null, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d jsonb; t uuid; lim int; win int; dev text;
begin
  d := public.sherig_app_decide(auth.uid(), p_key);
  if not (d->>'allowed')::boolean or not (d->>'protect')::boolean then return d - 'via'; end if;

  -- one paid membership on too many devices at once? (teachers, admins and class students are never limited)
  if d->>'via' = 'member' then
    select app_device_limit, app_device_window_min into lim, win from public.site_settings where id = 1;
    if coalesce(lim, 0) > 0 then
      dev := coalesce(nullif(left(p_device, 80), ''), 'unknown-device');
      win := coalesce(win, 60);
      if exists (select 1 from public.app_devices where user_id = auth.uid() and device_id = dev and last_seen > now() - make_interval(mins => win)) then
        update public.app_devices set last_seen = now() where user_id = auth.uid() and device_id = dev;
      elsif (select count(*) from public.app_devices where user_id = auth.uid() and last_seen > now() - make_interval(mins => win)) >= lim then
        return jsonb_build_object('protect', true, 'allowed', false, 'reason', 'devices');
      else
        insert into public.app_devices (user_id, device_id) values (auth.uid(), dev)
          on conflict (user_id, device_id) do update set last_seen = now();
      end if;
    end if;
  end if;

  delete from public.app_tickets where created_at < now() - interval '1 hour';
  if (select count(*) from public.app_tickets where user_id = auth.uid() and created_at > now() - interval '1 minute') >= 30 then
    return jsonb_build_object('protect', true, 'allowed', false, 'reason', 'busy');
  end if;
  insert into public.app_tickets (user_id) values (auth.uid()) returning id into t;
  return (d - 'via') || jsonb_build_object('ticket', t);
end $$;

-- older scripts ask for a bare ticket: same rules
create or replace function public.sherig_app_ticket()
returns uuid language plpgsql security definer set search_path = public as $$
begin
  return nullif(public.sherig_app_pass(null, null)->>'ticket', '')::uuid;
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

-- usage log: called by the website each time an app is opened (best effort)
create or replace function public.sherig_app_log(p_key text)
returns void language plpgsql security definer set search_path = public as $$
declare k text := lower(coalesce(p_key, ''));
begin
  if char_length(k) < 3 or char_length(k) > 120 or k !~ '^[a-z0-9.-]+(/[a-z0-9._-]+)?$' then return; end if;
  if exists (select 1 from public.app_opens where app_key = k and user_id is not distinct from auth.uid() and opened_at > now() - interval '20 seconds') then return; end if;
  insert into public.app_opens (app_key, user_id) values (k, auth.uid());
  if random() < 0.01 then delete from public.app_opens where opened_at < now() - interval '180 days'; end if;   -- keep the table small
end $$;

-- 5) admin tools (every one checks that the caller is an admin) ----------------------------------------------------
create or replace function public.sherig_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

create or replace function public.admin_apps_state(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)));
        rules jsonb; usage jsonb; sus jsonb; sett jsonb;
begin
  if not public.sherig_is_admin() then raise exception 'Admins only'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('key', app_key, 'mode', mode)), '[]'::jsonb) into rules from public.app_rules;
  select coalesce(jsonb_agg(jsonb_build_object('key', k, 'opens', n, 'people', p, 'last_opened', l) order by n desc), '[]'::jsonb) into usage
    from (select app_key k, count(*) n, count(distinct user_id) p, max(opened_at) l from public.app_opens where opened_at >= since group by app_key) u;
  select coalesce(jsonb_agg(jsonb_build_object('user_id', x.user_id, 'name', x.name, 'email', x.email, 'devices', x.devices, 'last_seen', x.last_seen) order by x.devices desc, x.last_seen desc), '[]'::jsonb) into sus
    from (select d.user_id, p.name, p.email, count(*) devices, max(d.last_seen) last_seen
            from public.app_devices d left join public.profiles p on p.id = d.user_id
           where d.last_seen >= now() - interval '7 days'
           group by d.user_id, p.name, p.email having count(*) >= 2 order by count(*) desc limit 20) x;
  select jsonb_build_object('device_limit', coalesce(app_device_limit, 0), 'device_window_min', coalesce(app_device_window_min, 60)) into sett from public.site_settings where id = 1;
  return jsonb_build_object('rules', rules, 'usage', usage, 'device_users', sus, 'settings', coalesce(sett, '{}'::jsonb), 'days', p_days);
end $$;

create or replace function public.admin_app_people(p_key text, p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)));
        who jsonb; anon_n bigint;
begin
  if not public.sherig_is_admin() then raise exception 'Admins only'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('name', w.name, 'email', w.email, 'opens', w.n, 'last_opened', w.l) order by w.n desc), '[]'::jsonb) into who
    from (select p.name, p.email, count(*) n, max(o.opened_at) l from public.app_opens o join public.profiles p on p.id = o.user_id
           where o.app_key = lower(p_key) and o.opened_at >= since group by p.id, p.name, p.email order by count(*) desc limit 50) w;
  select count(*) into anon_n from public.app_opens where app_key = lower(p_key) and user_id is null and opened_at >= since;
  return jsonb_build_object('people', who, 'signed_out_opens', anon_n);
end $$;

create or replace function public.admin_set_app_rule(p_key text, p_mode text)
returns void language plpgsql security definer set search_path = public as $$
declare k text := lower(coalesce(p_key, ''));
begin
  if not public.sherig_is_admin() then raise exception 'Admins only'; end if;
  if char_length(k) < 3 or char_length(k) > 120 or k !~ '^[a-z0-9.-]+(/[a-z0-9._-]+)?$' then raise exception 'Bad app address'; end if;
  if p_mode = 'default' then delete from public.app_rules where app_key = k;
  elsif p_mode in ('free', 'signed_in', 'members') then
    insert into public.app_rules (app_key, mode) values (k, p_mode) on conflict (app_key) do update set mode = excluded.mode, updated_at = now();
  else raise exception 'Bad mode'; end if;
end $$;

create or replace function public.admin_app_reset_devices(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.sherig_is_admin() then raise exception 'Admins only'; end if;
  delete from public.app_devices where user_id = p_user;
end $$;

-- 6) who may call what ----------------------------------------------------------------------------------------------
revoke all on function public.sherig_is_staff(uuid), public.sherig_is_member(uuid), public.sherig_app_decide(uuid, text) from public, anon, authenticated;
revoke all on function public.sherig_app_policy(text), public.sherig_app_access(text), public.sherig_app_pass(text, text), public.sherig_app_ticket(),
                       public.sherig_app_redeem(uuid), public.sherig_app_log(text), public.sherig_is_admin(),
                       public.admin_apps_state(int), public.admin_app_people(text, int), public.admin_set_app_rule(text, text), public.admin_app_reset_devices(uuid) from public;
grant execute on function public.sherig_app_policy(text) to anon, authenticated;
grant execute on function public.sherig_app_access(text) to anon, authenticated;
grant execute on function public.sherig_app_pass(text, text) to anon, authenticated;
grant execute on function public.sherig_app_ticket() to authenticated;
grant execute on function public.sherig_app_redeem(uuid) to anon, authenticated;
grant execute on function public.sherig_app_log(text) to anon, authenticated;
grant execute on function public.admin_apps_state(int), public.admin_app_people(text, int), public.admin_set_app_rule(text, text), public.admin_app_reset_devices(uuid) to authenticated;

-- 7) admin: change the device limit, and preview what each kind of visitor gets for one app -----------------------
create or replace function public.admin_set_device_limit(p_limit int, p_window_min int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.sherig_is_admin() then raise exception 'Admins only'; end if;
  update public.site_settings
     set app_device_limit = greatest(0, least(coalesce(p_limit, 0), 20)),
         app_device_window_min = greatest(5, least(coalesce(p_window_min, 60), 1440))
   where id = 1;
end $$;

-- "Test an app": what would a signed-out visitor, a signed-in non-member, a paid member and a teacher see?
create or replace function public.admin_app_preview(p_key text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare pol jsonb; out jsonb := '[]'::jsonb; who record; st text; k text := lower(coalesce(p_key, ''));
begin
  if not public.sherig_is_admin() then raise exception 'Admins only'; end if;
  pol := public.sherig_app_policy(k);
  for who in
    select 'Signed-out visitor' as label, null::uuid as uid
    union all select 'Signed in, not a member', (select id from public.profiles p where p.role = 'user' and not public.sherig_is_staff(p.id) and not exists (select 1 from public.class_students cs where cs.student_id = p.id) and not public.sherig_is_member(p.id) limit 1)
    union all select 'Paid member', (select p.id from public.profiles p where public.sherig_is_member(p.id) and not public.sherig_is_staff(p.id) limit 1)
    union all select 'Teacher', (select id from public.profiles where role = 'teacher' limit 1)
  loop
    if who.uid is null and who.label <> 'Signed-out visitor' then
      out := out || jsonb_build_array(jsonb_build_object('who', who.label, 'result', 'no example account yet'));
      continue;
    end if;
    st := case
      when not (pol->>'protect')::boolean then 'opens (free)'
      when who.uid is null then 'asked to sign in'
      when pol->>'audience' = 'signed_in' then 'opens'
      when public.sherig_is_staff(who.uid) or exists (select 1 from public.class_students cs where cs.student_id = who.uid) or public.sherig_is_member(who.uid) then 'opens'
      else 'Members only' end;
    out := out || jsonb_build_array(jsonb_build_object('who', who.label, 'result', st));
  end loop;
  return jsonb_build_object('key', k, 'protect', (pol->>'protect')::boolean, 'audience', pol->>'audience', 'visitors', out);
end $$;

revoke all on function public.admin_set_device_limit(int, int), public.admin_app_preview(text) from public;
grant execute on function public.admin_set_device_limit(int, int), public.admin_app_preview(text) to authenticated;
