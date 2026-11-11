-- =============================================================================
-- A·2 · A2·4: CONSOLE › ANALYTICS WITH VISITS, AT 10× (speed review 2026-11-11, measured on a 10× seed). Hand-written:
-- drizzle cannot say INCLUDE.
--   order_lines_product  the products' orders in the window as one grouped join (src/lib/queries/traffic.ts
--                        trafficNames): 40 seq scans of order_lines (1.8 s) → 177–238 ms.
--   orders_outcome_place replaces orders_outcome_pincode (0051) with city covered too, so returns by city are index-only
--                        like returns by pincode (133 ms seq scan → 6–50 ms). Created first, then the old one dropped,
--                        so the pincode read is never without an index.
-- =============================================================================
create index if not exists order_lines_product on order_lines (tenant_id, product_id) include (order_id) where product_id is not null;
--> statement-breakpoint
create index if not exists orders_outcome_place on orders (tenant_id, placed_at) include (pincode, rto_initiated_at, city)
  where cancelled_at is null and (rto_initiated_at is not null or delivered_at is not null or lost_at is not null);
--> statement-breakpoint
drop index if exists orders_outcome_pincode;
