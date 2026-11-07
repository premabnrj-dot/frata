#!/usr/bin/env bash
# Proves migration 0019/0020's backfill on orders placed by the code before 1D:
# migrates a THROWAWAY database to 0018, loads pre-1D fixture orders
# (scripts/verify/backfill-0019.sql), applies 0019 on, and checks each column.
#   ADMIN_URL=postgres://postgres@localhost:5432/frata_backfill scripts/verify/backfill-0019.sh
set -euo pipefail
: "${ADMIN_URL:?set ADMIN_URL to a superuser URL of a throwaway database}"
cd "$(dirname "$0")/../.."
UNTIL=0018 bash scripts/verify/apply-migrations.sh
psql "$ADMIN_URL" -q -v ON_ERROR_STOP=1 -v phase=before -f scripts/verify/backfill-0019.sql
FROM=0019 UNTIL=0020 bash scripts/verify/apply-migrations.sh
psql "$ADMIN_URL" -q -v ON_ERROR_STOP=1 -v phase=after -f scripts/verify/backfill-0019.sql
