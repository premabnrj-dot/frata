#!/usr/bin/env bash
# Proves tenant isolation on a THROWAWAY Postgres: applies every drizzle/*.sql
# migration, then runs scripts/verify/tenancy.sql. Never point it at production:
# it inserts proof rows.
#   ADMIN_URL=postgres://postgres@localhost:5432/frata_proof scripts/verify/tenancy.sh
# Then the analytics database's proof (A·2) on a second throwaway database beside it, <name>_analytics, recreated
# each run (or ANALYTICS_ADMIN_URL): drizzle-analytics/*.sql, then scripts/verify/analytics-tenancy.sql.
set -euo pipefail
: "${ADMIN_URL:?set ADMIN_URL to a superuser URL of a throwaway database}"
cd "$(dirname "$0")/../.."
bash scripts/verify/apply-migrations.sh
psql "$ADMIN_URL" -q -v ON_ERROR_STOP=1 -f scripts/verify/tenancy.sql
if [ -z "${ANALYTICS_ADMIN_URL:-}" ]; then
  server="${ADMIN_URL%/*}"; name="${ADMIN_URL##*/}"; name="${name%%\?*}_analytics"
  psql "$server/postgres" -q -v ON_ERROR_STOP=1 -c "drop database if exists $name with (force)" -c "create database $name"
  ANALYTICS_ADMIN_URL="$server/$name"
fi
ANALYTICS_ADMIN_URL="$ANALYTICS_ADMIN_URL" bash scripts/verify/apply-analytics-migrations.sh
psql "$ANALYTICS_ADMIN_URL" -q -v ON_ERROR_STOP=1 -f scripts/verify/analytics-tenancy.sql
