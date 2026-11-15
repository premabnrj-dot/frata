-- =============================================================================
-- V1 STOREFRONT API SA1 — THE TIME-BOUNDARY PURGE (plan docs/plans/2026-11-15-v1-storefront-api.md § SA1·3; unit
-- economics review 2026-11-15). Hand-written. Proof: scripts/verify/tenancy.sql § 81.
--
-- The API's cached copies live an hour and change by purge. A scheduled product going live, or an offer starting or
-- ending, writes nothing at that moment, so the 5-minute drain asks which shops had such a moment in the last window and
-- purges their catalogue. app_shops_with_boundary returns shop ids only (a platform sweep: no row, no product, no offer;
-- frata-architecture § Definers), runs for frata_app alone, and reads two partial indexes.
--
-- A key also stops without a write to its own row: its partner's link to the shop ends, Frrata suspends the partner
-- (Admin, admin_end_partner, across shops), or the domain its Website names goes (Admin's disconnect included). The
-- definer derives each stop at once, but a key's cached lookup lives an hour, and Admin may not read a key or its hash
-- (0138). So app_shops_with_key_stop returns the ids of shops holding a live key that such a moment stopped, and the
-- same drain purges their keys as frata_app (refreshKeys), each through withTenant.
--
-- Store content (the bar, menus, the Contact line: lane B's site_content) reaches the API's hour-long copies through
-- its save's purge, which a burst of saves may leave to the backstop, and a dated bar starts with no write at all. So
-- app_shops_with_content_change returns the shops whose content was saved, deleted, started or ended in the
-- window (a later bar moves up when one ends), and the drain purges their content scope. Ids only, frata_app alone,
-- one index on updated_at and three partial ones.
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
--> statement-breakpoint
create or replace function app_shops_with_key_stop(p_since timestamptz, p_until timestamptz) returns setof uuid
  language sql stable security definer set search_path = '' as $$
  select k.tenant_id from public.storefront_keys k
    join public.partner_links l on l.tenant_id = k.tenant_id and l.partner_id = k.partner_id
   where k.revoked_at is null and l.removed_at > p_since and l.removed_at <= p_until
  union
  select k.tenant_id from public.storefront_keys k join public.partners pa on pa.id = k.partner_id
   where k.revoked_at is null and ((pa.suspended_at > p_since and pa.suspended_at <= p_until) or (pa.declined_at > p_since and pa.declined_at <= p_until))
  union
  select d.tenant_id from public.shop_domains d
   where ((d.removed_at > p_since and d.removed_at <= p_until) or (d.parked_at > p_since and d.parked_at <= p_until))
     and exists (select 1 from public.storefront_keys k where k.tenant_id = d.tenant_id and k.revoked_at is null)
  limit 500
$$;
--> statement-breakpoint
revoke all on function app_shops_with_key_stop(timestamptz, timestamptz) from public, anon, authenticated, service_role, frata_admin;
--> statement-breakpoint
grant execute on function app_shops_with_key_stop(timestamptz, timestamptz) to frata_app;
--> statement-breakpoint
create index if not exists site_content_updated_at on site_content (updated_at);
--> statement-breakpoint
create index if not exists site_content_starts_at on site_content (starts_at) where starts_at is not null;
--> statement-breakpoint
create index if not exists site_content_deleted_at on site_content (deleted_at) where deleted_at is not null;
--> statement-breakpoint
create index if not exists site_content_ends_at on site_content (ends_at) where ends_at is not null;
--> statement-breakpoint
create or replace function app_shops_with_content_change(p_since timestamptz, p_until timestamptz) returns setof uuid
  language sql stable security definer set search_path = '' as $$
  select tenant_id from public.site_content where updated_at > p_since and updated_at <= p_until
  union
  select tenant_id from public.site_content where starts_at > p_since and starts_at <= p_until
  union
  select tenant_id from public.site_content where deleted_at > p_since and deleted_at <= p_until
  union
  select tenant_id from public.site_content where ends_at > p_since and ends_at <= p_until
  limit 500
$$;
--> statement-breakpoint
revoke all on function app_shops_with_content_change(timestamptz, timestamptz) from public, anon, authenticated, service_role, frata_admin;
--> statement-breakpoint
grant execute on function app_shops_with_content_change(timestamptz, timestamptz) to frata_app;
