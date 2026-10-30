-- Push section tests. Run by tests/sql/run.sh after supabase/schema.sql has been applied twice.
\set ON_ERROR_STOP 1

-- Two families: A (wife + husband) and B.
insert into public.households (key, name) values
  ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'A'), ('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'B');
insert into public.profiles (id, household_id, full_name, role) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'Malika', 'xotin'),
  ('22222222-2222-2222-2222-222222222222', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'Aziz', 'er'),
  ('33333333-3333-3333-3333-333333333333', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'Boshqa', 'er');

-- 1. The schema re-ran cleanly: one cron job, unscheduled before rescheduling; new columns exist.
do $$ begin
  if (select count(*) from cron.job where jobname = 'oila-meal-reminders') <> 1 then raise exception 'cron job missing or duplicated'; end if;
  if (select schedule from cron.job where jobname = 'oila-meal-reminders') <> '*/5 * * * *' then raise exception 'cron schedule wrong'; end if;
  if (select command from cron.job where jobname = 'oila-meal-reminders') not like '%https://anmpvewqxvvwzwewnlum.supabase.co/functions/v1/push%"tick"%' then raise exception 'cron command wrong'; end if;
  if (select count(*) from cron.calls where fn = 'unschedule') <> 1 then raise exception 'second run did not unschedule first'; end if;
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'notifications'
      and column_name in ('type', 'title', 'body', 'tag')) <> 4 then raise exception 'notifications columns missing'; end if;
  if (select meal_lead_hours from public.profiles where id = '11111111-1111-1111-1111-111111111111') <> 2 then raise exception 'meal_lead_hours default'; end if;
end $$;

-- meal_lead_hours is limited to 0..3
do $$ begin
  begin
    update public.profiles set meal_lead_hours = 4 where id = '11111111-1111-1111-1111-111111111111';
    raise exception 'lead 4 accepted';
  exception when check_violation then null;
  end;
end $$;

-- 2. Family A (anon with its key) saves settings and its own subscription; upsert updates in place.
begin;
set local role anon;
select set_config('request.headers', '{"x-family-key":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}', true);
insert into public.family_settings (household_id, breakfast, lunch, dinner, timezone)
  values ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '07:30', '13:00', '19:00', 'Asia/Tashkent')
  on conflict (household_id) do update set breakfast = excluded.breakfast, lunch = excluded.lunch, dinner = excluded.dinner, timezone = excluded.timezone;
insert into public.family_settings (household_id, breakfast, lunch, dinner, timezone)
  values ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '08:00', '13:00', '19:30', null)
  on conflict (household_id) do update set breakfast = excluded.breakfast, lunch = excluded.lunch, dinner = excluded.dinner, timezone = excluded.timezone;
insert into public.push_subscriptions (endpoint, household_id, profile_id, subscription)
  values ('https://push.example/1', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', '{"endpoint":"https://push.example/1"}')
  on conflict (endpoint) do update set household_id = excluded.household_id, profile_id = excluded.profile_id, subscription = excluded.subscription;
insert into public.push_subscriptions (endpoint, household_id, profile_id, subscription)
  values ('https://push.example/1', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', '{"endpoint":"https://push.example/1","v":2}')
  on conflict (endpoint) do update set household_id = excluded.household_id, profile_id = excluded.profile_id, subscription = excluded.subscription;
update public.profiles set meal_lead_hours = 3 where id = '11111111-1111-1111-1111-111111111111';
do $$ begin
  if (select count(*) from public.family_settings) <> 1 then raise exception 'A cannot see its settings'; end if;
  if (select dinner from public.family_settings) <> '19:30' then raise exception 'settings upsert did not update'; end if;
  if (select count(*) from public.push_subscriptions) <> 1 then raise exception 'A cannot see its subscription'; end if;
  if (select profile_id from public.push_subscriptions) <> '22222222-2222-2222-2222-222222222222' then raise exception 'subscription upsert did not update'; end if;
end $$;
commit;

-- 3. Family B sees none of it and cannot write into A.
begin;
set local role anon;
select set_config('request.headers', '{"x-family-key":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}', true);
do $$ begin
  if (select count(*) from public.family_settings) <> 0 then raise exception 'B sees A settings'; end if;
  if (select count(*) from public.push_subscriptions) <> 0 then raise exception 'B sees A subscriptions'; end if;
  begin
    insert into public.push_subscriptions (endpoint, household_id, profile_id, subscription)
      values ('https://push.example/x', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', '{}');
    raise exception 'B wrote into A';
  exception when insufficient_privilege then null;
  end;
  update public.profiles set meal_lead_hours = 0 where id = '11111111-1111-1111-1111-111111111111';
end $$;
commit;
do $$ begin
  if (select meal_lead_hours from public.profiles where id = '11111111-1111-1111-1111-111111111111') <> 3 then raise exception 'lead update failed or B changed A'; end if;
end $$;

-- 4. Anon (even with the right key) cannot touch push_keys or meal_reminders_sent.
begin;
set local role anon;
select set_config('request.headers', '{"x-family-key":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}', true);
do $$ begin
  begin perform 1 from public.push_keys; raise exception 'anon reads push_keys';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.meal_reminders_sent; raise exception 'anon reads meal_reminders_sent';
  exception when insufficient_privilege then null; end;
  begin insert into public.meal_reminders_sent (household_id, profile_id, day, slot)
          values ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', '2026-10-30', 'kechki');
        raise exception 'anon writes meal_reminders_sent';
  exception when insufficient_privilege then null; end;
end $$;
commit;
set role authenticated;
do $$ begin
  begin perform 1 from public.push_keys; raise exception 'authenticated reads push_keys';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- 5. A notification insert (by anon, with the full typed row) calls net.http_post once with its id.
truncate net.calls;
begin;
set local role anon;
select set_config('request.headers', '{"x-family-key":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}', true);
insert into public.notifications (household_id, recipient_id, actor_id, module, type, title, body, tag, text, link, read)
  values ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
          'grocery', 'grocery_need', '🛒 Ro''zg''or', 'Sut kerak', 'grocery_need', 'Sut kerak', 'rozgor.html', false);
commit;
do $$
declare n uuid := (select id from public.notifications where type = 'grocery_need');
begin
  if (select count(*) from net.calls) <> 1 then raise exception 'expected 1 http_post, got %', (select count(*) from net.calls); end if;
  if not exists (select 1 from net.calls where body ? 'notification_id' and body ->> 'notification_id' = n::text
                 and url = 'https://anmpvewqxvvwzwewnlum.supabase.co/functions/v1/push'
                 and headers ->> 'Content-Type' = 'application/json') then raise exception 'http_post body/url wrong'; end if;
end $$;

-- 6. A missing pg_net never blocks a notification.
alter function net.http_post(text, jsonb, jsonb, jsonb, int) rename to http_post_off;
insert into public.notifications (household_id, recipient_id, module, text)
  values ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'tasks', 'eski');
alter function net.http_post_off(text, jsonb, jsonb, jsonb, int) rename to http_post;

-- 7. A reminder is claimed once per (household, profile, day, slot).
insert into public.meal_reminders_sent (household_id, profile_id, day, slot)
  values ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', '2026-10-30', 'kechki');
do $$ begin
  begin
    insert into public.meal_reminders_sent (household_id, profile_id, day, slot)
      values ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', '2026-10-30', 'kechki');
    raise exception 'duplicate reminder accepted';
  exception when unique_violation then null;
  end;
end $$;
insert into public.meal_reminders_sent (household_id, profile_id, day, slot)
  values ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', '2026-10-30', 'tushlik');

-- 8. push_keys holds a single row.
insert into public.push_keys (id, public_key, private_key) values (1, 'pub', 'priv');
do $$ begin
  begin insert into public.push_keys (id, public_key, private_key) values (2, 'p', 'q'); raise exception 'second key row';
  exception when check_violation then null; end;
end $$;

-- 9. Meal times must be real HH:MM times.
do $$
declare bad text;
begin
  foreach bad in array array['24:00', '25:00', '19:60', '7:5', 'abc'] loop
    begin
      insert into public.family_settings (household_id, dinner) values ('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', bad);
      raise exception 'time % accepted', bad;
    exception when check_violation then null;
    end;
  end loop;
  insert into public.family_settings (household_id, breakfast, lunch, dinner) values ('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', '7:05', '23:59', '00:00');
  delete from public.family_settings where household_id = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
end $$;

-- 10. save_push_subscription moves a phone to the family that saves it (e.g. after joining B by code).
do $$ begin
  if (select household_id from public.push_subscriptions where endpoint = 'https://push.example/1') <> 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    then raise exception 'precondition: endpoint 1 should be filed under A'; end if;
end $$;
begin;
set local role anon;
select set_config('request.headers', '{"x-family-key":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}', true);
select public.save_push_subscription('https://push.example/1', '33333333-3333-3333-3333-333333333333', '{"endpoint":"https://push.example/1","v":3}');
do $$ begin
  if (select count(*) from public.push_subscriptions) <> 1 then raise exception 'B does not see the moved subscription'; end if;
  if (select profile_id from public.push_subscriptions) <> '33333333-3333-3333-3333-333333333333' then raise exception 'wrong profile'; end if;
  if (select subscription ->> 'v' from public.push_subscriptions) <> '3' then raise exception 'subscription not replaced'; end if;
  -- a profile from another family is refused
  begin
    perform public.save_push_subscription('https://push.example/2', '11111111-1111-1111-1111-111111111111', '{}');
    raise exception 'foreign profile accepted';
  exception when raise_exception then
    if sqlerrm <> 'profile_not_in_family' then raise; end if;
  end;
end $$;
commit;
begin;
set local role anon;
select set_config('request.headers', '{"x-family-key":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}', true);
do $$ begin
  if (select count(*) from public.push_subscriptions) <> 0 then raise exception 'A still sees the moved subscription'; end if;
end $$;
-- saving again under A (same endpoint) moves it back, without an RLS error
select public.save_push_subscription('https://push.example/1', '11111111-1111-1111-1111-111111111111', '{"endpoint":"https://push.example/1"}');
do $$ begin
  if (select count(*) from public.push_subscriptions) <> 1 then raise exception 'A cannot take the endpoint back'; end if;
end $$;
commit;
-- no key at all: refused
begin;
set local role anon;
do $$ begin
  begin
    perform public.save_push_subscription('https://push.example/3', '11111111-1111-1111-1111-111111111111', '{}');
    raise exception 'keyless save accepted';
  exception when raise_exception then
    if sqlerrm <> 'profile_not_in_family' then raise; end if;
  end;
end $$;
commit;
do $$ begin
  if (select count(*) from public.push_subscriptions where endpoint in ('https://push.example/2', 'https://push.example/3')) <> 0
    then raise exception 'refused saves left rows'; end if;
end $$;
