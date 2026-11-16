-- =============================================================================
-- V1 STOREFRONT API SA1b (plan docs/plans/2026-11-16-sa1b.md § Migration; reviews folded in). Hand-written. No new table.
-- Proof: scripts/verify/tenancy.sql § 85 (and § 81's sweep signatures).
--
-- 1. The three drain sweeps page by shop id (D·6): a third argument `p_after uuid default null`, so the running
--    deployment's two-argument calls still resolve during a release (architecture review 8). Ids only, 500 a page (`limit 500` = SWEEP_PAGE in src/lib/db/platform.ts: change both),
--    frata_app alone, as 0143. `app_shops_with_key_stop` also finds a partner REINSTATED in the window (its audit row;
--    the row names the partner, not its id, so the shop's keys are purged whole: harmless), so a reinstated partner's
--    site reads again within minutes, not the hour.
-- 2. `app_shops_with_domain_gone`: shops that lost a domain in the window, so the drain purges only their store entry's
--    `settings` tag (the move to the site, the main address), never the catalogue (speed review 3).
-- 3. `app_my_handover_keys(p_uid)`: the Accept screen's key list, built OVER app_my_handovers (the same invites, no
--    copied predicate: architecture review 11), the keys not revoked, not expired and (test keys) the store not yet open; the partner and domain
--    stops are left to the read itself (a key the drain stopped refuses there). Names, kinds and
--    shown prefixes only: never a hash, key id or shop id. frata_app alone.
-- 4. `admin_storefront_api_shops()` and `admin_storefront_api_listed(p_tenant)`: Frrata Admin › Storefront API, counts
--    and dates only (ADR-0018 § 3: Admin never reads a key, its name or its hash). frata_admin alone.
-- =============================================================================
create index if not exists audit_events_partner_reinstated on audit_events (at) where action = 'shop.partner_reinstated';
--> statement-breakpoint
drop function if exists app_shops_with_boundary(timestamptz, timestamptz);
--> statement-breakpoint
drop function if exists app_shops_with_key_stop(timestamptz, timestamptz);
--> statement-breakpoint
drop function if exists app_shops_with_content_change(timestamptz, timestamptz);
--> statement-breakpoint
create or replace function app_shops_with_boundary(p_since timestamptz, p_until timestamptz, p_after uuid default null) returns setof uuid
  language sql stable security definer set search_path = '' as $$
  select x.id from (
    select tenant_id id from public.products where publish_at > p_since and publish_at <= p_until
    union
    select tenant_id from public.discounts where ended_at is null and starts_at > p_since and starts_at <= p_until
    union
    select tenant_id from public.discounts where ended_at is null and ends_at > p_since and ends_at <= p_until
  ) x where p_after is null or x.id > p_after
  order by 1 limit 500
$$;
--> statement-breakpoint
create or replace function app_shops_with_key_stop(p_since timestamptz, p_until timestamptz, p_after uuid default null) returns setof uuid
  language sql stable security definer set search_path = '' as $$
  select x.id from (
    select k.tenant_id id from public.storefront_keys k
      join public.partner_links l on l.tenant_id = k.tenant_id and l.partner_id = k.partner_id
     where k.revoked_at is null and l.removed_at > p_since and l.removed_at <= p_until
    union
    select k.tenant_id from public.storefront_keys k join public.partners pa on pa.id = k.partner_id
     where k.revoked_at is null and ((pa.suspended_at > p_since and pa.suspended_at <= p_until) or (pa.declined_at > p_since and pa.declined_at <= p_until))
    union
    select d.tenant_id from public.shop_domains d
     where ((d.removed_at > p_since and d.removed_at <= p_until) or (d.parked_at > p_since and d.parked_at <= p_until))
       and exists (select 1 from public.storefront_keys k where k.tenant_id = d.tenant_id and k.revoked_at is null)
    union
    -- A partner reinstated in the window (admin_reinstate_partner writes one audit row per linked shop): its shop's
    -- cached "not found" copies would otherwise answer for the hour.
    select a.tenant_id from public.audit_events a
     where a.action = 'shop.partner_reinstated' and a.at > p_since and a.at <= p_until and a.tenant_id is not null
       and exists (select 1 from public.storefront_keys k where k.tenant_id = a.tenant_id and k.revoked_at is null and k.partner_id is not null)
  ) x where p_after is null or x.id > p_after
  order by 1 limit 500
$$;
--> statement-breakpoint
create or replace function app_shops_with_content_change(p_since timestamptz, p_until timestamptz, p_after uuid default null) returns setof uuid
  language sql stable security definer set search_path = '' as $$
  select x.id from (
    select tenant_id id from public.site_content where updated_at > p_since and updated_at <= p_until
    union
    select tenant_id from public.site_content where starts_at > p_since and starts_at <= p_until
    union
    select tenant_id from public.site_content where deleted_at > p_since and deleted_at <= p_until
    union
    select tenant_id from public.site_content where ends_at > p_since and ends_at <= p_until
  ) x where p_after is null or x.id > p_after
  order by 1 limit 500
$$;
--> statement-breakpoint
create or replace function app_shops_with_domain_gone(p_since timestamptz, p_until timestamptz, p_after uuid default null) returns setof uuid
  language sql stable security definer set search_path = '' as $$
  select distinct d.tenant_id from public.shop_domains d
   where ((d.removed_at > p_since and d.removed_at <= p_until) or (d.parked_at > p_since and d.parked_at <= p_until))
     and (p_after is null or d.tenant_id > p_after)
   order by 1 limit 500
$$;
--> statement-breakpoint
revoke all on function app_shops_with_boundary(timestamptz, timestamptz, uuid), app_shops_with_key_stop(timestamptz, timestamptz, uuid),
  app_shops_with_content_change(timestamptz, timestamptz, uuid), app_shops_with_domain_gone(timestamptz, timestamptz, uuid)
  from public, anon, authenticated, service_role, frata_admin;
--> statement-breakpoint
grant execute on function app_shops_with_boundary(timestamptz, timestamptz, uuid), app_shops_with_key_stop(timestamptz, timestamptz, uuid),
  app_shops_with_content_change(timestamptz, timestamptz, uuid), app_shops_with_domain_gone(timestamptz, timestamptz, uuid) to frata_app;
--> statement-breakpoint
create or replace function app_my_handover_keys(p_uid uuid) returns table (invite_id uuid, site_host text, name text, kind text, prefix text)
  language sql stable security definer set search_path = '' as $$
  select h.invite_id, substring(s.site_origin from 9), k.name, k.kind, k.prefix
    from public.app_my_handovers(p_uid) h
    join public.tenants t on t.id = h.tenant_id
    join public.shop_settings s on s.tenant_id = h.tenant_id and s.site_origin is not null
    join public.storefront_keys k on k.tenant_id = h.tenant_id
   where k.revoked_at is null and (k.expires_at is null or k.expires_at > now())
     and (k.kind = 'public' or t.first_opened_at is null)
   order by h.invite_id, k.kind, k.created_at
   limit 200
$$;
--> statement-breakpoint
revoke all on function app_my_handover_keys(uuid) from public, anon, authenticated, service_role, frata_admin;
--> statement-breakpoint
grant execute on function app_my_handover_keys(uuid) to frata_app;
--> statement-breakpoint
create or replace function admin_storefront_api_shops() returns table (
  tenant_id uuid, name text, slug text, site_host text, main_host text, published boolean, opened_at timestamptz,
  live_keys integer, test_keys integer, last_read date, last_version text, partner text)
  language sql stable security definer set search_path = '' as $$
  select t.id, t.name, t.slug, substring(s.site_origin from 9),
         (select d.host from public.shop_domains d where d.tenant_id = t.id and d.main_at is not null and d.removed_at is null and d.failing_since is null limit 1),
         s.published_at is not null, t.first_opened_at,
         coalesce(k.live, 0), coalesce(k.test, 0), k.last_read, k.last_version,
         (select coalesce(nullif(pa.business_name, ''), pa.name) from public.partner_links l join public.partners pa on pa.id = l.partner_id
           where l.tenant_id = t.id and l.removed_at is null limit 1)
    from public.tenants t
    join public.shop_settings s on s.tenant_id = t.id
    left join lateral (
      select (count(*) filter (where x.kind = 'public'))::int live,
             (count(*) filter (where x.kind = 'test' and t.first_opened_at is null))::int test,
             max(x.last_seen_on) last_read,
             (array_agg(x.last_seen_version order by x.last_seen_on desc nulls last))[1] last_version
        from public.storefront_keys x
       where x.tenant_id = t.id and x.revoked_at is null and (x.expires_at is null or x.expires_at > now())
    ) k on true
   where s.site_origin is not null or k.live > 0 or k.test > 0
   order by t.name
   limit 5000
$$;
--> statement-breakpoint
-- One store's listed products (visibility()'s `listed`: active and not scheduled; pinned by § 84 across every status).
create or replace function admin_storefront_api_listed(p_tenant uuid) returns integer
  language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.products p
   where p.tenant_id = p_tenant and p.status = 'active' and (p.publish_at is null or p.publish_at <= now())
$$;
--> statement-breakpoint
revoke all on function admin_storefront_api_shops(), admin_storefront_api_listed(uuid) from public, anon, authenticated, service_role, frata_app;
--> statement-breakpoint
grant execute on function admin_storefront_api_shops(), admin_storefront_api_listed(uuid) to frata_admin;
