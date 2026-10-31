-- Oila Uchun — device pairing ONLY (part of schema.sql): Qurilmani ulash / Menda kod bor.
-- Paste into Supabase → SQL Editor → New query → Run. Safe to run again.

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

