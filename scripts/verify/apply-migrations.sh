#!/usr/bin/env bash
# Applies every drizzle/*.sql migration to a THROWAWAY Postgres, after creating
# what Supabase provides and a plain Postgres does not (the API roles, auth.users
# as far as the definer functions read it). Used by tenancy.sh and e2e/stack.mjs.
#   ADMIN_URL=postgres://postgres@localhost:5432/frata_proof scripts/verify/apply-migrations.sh
set -euo pipefail
: "${ADMIN_URL:?set ADMIN_URL to a superuser URL of a throwaway database}"
cd "$(dirname "$0")/../.."
psql "$ADMIN_URL" -q -v ON_ERROR_STOP=1 -c "do \$\$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end \$\$;"
psql "$ADMIN_URL" -q -v ON_ERROR_STOP=1 -c "create schema if not exists auth;
  create table if not exists auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, last_sign_in_at timestamptz);"
for f in drizzle/*.sql; do sed 's/--> statement-breakpoint//' "$f" | psql "$ADMIN_URL" -q -v ON_ERROR_STOP=1; done
