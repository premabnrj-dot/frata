-- =============================================================================
-- ANALYTICS A·1: RETURNS BY PINCODE (speed review 2026-11-08, measured at 10×: 193 ms seq scan → 40 ms index-only).
-- Hand-written: drizzle cannot say INCLUDE. A covering partial index over orders with an outcome: the pincode list in
-- src/lib/queries/analytics.ts reads only these columns, so it never touches the heap. Placing an order never writes
-- it (a new order has no outcome); marking an outcome does, once.
-- =============================================================================
create index if not exists orders_outcome_pincode on orders (tenant_id, placed_at) include (pincode, rto_initiated_at)
  where cancelled_at is null and (rto_initiated_at is not null or delivered_at is not null or lost_at is not null);
