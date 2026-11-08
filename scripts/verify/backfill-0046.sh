#!/usr/bin/env bash
# Proves migration 0045/0046's freight backfill (Ship plan review 2): migrates a THROWAWAY database to 0044, places an
# order the way the code before Ship did (forward_shipping defaulted to 0), applies 0045 on, and checks that unknown
# freight became null (so freight.ts uses the shop's estimate) while an order placed after keeps null by default.
#   ADMIN_URL=postgres://postgres@localhost:5432/frata_backfill scripts/verify/backfill-0046.sh
set -euo pipefail
: "${ADMIN_URL:?set ADMIN_URL to a superuser URL of a throwaway database}"
cd "$(dirname "$0")/../.."
# The same throwaway database as backfill-0019 (verify:backfill runs both): start from an empty one.
psql "$ADMIN_URL" -q -v ON_ERROR_STOP=1 -c "drop schema if exists drizzle cascade; drop schema if exists auth cascade; drop schema public cascade; create schema public;"
UNTIL=0044 bash scripts/verify/apply-migrations.sh
psql "$ADMIN_URL" -q -v ON_ERROR_STOP=1 <<'SQL'
insert into tenants (id, slug, name) values ('bf000000-0000-0000-0000-000000000044', 'backfill-0046', 'Backfill');
insert into orders (tenant_id, number, payment_method, placed_at) values ('bf000000-0000-0000-0000-000000000044', 1, 'cod', now());
do $$ begin if (select forward_shipping from orders where number = 1 and tenant_id = 'bf000000-0000-0000-0000-000000000044') <> 0 then raise exception 'FAIL: before 0045 freight defaulted to 0'; end if; end $$;
SQL
FROM=0045 UNTIL=0046 bash scripts/verify/apply-migrations.sh
psql "$ADMIN_URL" -q -v ON_ERROR_STOP=1 <<'SQL'
insert into orders (tenant_id, number, payment_method, placed_at) values ('bf000000-0000-0000-0000-000000000044', 2, 'cod', now());
do $$ begin
  if exists (select 1 from orders where tenant_id = 'bf000000-0000-0000-0000-000000000044' and forward_shipping is not null) then raise exception 'FAIL: unknown freight still reads as a figure'; end if;
end $$;
SQL
echo 'backfill 0046 — unknown freight is null, before and after'
