-- "Orqaga" (Settings): a phone deletes its own family row, and ON DELETE CASCADE removes every
-- table's rows for that family. Run by tests/sql/run.sh after supabase/schema.sql has been applied.
\set ON_ERROR_STOP 1

-- Two families with a row in every family table.
insert into public.households (key, name) values
  ('cccccccccccccccccccccccccccccccccccc', 'C'), ('dddddddddddddddddddddddddddddddddddd', 'D');
insert into public.profiles (id, household_id, full_name, role) values
  ('c1111111-1111-1111-1111-111111111111', 'cccccccccccccccccccccccccccccccccccc', 'Malika', 'xotin'),
  ('c2222222-2222-2222-2222-222222222222', 'cccccccccccccccccccccccccccccccccccc', 'Aziz', 'er'),
  ('d1111111-1111-1111-1111-111111111111', 'dddddddddddddddddddddddddddddddddddd', 'Boshqa', 'xotin');
do $$
declare k text;
begin
  foreach k in array array['cccccccccccccccccccccccccccccccccccc', 'dddddddddddddddddddddddddddddddddddd'] loop
    insert into public.grocery_items (household_id, name) values (k, 'Non');
    insert into public.meals (household_id, day_date, slot, title) values (k, current_date, 'kechki', 'Osh');
    insert into public.memories (household_id, title) values (k, 'Sayohat');
    insert into public.tasks (household_id, title) values (k, 'Idish yuvish');
    insert into public.activity (household_id, module, text) values (k, 'grocery', 'Non');
    insert into public.notifications (household_id, recipient_id, module, text) values (k, gen_random_uuid(), 'grocery', 'Non');
    insert into public.photos (household_id, data) values (k, 'data:image/jpeg;base64,AAAA');
    insert into public.family_settings (household_id) values (k);
    insert into public.pair_codes (code, household_id) values (case k when 'cccccccccccccccccccccccccccccccccccc' then '111111' else '222222' end, k);
  end loop;
end $$;
insert into public.push_subscriptions (endpoint, household_id, profile_id, subscription) values
  ('https://push.example/c', 'cccccccccccccccccccccccccccccccccccc', 'c1111111-1111-1111-1111-111111111111', '{}'),
  ('https://push.example/d', 'dddddddddddddddddddddddddddddddddddd', 'd1111111-1111-1111-1111-111111111111', '{}');
insert into public.meal_reminders_sent (household_id, profile_id, day, slot) values
  ('cccccccccccccccccccccccccccccccccccc', 'c1111111-1111-1111-1111-111111111111', current_date, 'kechki'),
  ('dddddddddddddddddddddddddddddddddddd', 'd1111111-1111-1111-1111-111111111111', current_date, 'kechki');

create temp view family_rows as
  select 'households' t, key h from public.households union all
  select 'profiles', household_id from public.profiles union all
  select 'grocery_items', household_id from public.grocery_items union all
  select 'meals', household_id from public.meals union all
  select 'memories', household_id from public.memories union all
  select 'tasks', household_id from public.tasks union all
  select 'activity', household_id from public.activity union all
  select 'notifications', household_id from public.notifications union all
  select 'photos', household_id from public.photos union all
  select 'family_settings', household_id from public.family_settings union all
  select 'pair_codes', household_id from public.pair_codes union all
  select 'push_subscriptions', household_id from public.push_subscriptions union all
  select 'meal_reminders_sent', household_id from public.meal_reminders_sent;

-- 1. Without the key, or with another family's key, nothing of C can be deleted.
begin;
set local role anon;
delete from public.households where key = 'cccccccccccccccccccccccccccccccccccc';
select set_config('request.headers', '{"x-family-key":"dddddddddddddddddddddddddddddddddddd"}', true);
delete from public.households where key = 'cccccccccccccccccccccccccccccccccccc';
commit;
do $$ begin
  if (select count(*) from family_rows where h = 'cccccccccccccccccccccccccccccccccccc') <> 14 then
    raise exception 'C lost rows to a stranger: %', (select count(*) from family_rows where h = 'cccccccccccccccccccccccccccccccccccc');
  end if;
end $$;

-- 2. Family C (anon with its key) deletes its household, exactly as the site does.
begin;
set local role anon;
select set_config('request.headers', '{"x-family-key":"cccccccccccccccccccccccccccccccccccc"}', true);
delete from public.households where key = 'cccccccccccccccccccccccccccccccccccc';
commit;

-- 3. Every table is empty for C, and D still has all of its rows.
do $$
declare left_over text;
begin
  select string_agg(t, ', ') into left_over from family_rows where h = 'cccccccccccccccccccccccccccccccccccc';
  if left_over is not null then raise exception 'C rows left after reset: %', left_over; end if;
  if (select count(distinct t) from family_rows where h = 'dddddddddddddddddddddddddddddddddddd') <> 13 then
    raise exception 'D lost rows when C reset';
  end if;
end $$;

-- 4. The deleted key can no longer make pairing codes; a new family starts clean.
begin;
set local role anon;
select set_config('request.headers', '{"x-family-key":"cccccccccccccccccccccccccccccccccccc"}', true);
do $$ begin
  begin
    perform public.create_pair_code();
    raise exception 'deleted family made a code';
  exception when raise_exception then
    if sqlerrm <> 'family_not_found' then raise; end if;
  end;
end $$;
commit;
