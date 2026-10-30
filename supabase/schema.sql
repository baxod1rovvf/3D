-- Oila Uchun — Supabase schema
-- Run once in Supabase Dashboard → SQL Editor. Safe to re-run.
-- Creates tables, Row Level Security, household RPCs, realtime publication and the private photo bucket.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Households & profiles
-- ---------------------------------------------------------------------------
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Bizning uy',
  invite_code text not null unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6)),
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  household_id uuid references public.households (id) on delete set null,
  full_name text not null default '',
  role text not null default 'xotin' check (role in ('er', 'xotin')),
  created_at timestamptz not null default now()
);

-- Profile is created automatically on sign-up from user metadata.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id,
          coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
          case when new.raw_user_meta_data ->> 'role' = 'er' then 'er' else 'xotin' end)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- The current user's household (used by every policy).
create or replace function public.my_household() returns uuid
language sql stable security definer set search_path = public as $$
  select household_id from public.profiles where id = auth.uid()
$$;

-- A household holds exactly two people at most.
create or replace function public.enforce_two_members() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.household_id is not null and new.household_id is distinct from old.household_id then
    if (select count(*) from public.profiles where household_id = new.household_id) >= 2 then
      raise exception 'household_full';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists profiles_two_members on public.profiles;
create trigger profiles_two_members before update of household_id on public.profiles
  for each row execute function public.enforce_two_members();

create or replace function public.create_household(p_name text) returns public.households
language plpgsql security definer set search_path = public as $$
declare h public.households;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if public.my_household() is not null then raise exception 'already_member'; end if;
  insert into public.households (name) values (coalesce(nullif(trim(p_name), ''), 'Bizning uy')) returning * into h;
  update public.profiles set household_id = h.id where id = auth.uid();
  return h;
end $$;

create or replace function public.join_household(p_code text) returns public.households
language plpgsql security definer set search_path = public as $$
declare h public.households;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if public.my_household() is not null then raise exception 'already_member'; end if;
  select * into h from public.households where invite_code = upper(trim(p_code));
  if h.id is null then raise exception 'invalid_code'; end if;
  update public.profiles set household_id = h.id where id = auth.uid();  -- two-member trigger guards this
  return h;
end $$;

revoke all on function public.create_household(text) from public, anon;
revoke all on function public.join_household(text) from public, anon;
grant execute on function public.create_household(text) to authenticated;
grant execute on function public.join_household(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Household data
-- ---------------------------------------------------------------------------
create table if not exists public.grocery_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  category text not null default 'boshqa'
    check (category in ('sabzavot', 'meva', 'sut', 'gosht', 'non', 'ichimlik', 'uy', 'boshqa')),
  quantity text not null default '',
  note text not null default '',
  status text not null default 'bor' check (status in ('bor', 'kerak', 'olindi')),  -- bor = uyda bor
  urgent boolean not null default false,
  added_by uuid references public.profiles (id) on delete set null,
  marked_by uuid references public.profiles (id) on delete set null,
  marked_at timestamptz,
  purchased_by uuid references public.profiles (id) on delete set null,
  purchased_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.meals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  day_date date not null,
  slot text not null check (slot in ('nonushta', 'tushlik', 'kechki')),
  title text not null,
  description text not null default '',
  ingredients jsonb not null default '[]'::jsonb,
  notes text not null default '',
  favorite boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  title text not null,
  description text not null default '',
  memory_date date not null default current_date,
  photo_path text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  title text not null,
  description text not null default '',
  assignee_id uuid references public.profiles (id) on delete set null,
  due_date date,
  priority text not null default 'orta' check (priority in ('past', 'orta', 'yuqori')),
  done boolean not null default false,
  completed_by uuid references public.profiles (id) on delete set null,
  completed_at timestamptz,
  remind_at timestamptz,
  reminded boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.activity (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  module text not null check (module in ('grocery', 'meals', 'memories', 'tasks')),
  text text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  module text not null,
  text text not null,
  link text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists grocery_household_idx on public.grocery_items (household_id, status);
create index if not exists meals_household_idx on public.meals (household_id, day_date);
create index if not exists memories_household_idx on public.memories (household_id, memory_date);
create index if not exists tasks_household_idx on public.tasks (household_id, done, due_date);
create index if not exists activity_household_idx on public.activity (household_id, created_at desc);
create index if not exists notifications_recipient_idx on public.notifications (recipient_id, read, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security — only the two household members see household data
-- ---------------------------------------------------------------------------
alter table public.households enable row level security;
alter table public.profiles enable row level security;
alter table public.grocery_items enable row level security;
alter table public.meals enable row level security;
alter table public.memories enable row level security;
alter table public.tasks enable row level security;
alter table public.activity enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "household: members read" on public.households;
create policy "household: members read" on public.households for select to authenticated
  using (id = public.my_household());
drop policy if exists "household: members rename" on public.households;
create policy "household: members rename" on public.households for update to authenticated
  using (id = public.my_household()) with check (id = public.my_household());

drop policy if exists "profiles: read self and partner" on public.profiles;
create policy "profiles: read self and partner" on public.profiles for select to authenticated
  using (id = auth.uid() or (household_id is not null and household_id = public.my_household()));
drop policy if exists "profiles: update self" on public.profiles;
create policy "profiles: update self" on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and household_id is not distinct from public.my_household());

do $$
declare t text;
begin
  foreach t in array array['grocery_items', 'meals', 'memories', 'tasks'] loop
    execute format('drop policy if exists "%1$s: household all" on public.%1$I', t);
    execute format('create policy "%1$s: household all" on public.%1$I for all to authenticated
                    using (household_id = public.my_household())
                    with check (household_id = public.my_household())', t);
  end loop;
end $$;

drop policy if exists "activity: household read" on public.activity;
create policy "activity: household read" on public.activity for select to authenticated
  using (household_id = public.my_household());
drop policy if exists "activity: write own" on public.activity;
create policy "activity: write own" on public.activity for insert to authenticated
  with check (household_id = public.my_household() and actor_id = auth.uid());

-- Notifications: you only read your own; you may only notify your partner (never yourself).
drop policy if exists "notifications: read own" on public.notifications;
create policy "notifications: read own" on public.notifications for select to authenticated
  using (recipient_id = auth.uid());
drop policy if exists "notifications: mark own" on public.notifications;
create policy "notifications: mark own" on public.notifications for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
drop policy if exists "notifications: delete own" on public.notifications;
create policy "notifications: delete own" on public.notifications for delete to authenticated
  using (recipient_id = auth.uid());
drop policy if exists "notifications: notify partner" on public.notifications;
create policy "notifications: notify partner" on public.notifications for insert to authenticated
  with check (
    household_id = public.my_household()
    and actor_id = auth.uid()
    and recipient_id <> auth.uid()
    and exists (select 1 from public.profiles p where p.id = recipient_id and p.household_id = public.my_household())
  );

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['grocery_items', 'meals', 'memories', 'tasks', 'activity', 'notifications'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Private photo storage: files live under "<household_id>/..." and only members can touch them
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('memories', 'memories', false)
on conflict (id) do update set public = false;

drop policy if exists "memories: household read" on storage.objects;
create policy "memories: household read" on storage.objects for select to authenticated
  using (bucket_id = 'memories' and (storage.foldername(name))[1] = public.my_household()::text);
drop policy if exists "memories: household upload" on storage.objects;
create policy "memories: household upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'memories' and (storage.foldername(name))[1] = public.my_household()::text);
drop policy if exists "memories: household delete" on storage.objects;
create policy "memories: household delete" on storage.objects for delete to authenticated
  using (bucket_id = 'memories' and (storage.foldername(name))[1] = public.my_household()::text);
