-- Oila Uchun — Supabase setup (no sign-in).
-- Paste this whole file into Supabase → SQL Editor → New query, then press Run.
-- Use a fresh project. Safe to run again.
--
-- How privacy works: the family link holds a secret key. The site sends it with every request
-- as the header "x-family-key", and Row Level Security only shows rows whose household_id
-- equals that key. Without the link, every table looks empty.

-- The family key sent by the site (empty when missing).
create or replace function public.family_key() returns text
language sql stable as $$
  select coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-family-key', '')
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.households (
  key text primary key check (length(key) >= 30),   -- the secret family key
  name text not null default 'Bizning uy',
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  household_id text not null references public.households (key) on delete cascade,
  full_name text not null,
  role text not null check (role in ('er', 'xotin')),
  created_at timestamptz not null default now()
);

create table if not exists public.grocery_items (
  id uuid primary key default gen_random_uuid(),
  household_id text not null references public.households (key) on delete cascade,
  name text not null,
  category text not null default 'boshqa',
  quantity text not null default '',
  note text not null default '',
  status text not null default 'bor' check (status in ('bor', 'kerak', 'olindi')),
  urgent boolean not null default false,
  added_by uuid, marked_by uuid, marked_at timestamptz,
  purchased_by uuid, purchased_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.meals (
  id uuid primary key default gen_random_uuid(),
  household_id text not null references public.households (key) on delete cascade,
  day_date date not null,
  slot text not null check (slot in ('nonushta', 'tushlik', 'kechki')),
  title text not null,
  description text not null default '',
  ingredients jsonb not null default '[]'::jsonb,
  notes text not null default '',
  favorite boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  household_id text not null references public.households (key) on delete cascade,
  title text not null,
  description text not null default '',
  memory_date date not null default current_date,
  photo_path text,                                  -- id of a row in photos
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  household_id text not null references public.households (key) on delete cascade,
  title text not null,
  description text not null default '',
  assignee_id uuid,
  due_date date,
  priority text not null default 'orta' check (priority in ('past', 'orta', 'yuqori')),
  done boolean not null default false,
  completed_by uuid, completed_at timestamptz,
  remind_at timestamptz,
  reminded boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.activity (
  id uuid primary key default gen_random_uuid(),
  household_id text not null references public.households (key) on delete cascade,
  actor_id uuid,
  module text not null,
  text text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  household_id text not null references public.households (key) on delete cascade,
  recipient_id uuid not null,
  actor_id uuid,
  module text not null,
  text text not null,
  link text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- Memory photos, stored as compressed JPEG data URLs (protected by the same rule as everything else).
create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  household_id text not null references public.households (key) on delete cascade,
  data text not null check (length(data) < 3000000),
  created_at timestamptz not null default now()
);

create index if not exists profiles_family on public.profiles (household_id);
create index if not exists grocery_family on public.grocery_items (household_id);
create index if not exists meals_family on public.meals (household_id, day_date);
create index if not exists memories_family on public.memories (household_id);
create index if not exists tasks_family on public.tasks (household_id);
create index if not exists activity_family on public.activity (household_id, created_at desc);
create index if not exists notifications_family on public.notifications (household_id, recipient_id);
create index if not exists photos_family on public.photos (household_id);

-- ---------------------------------------------------------------------------
-- Row Level Security: only the family that knows the key
-- ---------------------------------------------------------------------------
alter table public.households enable row level security;
drop policy if exists "family key" on public.households;
create policy "family key" on public.households for all to anon, authenticated
  using (key = public.family_key()) with check (key = public.family_key());

do $$
declare t text;
begin
  foreach t in array array['profiles', 'grocery_items', 'meals', 'memories', 'tasks', 'activity', 'notifications', 'photos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "family key" on public.%I', t);
    execute format('create policy "family key" on public.%I for all to anon, authenticated
                    using (household_id = public.family_key())
                    with check (household_id = public.family_key())', t);
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', t);
  end loop;
end $$;
grant select, insert, update, delete on public.households to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Device pairing: "Qurilmani ulash" shows a 6-digit code; the other phone enters it
-- ("Menda kod bor") and receives the family key. Codes last 10 minutes and work once.
-- ---------------------------------------------------------------------------
create table if not exists public.pair_codes (
  code text primary key,
  household_id text not null references public.households (key) on delete cascade,
  expires_at timestamptz not null default now() + interval '10 minutes'
);
create table if not exists public.pair_failures (at timestamptz not null default now());
-- No policies: the tables are only reachable through the two functions below.
alter table public.pair_codes enable row level security;
alter table public.pair_failures enable row level security;

create or replace function public.create_pair_code() returns text
language plpgsql security definer set search_path = public as $$
declare
  k text := public.family_key();
  c text;
begin
  if not exists (select 1 from households where key = k) then raise exception 'family_not_found'; end if;
  delete from pair_codes where expires_at < now() or household_id = k;
  loop
    c := lpad(floor(random() * 1000000)::int::text, 6, '0');
    begin
      insert into pair_codes (code, household_id) values (c, k);
      exit;
    exception when unique_violation then
      -- code already in use by another family; draw again
    end;
  end loop;
  return c;
end $$;

create or replace function public.claim_pair_code(p_code text) returns text
language plpgsql security definer set search_path = public as $$
declare k text;
begin
  -- Slow down guessing: at most 30 wrong codes per 10 minutes for the whole site.
  delete from pair_failures where at < now() - interval '10 minutes';
  if (select count(*) from pair_failures) >= 30 then raise exception 'too_many_attempts'; end if;
  delete from pair_codes where code = trim(p_code) and expires_at > now() returning household_id into k;
  if k is null then insert into pair_failures default values; end if;
  return k;
end $$;

revoke all on function public.create_pair_code() from public;
revoke all on function public.claim_pair_code(text) from public;
grant execute on function public.create_pair_code() to anon, authenticated;
grant execute on function public.claim_pair_code(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Push notifications (phone alerts) and meal reminders.
-- After running this, deploy the Edge Function "push" (supabase/functions/push/index.ts)
-- with "Verify JWT" turned OFF. Every new notification row is sent to the recipient's phones,
-- and every 5 minutes the function checks for meal reminders.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then create extension if not exists pg_net; end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then create extension if not exists pg_cron; end if;
end $$;

-- Typed, playful notifications (title/body shown on the phone).
alter table public.notifications add column if not exists type text;
alter table public.notifications add column if not exists title text;
alter table public.notifications add column if not exists body text;
alter table public.notifications add column if not exists tag text;

-- How many hours before each meal this person wants a reminder (0 = off).
alter table public.profiles add column if not exists meal_lead_hours int not null default 2
  check (meal_lead_hours between 0 and 3);

-- Family meal times ("HH:MM") and time zone.
create table if not exists public.family_settings (
  household_id text primary key references public.households (key) on delete cascade,
  breakfast text not null default '08:00' check (breakfast ~ '^\d{1,2}:\d{2}$'),
  lunch text not null default '13:00' check (lunch ~ '^\d{1,2}:\d{2}$'),
  dinner text not null default '19:00' check (dinner ~ '^\d{1,2}:\d{2}$'),
  timezone text default 'Asia/Tashkent'
);

-- One row per phone/browser that allowed notifications.
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  household_id text not null references public.households (key) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  subscription jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_profile on public.push_subscriptions (household_id, profile_id);

do $$
declare t text;
begin
  foreach t in array array['family_settings', 'push_subscriptions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "family key" on public.%I', t);
    execute format('create policy "family key" on public.%I for all to anon, authenticated
                    using (household_id = public.family_key())
                    with check (household_id = public.family_key())', t);
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', t);
  end loop;
end $$;

-- Server-only tables (used by the Edge Function with the service role): never visible to the site.
create table if not exists public.push_keys (
  id int primary key default 1 check (id = 1),
  public_key text not null,
  private_key text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.meal_reminders_sent (
  household_id text not null references public.households (key) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  slot text not null check (slot in ('nonushta', 'tushlik', 'kechki')),
  created_at timestamptz not null default now(),
  primary key (household_id, profile_id, day, slot)
);
alter table public.push_keys enable row level security;
alter table public.meal_reminders_sent enable row level security;
revoke all on public.push_keys from anon, authenticated;
revoke all on public.meal_reminders_sent from anon, authenticated;

-- Each new notification -> the "push" function sends it to the recipient's phones.
-- If pg_net is missing (or fails), the notification is still saved.
create or replace function public.notify_push() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
             where s.nspname = 'net' and p.proname = 'http_post') then
    begin
      perform net.http_post(
        url := 'https://anmpvewqxvvwzwewnlum.supabase.co/functions/v1/push',
        body := jsonb_build_object('notification_id', new.id),
        headers := '{"Content-Type":"application/json"}'::jsonb);
    exception when others then
      raise warning 'notify_push: %', sqlerrm;
    end;
  end if;
  return new;
end $$;
revoke all on function public.notify_push() from public;

drop trigger if exists notify_push on public.notifications;
create trigger notify_push after insert on public.notifications
  for each row execute function public.notify_push();

-- Every 5 minutes: ask the function to create due meal reminders.
do $$
begin
  if to_regclass('cron.job') is not null then
    if exists (select 1 from cron.job where jobname = 'oila-meal-reminders') then
      perform cron.unschedule('oila-meal-reminders');
    end if;
    perform cron.schedule('oila-meal-reminders', '*/5 * * * *', $cmd$
      select net.http_post(
        url := 'https://anmpvewqxvvwzwewnlum.supabase.co/functions/v1/push',
        body := '{"tick":true}'::jsonb,
        headers := '{"Content-Type":"application/json"}'::jsonb)
    $cmd$);
  end if;
end $$;
