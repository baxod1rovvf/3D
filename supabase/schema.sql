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
