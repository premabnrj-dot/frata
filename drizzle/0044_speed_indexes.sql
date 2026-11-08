-- Speed review 2026-11-08 (docs/research/2026-11-08-performance-security-motion-review.md). Measured at a 10× seed:
-- 150k orders and lines in one shop.
--
-- P9: Orders' "All" tab counts placed orders (placedSql, src/lib/db/order-predicates.ts) on every load: a seq scan
-- of the shop's orders (58 ms at 150k, growing with history). This index holds exactly that predicate.
create index if not exists orders_tenant_placed_only on orders (tenant_id)
  where not ("payment_method" = 'prepaid' and "paid_at" is null and "switched_to_cod_at" is null);
--> statement-breakpoint
-- P10 (order search, ilike '%…%'): measured and left as it is. Under row security Postgres will not use an index
-- for ILIKE / LIKE (not leakproof), so trigram indexes help no query frata_app runs; a definer search made rare terms
-- 4 ms but common ones 460 ms (100 ms today, walking orders_tenant_placed and stopping at the page). 100 ms at 150k
-- orders in one shop is inside the console's budget.
-- P13: the pre-order "owed" count (owedSql) runs for every variant on each catalogue rebuild (146 ms at 3,000
-- variants). Only untaken pre-order lines count, so the index holds only them.
create index if not exists order_lines_preorder_owed on order_lines (tenant_id, variant_id)
  where kind = 'preorder' and stock_taken_at is null;
