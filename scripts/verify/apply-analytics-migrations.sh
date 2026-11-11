#!/usr/bin/env bash
# Applies every drizzle-analytics/*.sql migration (A·2's analytics database) to a THROWAWAY Postgres database, after
# creating the API roles Supabase has and a plain Postgres doesn't (the migrations revoke from them). On the same
# server as the main throwaway database, the roles are shared: the migrations set their limits per database.
# Used by analytics-tenancy.sh and e2e/stack.mjs.
#   ANALYTICS_ADMIN_URL=postgres://postgres@localhost:5432/frata_analytics_proof scripts/verify/apply-analytics-migrations.sh
set -euo pipefail
: "${ANALYTICS_ADMIN_URL:?set ANALYTICS_ADMIN_URL to a superuser URL of a throwaway database}"
cd "$(dirname "$0")/../.."
psql "$ANALYTICS_ADMIN_URL" -q -v ON_ERROR_STOP=1 -c "do \$\$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end \$\$;"
# As on Supabase: new tables and functions in public are granted to the API roles unless a migration revokes them.
psql "$ANALYTICS_ADMIN_URL" -q -v ON_ERROR_STOP=1 -c "alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;"
for f in drizzle-analytics/*.sql; do
  sed 's/--> statement-breakpoint//' "$f" | psql "$ANALYTICS_ADMIN_URL" -q -v ON_ERROR_STOP=1; done
