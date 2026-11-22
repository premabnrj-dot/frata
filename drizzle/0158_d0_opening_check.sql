-- =============================================================================
-- D0·3 (Studio workbench plan; orchestrator ruling C3, 2026-11-22): Open my store refuses while the brand's website is
-- being built on a key that stops at the opening and no Website is on a proved, live domain. Hand-written.
--
-- app_store_building_keys() counts, for the caller's own store only (app_current_tenant()), its Test and Build keys that
-- answer now by app_storefront_key's own rules before an opening: not deleted, not past their end, the store never
-- opened, the partner's link live and the partner not suspended, a partner person's build key only while
-- app_build_key_maker_live says so. Once the store has ever opened it answers 0, so closing and opening again is never
-- refused (those keys ended at the first opening). openShop reads it in its first select; the console's page derives the
-- same from keyState, so the two agree. A count only; frata_app alone runs it.
-- =============================================================================
create or replace function app_store_building_keys() returns integer
  language sql stable security definer set search_path = '' as $$
  select count(*)::integer
    from public.storefront_keys k
    join public.tenants t on t.id = k.tenant_id
   where k.tenant_id = public.app_current_tenant()
     and k.kind in ('test', 'build')
     and k.revoked_at is null and k.expires_at > now()
     and t.first_opened_at is null
     and (k.partner_id is null or exists (
           select 1 from public.partner_links l join public.partners pa on pa.id = l.partner_id
            where l.tenant_id = k.tenant_id and l.partner_id = k.partner_id and l.removed_at is null
              and pa.approved_at is not null and pa.declined_at is null and pa.suspended_at is null))
     and (k.kind <> 'build'
          or (k.partner_id is null and exists (select 1 from public.members m where m.tenant_id = k.tenant_id and m.user_id = k.created_by))
          or (k.partner_id is not null and public.app_build_key_maker_live(k.tenant_id, k.partner_id, k.created_by)))
$$;
--> statement-breakpoint
revoke all on function app_store_building_keys() from public, anon, authenticated, service_role, frata_admin, frata_builder;
--> statement-breakpoint
grant execute on function app_store_building_keys() to frata_app;
