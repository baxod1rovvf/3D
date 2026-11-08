-- Oila Uchun — recipes (Taomlar → 📖 Retseptlar). Part of schema.sql.
-- Paste into Supabase → SQL Editor → New query → Run. Safe to run again.

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  household_id text not null references public.households (key) on delete cascade,
  title text not null,
  photo_path text,                                  -- id of a row in photos
  ingredients jsonb not null default '[]'::jsonb,   -- ["Tovuq", "Sabzi", ...]
  steps text not null default '',
  emoji text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists recipes_family on public.recipes (household_id);

alter table public.recipes enable row level security;
drop policy if exists "family key" on public.recipes;
create policy "family key" on public.recipes for all to anon, authenticated
  using (household_id = public.family_key()) with check (household_id = public.family_key());
grant select, insert, update, delete on public.recipes to anon, authenticated;
