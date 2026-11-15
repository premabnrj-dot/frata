-- =============================================================================
-- V1 STOREFRONT API SA0 — STOREFRONT KEYS, ACCESS (ADR-0018; plan docs/plans/2026-11-15-v1-storefront-api.md § SA0·3).
-- Hand-written. Proof: scripts/verify/tenancy.sql § 81.
--
-- storefront_keys: the shop's own rows. frata_app reads and adds its own, changes only a name, the deletion
--   (revoked_at, revoked_by: written once) and when it was last seen; never the hash, kind, shop or maker; never
--   deletes. frata_admin: none (no column of it, hash least of all). anon, authenticated, service_role: none.
-- shop_settings.site_origin / site_domain_id: written by frata_app through its existing update grant; the origin must be
--   the apex or www.<apex> of a live connected domain of the SAME shop (app_site_origin_check), and removing or parking
--   that domain clears both (app_site_domain_gone).
-- app_storefront_key(hash): the ONE way from a key to a shop. Every stop is derived here, so none can race: deleted,
--   expired, a test key once the store has ever opened, a key made by a partner whose link to this shop is gone or
--   who is suspended, and a Website not pointing at a live connected domain (Runs on Frrata).
-- =============================================================================
alter table shop_settings add constraint shop_settings_site_domain_fk foreign key (site_domain_id) references shop_domains(id) on delete restrict;
--> statement-breakpoint
revoke all on storefront_keys from public, anon, authenticated, service_role;
--> statement-breakpoint
alter table storefront_keys enable row level security;
--> statement-breakpoint
create policy tenant_rows on storefront_keys for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint
grant select, insert on storefront_keys to frata_app;
--> statement-breakpoint
grant update (name, revoked_at, revoked_by, last_seen_version, last_seen_on) on storefront_keys to frata_app;
--> statement-breakpoint
create or replace function app_storefront_key_revoked_once() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if old.revoked_at is not null and (new.revoked_at is distinct from old.revoked_at or new.revoked_by is distinct from old.revoked_by) then
    raise exception 'storefront key already deleted' using errcode = '23514';
  end if;
  return new;
end $$;
--> statement-breakpoint
create trigger storefront_keys_revoked_once before update on storefront_keys for each row execute function app_storefront_key_revoked_once();
--> statement-breakpoint
create or replace function app_site_origin_check() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare v_apex text; v_host text;
begin
  if new.site_origin is null then return new; end if;
  select d.apex into v_apex from public.shop_domains d
   where d.id = new.site_domain_id and d.tenant_id = new.tenant_id
     and d.proved_at is not null and d.removed_at is null and d.parked_at is null;
  if v_apex is null then raise exception 'site domain not live for this shop' using errcode = '23514'; end if;
  v_host := substring(new.site_origin from 9);
  if v_host <> v_apex and v_host <> 'www.' || v_apex then
    raise exception 'site origin not on its domain' using errcode = '23514';
  end if;
  return new;
end $$;
--> statement-breakpoint
create trigger shop_settings_site_origin before insert or update of site_origin, site_domain_id on shop_settings
  for each row execute function app_site_origin_check();
--> statement-breakpoint
create or replace function app_site_domain_gone() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if new.removed_at is not null or new.parked_at is not null then
    update public.shop_settings set site_origin = null, site_domain_id = null
     where tenant_id = new.tenant_id and site_domain_id = new.id;
  end if;
  return new;
end $$;
--> statement-breakpoint
create trigger shop_domains_site_gone after update of removed_at, parked_at on shop_domains
  for each row execute function app_site_domain_gone();
--> statement-breakpoint
create or replace function app_storefront_key(p_hash text) returns table (key_id uuid, tenant_id uuid, kind text, expires_at timestamptz)
  language sql stable security definer set search_path = '' as $$
  select k.id, k.tenant_id, k.kind, k.expires_at
    from public.storefront_keys k
    join public.tenants t on t.id = k.tenant_id
    join public.shop_settings s on s.tenant_id = k.tenant_id
    join public.shop_domains d on d.id = s.site_domain_id and d.tenant_id = k.tenant_id
   where k.hash = p_hash
     and k.revoked_at is null
     and (k.expires_at is null or k.expires_at > now())
     and s.site_origin is not null
     and d.proved_at is not null and d.removed_at is null and d.parked_at is null
     and (k.kind = 'public' or t.first_opened_at is null)
     and (k.partner_id is null or exists (
           select 1 from public.partner_links l join public.partners pa on pa.id = l.partner_id
            where l.tenant_id = k.tenant_id and l.partner_id = k.partner_id and l.removed_at is null
              and pa.approved_at is not null and pa.declined_at is null and pa.suspended_at is null))
$$;
--> statement-breakpoint
revoke all on function app_storefront_key(text), app_site_origin_check(), app_site_domain_gone(), app_storefront_key_revoked_once()
  from public, anon, authenticated, service_role, frata_admin;
--> statement-breakpoint
grant execute on function app_storefront_key(text) to frata_app;
