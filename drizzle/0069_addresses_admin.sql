-- =============================================================================
-- SHOP ADDRESSES D1·7 ADMIN (plan docs/plans/2026-11-08-shop-addresses.md § D1·7). Hand-written.
--
-- Admin's address writes are for the `admin` staff role only, checked in SQL as the trials definers do (0063, T9):
--   · Frrata's rename now also requires role 'admin' (not yet called by live code, so its signature stays);
--   · freezing a shop's address changes goes through a definer that writes its own audit row (the column grant from
--     0068 is withdrawn: one way in);
--   · releasing a name deletes a RETIRED shop_names row (never a shop's current name), with a reason, audited.
-- Blocked names stay plain Admin rows (0068's grant), written beside an audit row in one transaction.
-- =============================================================================
create or replace function app_admin_rename_shop(p_tenant uuid, p_staff uuid, p_slug text, p_reason text)
  returns void
  language plpgsql volatile security definer set search_path = '' as $$
declare
  v_old text;
  v_email text;
begin
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then raise exception 'reason' using errcode = 'P0001'; end if;
  if p_slug !~ '^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])$' or p_slug ~ '--' then raise exception 'bad_slug' using errcode = 'P0001'; end if;
  select s.email into v_email from public.platform_staff s where s.user_id = p_staff and s.role = 'admin';
  if v_email is null then raise exception 'not_staff' using errcode = 'P0001'; end if;
  select t.slug into v_old from public.tenants t where t.id = p_tenant for update;
  if v_old is null then raise exception 'no_shop' using errcode = 'P0001'; end if;
  if v_old = p_slug then return; end if;
  if exists (select 1 from public.blocked_names b where b.name = p_slug) or exists (select 1 from public.shop_names n where n.name = p_slug) then
    raise exception 'slug_taken' using errcode = 'P0001';
  end if;
  update public.shop_names set retired_at = now(), retired_by_frrata = true where tenant_id = p_tenant and name = v_old;
  insert into public.shop_names (name, tenant_id) values (p_slug, p_tenant);
  update public.tenants set slug = p_slug where id = p_tenant;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    values (p_tenant, p_staff, v_email, 'staff', 'shop.address_changed', p_slug, jsonb_build_object('from', v_old, 'reason', btrim(p_reason), 'by_frrata', true));
end;
$$;

--> statement-breakpoint
revoke update (address_frozen_at) on tenants from frata_admin;

--> statement-breakpoint
create or replace function app_admin_freeze_address(p_tenant uuid, p_staff uuid, p_frozen boolean, p_reason text)
  returns void
  language plpgsql volatile security definer set search_path = '' as $$
declare
  v_email text;
  v_n int;
begin
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then raise exception 'reason' using errcode = 'P0001'; end if;
  select s.email into v_email from public.platform_staff s where s.user_id = p_staff and s.role = 'admin';
  if v_email is null then raise exception 'not_staff' using errcode = 'P0001'; end if;
  update public.tenants set address_frozen_at = case when p_frozen then coalesce(address_frozen_at, now()) else null end where id = p_tenant;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'no_shop' using errcode = 'P0001'; end if;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    values (p_tenant, p_staff, v_email, 'staff', case when p_frozen then 'shop.address_frozen' else 'shop.address_unfrozen' end, null, jsonb_build_object('reason', btrim(p_reason)));
end;
$$;

--> statement-breakpoint
-- Returns the shop that held the name, so the caller refreshes that shop's host lookups.
create or replace function app_admin_release_name(p_staff uuid, p_name text, p_reason text)
  returns uuid
  language plpgsql volatile security definer set search_path = '' as $$
declare
  v_email text;
  v_tenant uuid;
begin
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then raise exception 'reason' using errcode = 'P0001'; end if;
  select s.email into v_email from public.platform_staff s where s.user_id = p_staff and s.role = 'admin';
  if v_email is null then raise exception 'not_staff' using errcode = 'P0001'; end if;
  delete from public.shop_names where name = lower(p_name) and retired_at is not null returning tenant_id into v_tenant;
  if v_tenant is null then raise exception 'not_retired' using errcode = 'P0001'; end if;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    values (v_tenant, p_staff, v_email, 'staff', 'shop.name_released', lower(p_name), jsonb_build_object('reason', btrim(p_reason)));
  return v_tenant;
end;
$$;

--> statement-breakpoint
revoke all on function app_admin_freeze_address(uuid, uuid, boolean, text), app_admin_release_name(uuid, text, text) from public, anon, authenticated, service_role;

--> statement-breakpoint
grant execute on function app_admin_freeze_address(uuid, uuid, boolean, text), app_admin_release_name(uuid, text, text) to frata_admin;
