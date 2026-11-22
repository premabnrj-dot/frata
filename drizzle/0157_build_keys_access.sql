-- =============================================================================
-- STOREFRONT API: BUILD KEYS (Studio plan G·2; ADR-0018's build-key amendment, owner 2026-11-16: "approve all"; Studio
-- spec docs/specs/2026-11-16-studio-agent.md § 5). Hand-written; the columns and CHECKs are the generated migration
-- before this one. Proof: scripts/verify/tenancy.sql § 81 (grown).
--
-- A third key kind, `build` (frs_build_…): sent in the Frrata-Key header to the dynamic tree h/ only, read from a server,
-- drafts included, looked up uncached. Its end follows its purpose: a session or a developer's computer 24 hours, a
-- preview deployment 30 days at most. What the definer adds, and nothing else moves:
--   - before the store ever opened a build key answers as a test key does (no Website, or the Website on a live domain);
--   - after opening it answers only with a partner_id (decision 5 as amended), and with no Website or a live one;
--   - a build key a partner person made answers only while that person is live in the partner (app_pm_live), still
--     holds a members row on this store, and, for a Lead or a Builder, is assigned to it. Unassigning or removing the
--     person ends their keys at once; nothing is written, the definer derives it (and the lookup is never cached);
--   - the partner's own stops (its link, its suspension) hold as for every key.
-- The returned columns, the definer's settings and its grants are as 0142 made them (re-run below).
-- app_build_key_makers() lists, for Settings › Website, the people who made this store's build keys: their email, their
-- partner's name, whether they still answer and when they left. Ids of the caller's own store only.
-- app_delete_ended_build_keys() deletes build keys past their end, once a day (the daily cron), and answers a count.
-- Two readers that list keys leave build keys out (impact review 2026-11-22): the Accept screen's list
-- (app_my_handover_keys: a brand accepts the website, not a partner's working keys) and Admin's API page
-- (admin_storefront_api_shops: a Studio preview's reads are not the website's). Both keep their columns and grants.
-- =============================================================================
alter table storefront_keys drop constraint storefront_keys_test_days;
--> statement-breakpoint
alter table storefront_keys add constraint storefront_keys_test_days check (expires_at is null or expires_at <= created_at +
  case when kind = 'build' and purpose <> 'preview' then interval '24 hours' else interval '30 days' end);
--> statement-breakpoint
create or replace function app_build_key_maker_live(p_tenant uuid, p_partner uuid, p_user uuid) returns boolean
  language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.app_pm_live(p_user) me
      join public.members m on m.tenant_id = p_tenant and m.partner_member_id = me.member_id
     where me.partner_id = p_partner
       and (me.role = 'owner' or exists (select 1 from public.partner_assignments a
                                          where a.partner_member_id = me.member_id and a.tenant_id = p_tenant)))
$$;
--> statement-breakpoint
revoke all on function app_build_key_maker_live(uuid, uuid, uuid) from public, anon, authenticated, service_role, frata_app, frata_admin, frata_builder;
--> statement-breakpoint
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
     and (k.kind = 'public' or t.first_opened_at is null or (k.kind = 'build' and k.partner_id is not null))
     and (
       (s.site_origin is not null and d.proved_at is not null and d.removed_at is null and d.parked_at is null)
       or (k.kind in ('test', 'build') and s.site_origin is null)
     )
     and (k.partner_id is null or exists (
           select 1 from public.partner_links l join public.partners pa on pa.id = l.partner_id
            where l.tenant_id = k.tenant_id and l.partner_id = k.partner_id and l.removed_at is null
              and pa.approved_at is not null and pa.declined_at is null and pa.suspended_at is null))
     and (k.kind <> 'build' or k.partner_id is null or public.app_build_key_maker_live(k.tenant_id, k.partner_id, k.created_by))
$$;
--> statement-breakpoint
revoke all on function app_storefront_key(text) from public, anon, authenticated, service_role, frata_admin, frata_builder;
--> statement-breakpoint
grant execute on function app_storefront_key(text) to frata_app;
--> statement-breakpoint
create or replace function app_build_key_makers() returns table (user_id uuid, email text, partner_name text, live boolean, left_at timestamptz)
  language sql stable security definer set search_path = '' as $$
  select k.created_by, pm.email, coalesce(nullif(pa.business_name, ''), pa.name),
         public.app_build_key_maker_live(k.tenant_id, k.partner_id, k.created_by), pm.removed_at
    from (select distinct sk.tenant_id, sk.partner_id, sk.created_by from public.storefront_keys sk
           where sk.tenant_id = public.app_current_tenant() and sk.kind = 'build' and sk.partner_id is not null) k
    join public.partners pa on pa.id = k.partner_id
    left join lateral (select x.email, x.removed_at from public.partner_members x
                        where x.user_id = k.created_by and x.partner_id = k.partner_id
                        order by x.removed_at is null desc, x.invited_at desc limit 1) pm on true
   limit 200
$$;
--> statement-breakpoint
revoke all on function app_build_key_makers() from public, anon, authenticated, service_role, frata_admin, frata_builder;
--> statement-breakpoint
grant execute on function app_build_key_makers() to frata_app;
--> statement-breakpoint
create or replace function app_delete_ended_build_keys() returns integer
  language sql volatile security definer set search_path = '' as $$
  with gone as (delete from public.storefront_keys where kind = 'build' and expires_at <= now() returning 1)
  select count(*)::integer from gone
$$;
--> statement-breakpoint
revoke all on function app_delete_ended_build_keys() from public, anon, authenticated, service_role, frata_admin, frata_builder;
--> statement-breakpoint
grant execute on function app_delete_ended_build_keys() to frata_app;
--> statement-breakpoint
create or replace function app_my_handover_keys(p_uid uuid) returns table (invite_id uuid, site_host text, name text, kind text, prefix text)
  language sql stable security definer set search_path = '' as $$
  select h.invite_id, substring(s.site_origin from 9), k.name, k.kind, k.prefix
    from public.app_my_handovers(p_uid) h
    join public.tenants t on t.id = h.tenant_id
    join public.shop_settings s on s.tenant_id = h.tenant_id
    join public.storefront_keys k on k.tenant_id = h.tenant_id
   where k.revoked_at is null and (k.expires_at is null or k.expires_at > now()) and k.kind <> 'build'
     and (k.kind = 'public' or t.first_opened_at is null)
   order by h.invite_id, k.kind, k.created_at
   limit 200
$$;
--> statement-breakpoint
revoke all on function app_my_handover_keys(uuid) from public, anon, authenticated, service_role, frata_admin, frata_builder;
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
       where x.tenant_id = t.id and x.kind <> 'build' and x.revoked_at is null and (x.expires_at is null or x.expires_at > now())
    ) k on true
   where s.site_origin is not null or k.live > 0 or k.test > 0
   order by t.name
   limit 5000
$$;
--> statement-breakpoint
revoke all on function admin_storefront_api_shops() from public, anon, authenticated, service_role, frata_app, frata_builder;
--> statement-breakpoint
grant execute on function admin_storefront_api_shops() to frata_admin;
