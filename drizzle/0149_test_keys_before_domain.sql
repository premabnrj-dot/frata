-- =============================================================================
-- STOREFRONT API: A TEST KEY BEFORE A DOMAIN (owner, 2026-11-16: "partners should be able to create a website without
-- adding custom domain"; ADR-0018 amendment of that date). Hand-written. Proof: scripts/verify/tenancy.sql § 81.
--
-- app_storefront_key(hash) answered only while the store's Website named a live connected domain. Now a TEST key also
-- answers while the store has no Website set at all, so a partner (or Frrata) builds a site on a store not yet opened,
-- from localhost or a preview, before the brand owns or connects a domain. Nothing else moves:
--   - a public key still needs the Website on a live connected domain (going live is unchanged);
--   - a test key still stops for good once the store has ever opened, after 30 days, when deleted, and when its
--     partner's link ends or the partner is suspended;
--   - a test key on a store whose Website IS set still needs that domain live (a set-but-dead Website stays a stop);
--   - CORS is unchanged: a test key answers browsers only from http://localhost:<port> or the Website's origin; a
--     preview or a server-side render calls without an Origin.
-- The returned columns, the security definer, search_path and the grants are as 0142 made them.
-- =============================================================================
create or replace function app_storefront_key(p_hash text) returns table (key_id uuid, tenant_id uuid, kind text, expires_at timestamptz)
  language sql stable security definer set search_path = '' as $$
  select k.id, k.tenant_id, k.kind, k.expires_at
    from public.storefront_keys k
    join public.tenants t on t.id = k.tenant_id
    join public.shop_settings s on s.tenant_id = k.tenant_id
    left join public.shop_domains d on d.id = s.site_domain_id and d.tenant_id = k.tenant_id
   where k.hash = p_hash
     and k.revoked_at is null
     and (k.expires_at is null or k.expires_at > now())
     and (k.kind = 'public' or t.first_opened_at is null)
     and (
       (s.site_origin is not null and d.proved_at is not null and d.removed_at is null and d.parked_at is null)
       or (k.kind = 'test' and s.site_origin is null)
     )
     and (k.partner_id is null or exists (
           select 1 from public.partner_links l join public.partners pa on pa.id = l.partner_id
            where l.tenant_id = k.tenant_id and l.partner_id = k.partner_id and l.removed_at is null
              and pa.approved_at is not null and pa.declined_at is null and pa.suspended_at is null))
$$;
--> statement-breakpoint
revoke all on function app_storefront_key(text) from public, anon, authenticated, service_role, frata_admin, frata_builder;
--> statement-breakpoint
grant execute on function app_storefront_key(text) to frata_app;
