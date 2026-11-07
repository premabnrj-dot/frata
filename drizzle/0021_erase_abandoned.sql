-- =============================================================================
-- ERASING ABANDONED ONLINE ORDERS FROM THE DAILY JOB (1D gap fix). Hand-written.
-- The cron runs with no shop set, so row security hides every order — as it
-- should. This answers only WHICH shops have an online order never paid and
-- older than the cutoff whose shopper details are still there: shop ids, no
-- order data. The erasing itself runs inside each shop's own transaction
-- (src/lib/orders/erase.ts, withTenant) — never a no-tenant policy.
-- =============================================================================
create or replace function app_shops_to_erase(p_before timestamptz) returns setof uuid
  language sql stable security definer set search_path = '' as $$
  select distinct o.tenant_id from public.orders o
   where o.erased_at is null and o.payment_method = 'prepaid' and o.paid_at is null and o.switched_to_cod_at is null and o.placed_at < p_before
   limit 500
$$;
--> statement-breakpoint
-- The list reads only online orders never paid and not yet erased: a small partial index keeps the daily scan small.
create index if not exists orders_to_erase on orders (placed_at) where payment_method = 'prepaid' and paid_at is null and switched_to_cod_at is null and erased_at is null;
--> statement-breakpoint
revoke all on function app_shops_to_erase(timestamptz) from public, anon, authenticated, service_role;
--> statement-breakpoint
grant execute on function app_shops_to_erase(timestamptz) to frata_app;
