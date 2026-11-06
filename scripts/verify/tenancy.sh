#!/usr/bin/env bash
# Proves tenant isolation on a THROWAWAY Postgres: applies every drizzle/*.sql
# migration, then runs scripts/verify/tenancy.sql. Never point it at production:
# it inserts proof rows.
#   ADMIN_URL=postgres://postgres@localhost:5432/frata_proof scripts/verify/tenancy.sh
set -euo pipefail
: "${ADMIN_URL:?set ADMIN_URL to a superuser URL of a throwaway database}"
cd "$(dirname "$0")/../.."
# Supabase creates these roles; a plain Postgres does not.
psql "$ADMIN_URL" -q -v ON_ERROR_STOP=1 -c "do \$\$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end \$\$;"
for f in drizzle/*.sql; do sed 's/--> statement-breakpoint//' "$f" | psql "$ADMIN_URL" -q -v ON_ERROR_STOP=1; done
psql "$ADMIN_URL" -q -v ON_ERROR_STOP=1 -f scripts/verify/tenancy.sql
