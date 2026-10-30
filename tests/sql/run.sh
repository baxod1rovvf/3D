#!/usr/bin/env bash
# Runs supabase/schema.sql (twice) and tests/sql/push.sql against a fresh local PostgreSQL 16 database.
# Env: PGHOST (default /tmp/oila-pgtest), PGPORT (5499), PGUSER (postgres), DB (oila_t8).
set -euo pipefail
cd "$(dirname "$0")/../.."
export PGHOST="${PGHOST:-/tmp/oila-pgtest}" PGPORT="${PGPORT:-5499}" PGUSER="${PGUSER:-postgres}"
export PGOPTIONS="${PGOPTIONS:--c client_min_messages=warning}"
DB="${DB:-oila_t8}"
BIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PSQL=("$BIN/psql" -X -q -v ON_ERROR_STOP=1)

"$BIN/dropdb" --if-exists "$DB"
"$BIN/createdb" "$DB"
"${PSQL[@]}" -d "$DB" -c "do \$\$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end \$\$;"
"${PSQL[@]}" -d "$DB" -f tests/sql/stubs.sql
"${PSQL[@]}" -d "$DB" -f supabase/schema.sql
"${PSQL[@]}" -d "$DB" -f supabase/schema.sql
"${PSQL[@]}" -d "$DB" -f tests/sql/push.sql > /dev/null
echo PASS
