-- recipes table: family-key RLS. Run by tests/sql/run.sh after schema.sql (twice) and recipes.sql (twice).
\set ON_ERROR_STOP on
create temp table t_ok (ok boolean) on commit preserve rows;
grant all on t_ok to anon;
insert into households (key, name) values ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-recipes', 'A'), ('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-recipes', 'B') on conflict do nothing;

-- Family A can add and read its recipe.
begin;
  set local role anon;
  select set_config('request.headers', '{"x-family-key":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-recipes"}', true);
  insert into recipes (household_id, title, ingredients, steps, emoji) values ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-recipes', 'Tovuq sho''rva', '["Tovuq","Sabzi"]', 'Qaynatish', '🍲');
  do $$ begin if (select count(*) from recipes) <> 1 then raise exception 'family A should see its 1 recipe'; end if; end $$;
  do $$ begin if (select ingredients->>0 from recipes limit 1) <> 'Tovuq' then raise exception 'ingredients stored as a json array'; end if; end $$;
commit;

-- Family B sees nothing and cannot write into A.
begin;
  set local role anon;
  select set_config('request.headers', '{"x-family-key":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-recipes"}', true);
  do $$ begin if (select count(*) from recipes) <> 0 then raise exception 'family B must not see A''s recipes'; end if; end $$;
  do $$ begin
    begin
      insert into recipes (household_id, title) values ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-recipes', 'hack');
      raise exception 'insert into another family should be refused';
    exception when insufficient_privilege then null;
    end;
  end $$;
commit;

-- No key: nothing visible.
begin;
  set local role anon;
  select set_config('request.headers', '{}', true);
  do $$ begin if (select count(*) from recipes) <> 0 then raise exception 'no key, no recipes'; end if; end $$;
commit;
