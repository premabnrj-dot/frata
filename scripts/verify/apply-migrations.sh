#!/usr/bin/env bash
# Applies every drizzle/*.sql migration to a THROWAWAY Postgres, after creating
# what Supabase provides and a plain Postgres does not (the API roles, auth.users
# as far as the definer functions read it). Used by tenancy.sh and e2e/stack.mjs.
#   ADMIN_URL=postgres://postgres@localhost:5432/frata_proof scripts/verify/apply-migrations.sh
# FROM=0019 applies only migrations from that number on; UNTIL=0018 stops after that one (backfill tests).
set -euo pipefail
: "${ADMIN_URL:?set ADMIN_URL to a superuser URL of a throwaway database}"
cd "$(dirname "$0")/../.."
if [ -z "${FROM:-}" ]; then
psql "$ADMIN_URL" -q -v ON_ERROR_STOP=1 -c "do \$\$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end \$\$;"
# As on Supabase: every new table and function in public is granted to service_role unless a migration revokes it.
psql "$ADMIN_URL" -q -v ON_ERROR_STOP=1 -c "alter default privileges in schema public grant all on tables to service_role;
  alter default privileges in schema public grant all on functions to service_role;"
psql "$ADMIN_URL" -q -v ON_ERROR_STOP=1 -c "create schema if not exists auth;
  create table if not exists auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, last_sign_in_at timestamptz);"
fi
for f in drizzle/*.sql; do
  n=$(basename "$f" | cut -c1-4)
  if [ -n "${FROM:-}" ] && [ "$n" \< "$FROM" ]; then continue; fi
  if [ -n "${UNTIL:-}" ] && [ "$n" \> "$UNTIL" ]; then continue; fi
  sed 's/--> statement-breakpoint//' "$f" | psql "$ADMIN_URL" -q -v ON_ERROR_STOP=1; done
