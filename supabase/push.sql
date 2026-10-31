-- Oila Uchun — notifications & meal reminders ONLY (part of schema.sql).
-- Paste into Supabase → SQL Editor → New query → Run. Safe to run again.

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
  breakfast text not null default '08:00' check (breakfast ~ '^([01]?\d|2[0-3]):[0-5]\d$'),
  lunch text not null default '13:00' check (lunch ~ '^([01]?\d|2[0-3]):[0-5]\d$'),
  dinner text not null default '19:00' check (dinner ~ '^([01]?\d|2[0-3]):[0-5]\d$'),
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

-- Save this phone's subscription for the caller's family. The endpoint is one phone, so any older
-- row (even one filed under another family, e.g. after joining a new family) is replaced.
create or replace function public.save_push_subscription(p_endpoint text, p_profile uuid, p_sub jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare k text := public.family_key();
begin
  if coalesce(p_endpoint, '') = '' or p_sub is null then raise exception 'bad_subscription'; end if;
  if not exists (select 1 from profiles where id = p_profile and household_id = k) then
    raise exception 'profile_not_in_family';
  end if;
  delete from push_subscriptions where endpoint = p_endpoint;
  insert into push_subscriptions (endpoint, household_id, profile_id, subscription) values (p_endpoint, k, p_profile, p_sub);
end $$;
revoke all on function public.save_push_subscription(text, uuid, jsonb) from public;
grant execute on function public.save_push_subscription(text, uuid, jsonb) to anon, authenticated;

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
