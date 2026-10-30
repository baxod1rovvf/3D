-- Stand-ins for Supabase's pg_net and pg_cron so schema.sql can be tested on plain PostgreSQL.
create schema if not exists net;
create table if not exists net.calls (id bigserial primary key, url text, body jsonb, headers jsonb);
create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}',
                                         headers jsonb default '{}', timeout_milliseconds int default 5000)
returns bigint language plpgsql as $$
declare i bigint;
begin
  insert into net.calls (url, body, headers) values (url, body, headers) returning id into i;
  return i;
end $$;

create schema if not exists cron;
create table if not exists cron.job (jobid bigserial primary key, jobname text unique, schedule text, command text);
create table if not exists cron.calls (id bigserial primary key, fn text, jobname text);
create or replace function cron.schedule(job_name text, schedule text, command text) returns bigint
language plpgsql as $$
declare i bigint;
begin
  insert into cron.calls (fn, jobname) values ('schedule', job_name);
  insert into cron.job (jobname, schedule, command) values (job_name, schedule, command) returning jobid into i;
  return i;
end $$;
create or replace function cron.unschedule(job_name text) returns boolean
language plpgsql as $$
begin
  insert into cron.calls (fn, jobname) values ('unschedule', job_name);
  delete from cron.job where jobname = job_name;
  return found;
end $$;
