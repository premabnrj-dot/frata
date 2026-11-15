-- =============================================================================
-- V1 STOREFRONT API SA1 — THE TIME-BOUNDARY PURGE (plan docs/plans/2026-11-15-v1-storefront-api.md § SA1·3; unit
-- economics review 2026-11-15). Hand-written. Proof: scripts/verify/tenancy.sql § 81.
--
-- The API's cached copies live an hour and change by purge. A scheduled product going live, or an offer starting or
-- ending, writes nothing at that moment, so the 5-minute drain asks which shops had such a moment in the last window and
-- purges their catalogue. app_shops_with_boundary returns shop ids only (a platform sweep: no row, no product, no offer;
-- frata-architecture § Definers), runs for frata_app alone, and reads two partial indexes.
-- =============================================================================
create index if not exists products_publish_at on products (publish_at) where publish_at is not null;
--> statement-breakpoint
create index if not exists discounts_starts_at on discounts (starts_at) where ended_at is null;
--> statement-breakpoint
create index if not exists discounts_ends_at on discounts (ends_at) where ends_at is not null and ended_at is null;
--> statement-breakpoint
create or replace function app_shops_with_boundary(p_since timestamptz, p_until timestamptz) returns setof uuid
  language sql stable security definer set search_path = '' as $$
  select tenant_id from public.products where publish_at > p_since and publish_at <= p_until
  union
  select tenant_id from public.discounts where ended_at is null and starts_at > p_since and starts_at <= p_until
  union
  select tenant_id from public.discounts where ended_at is null and ends_at > p_since and ends_at <= p_until
  limit 500
$$;
--> statement-breakpoint
revoke all on function app_shops_with_boundary(timestamptz, timestamptz) from public, anon, authenticated, service_role, frata_admin;
--> statement-breakpoint
grant execute on function app_shops_with_boundary(timestamptz, timestamptz) to frata_app;
