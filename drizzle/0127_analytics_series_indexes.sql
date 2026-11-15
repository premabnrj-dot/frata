-- =============================================================================
-- NEEL N1b: ANALYTICS' NEW SECTIONS AT 10× (speed review 2026-11-15, measured as frata_app under RLS at 150 k and 600 k
-- orders; plan docs/plans/2026-11-15-neel-n1b-analytics.md § N1b·3). Hand-written: drizzle cannot say INCLUDE.
--   orders_outcome_state  replaces orders_outcome_place (0101) with the delivery state covered too, so "Came back, by
--                         state" is index-only like returns by pincode and city (36–47 → 13 ms at 30 days). Created
--                         first, then the old one dropped, so those reads are never without an index.
--   orders_phone_history  shoppers who come back: one aggregate per phone over every standing order with a phone (erasure
--                         blanks it), index-only into a streaming group (360–450 ms seq scan → 70–109 ms at 150 k). The
--                         predicate is standingSql's text (src/lib/db/order-predicates.ts): change both together.
-- =============================================================================
create index if not exists orders_outcome_state on orders (tenant_id, placed_at) include (pincode, rto_initiated_at, city, state)
  where cancelled_at is null and (rto_initiated_at is not null or delivered_at is not null or lost_at is not null);
--> statement-breakpoint
drop index if exists orders_outcome_place;
--> statement-breakpoint
create index if not exists orders_phone_history on orders (tenant_id, phone, placed_at)
  where phone <> '' and cancelled_at is null and not (payment_method = 'prepaid' and paid_at is null and switched_to_cod_at is null);
