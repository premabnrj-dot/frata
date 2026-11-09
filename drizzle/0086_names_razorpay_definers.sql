-- =============================================================================
-- SHOP ADDRESSES D1·8 + D1·9 (plan docs/plans/2026-11-08-shop-addresses.md § D1·8, D1·9). Hand-written.
--
-- D1·8: the merchant's word that Razorpay approved a frrata address (no Razorpay API exists to check it): per name,
-- owner or admin, audited. Checkout offers online payment on a host only once it is approved (src/lib/queries/checkout).
-- D1·9: a shop on live payments renames in two steps, so checkout never stops: it ADDS the new name, which serves
-- beside the current one (never redirects) for Razorpay to review; Make main is today's rename (app_change_shop_address,
-- which now also clears `added_at`); an added name not made main in 14 days is let go. One added name at a time.
-- =============================================================================

-- ── The rename (same signature as 0068): an added name becoming current loses its `added_at`. ──
create or replace function app_change_shop_address(p_tenant uuid, p_uid uuid, p_slug text)
  returns void
  language plpgsql volatile security definer set search_path = '' as $$
declare
  v_old text;
  v_opened timestamptz;
  v_frozen timestamptz;
  v_used int;
  v_n int;
  v_email text;
begin
  if not exists (select 1 from public.members m where m.tenant_id = p_tenant and m.user_id = p_uid and m.role in ('owner','admin')) then
    raise exception 'not_owner' using errcode = 'P0001';
  end if;
  if p_slug !~ '^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])$' or p_slug ~ '--' then raise exception 'bad_slug' using errcode = 'P0001'; end if;
  select t.slug, t.first_opened_at, t.address_frozen_at, t.renames_used into v_old, v_opened, v_frozen, v_used from public.tenants t where t.id = p_tenant for update;
  if v_frozen is not null then raise exception 'frozen' using errcode = 'P0001'; end if;
  if v_old = p_slug then return; end if;
  if exists (select 1 from public.blocked_names b where b.name = p_slug)
     or exists (select 1 from public.shop_names n where n.name = p_slug and (n.tenant_id <> p_tenant or n.retired_by_frrata)) then
    raise exception 'slug_taken' using errcode = 'P0001';
  end if;
  if v_opened is null then
    delete from public.shop_names where tenant_id = p_tenant and name = v_old;
  else
    if v_used >= 2 then raise exception 'no_renames_left' using errcode = 'P0001'; end if;
    update public.shop_names set retired_at = now() where tenant_id = p_tenant and name = v_old;
  end if;
  insert into public.shop_names (name, tenant_id) values (p_slug, p_tenant)
    on conflict (name) do update set retired_at = null, added_at = null, created_at = now()
    where public.shop_names.tenant_id = p_tenant and not public.shop_names.retired_by_frrata;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'slug_taken' using errcode = 'P0001'; end if;
  update public.tenants set slug = p_slug, renames_used = renames_used + (case when v_opened is null then 0 else 1 end) where id = p_tenant;
  select u.email into v_email from auth.users u where u.id = p_uid;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    values (p_tenant, p_uid, v_email, 'member', 'shop.address_changed', p_slug, jsonb_build_object('from', v_old));
end;
$$;

--> statement-breakpoint
-- ── D1·9: add a name beside the current one (taken for everyone at once; no change used until it is made main). ──
create or replace function app_add_shop_name(p_tenant uuid, p_uid uuid, p_slug text)
  returns void
  language plpgsql volatile security definer set search_path = '' as $$
declare
  v_frozen timestamptz;
  v_used int;
  v_email text;
begin
  if not exists (select 1 from public.members m where m.tenant_id = p_tenant and m.user_id = p_uid and m.role in ('owner','admin')) then
    raise exception 'not_owner' using errcode = 'P0001';
  end if;
  if p_slug !~ '^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])$' or p_slug ~ '--' then raise exception 'bad_slug' using errcode = 'P0001'; end if;
  select t.address_frozen_at, t.renames_used into v_frozen, v_used from public.tenants t where t.id = p_tenant for update;
  if v_frozen is not null then raise exception 'frozen' using errcode = 'P0001'; end if;
  if v_used >= 2 then raise exception 'no_renames_left' using errcode = 'P0001'; end if;
  -- A name added more than 14 days ago and never made main is let go first (free again; no change was used).
  delete from public.shop_names n where n.tenant_id = p_tenant and n.added_at is not null and n.added_at < now() - interval '14 days';
  if exists (select 1 from public.shop_names n where n.tenant_id = p_tenant and n.added_at is not null) then raise exception 'one_added' using errcode = 'P0001'; end if;
  if exists (select 1 from public.blocked_names b where b.name = p_slug) or exists (select 1 from public.shop_names n where n.name = p_slug) then
    raise exception 'slug_taken' using errcode = 'P0001';
  end if;
  insert into public.shop_names (name, tenant_id, added_at) values (p_slug, p_tenant, now());
  select u.email into v_email from auth.users u where u.id = p_uid;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target)
    values (p_tenant, p_uid, v_email, 'member', 'shop.name_added', p_slug);
end;
$$;

--> statement-breakpoint
-- ── D1·9: let an added name go (it was never shared as the main address, so nothing redirects from it). ──
create or replace function app_drop_added_name(p_tenant uuid, p_uid uuid)
  returns text
  language plpgsql volatile security definer set search_path = '' as $$
declare
  v_name text;
  v_email text;
begin
  if not exists (select 1 from public.members m where m.tenant_id = p_tenant and m.user_id = p_uid and m.role in ('owner','admin')) then
    raise exception 'not_owner' using errcode = 'P0001';
  end if;
  delete from public.shop_names n where n.tenant_id = p_tenant and n.added_at is not null returning n.name into v_name;
  if v_name is null then return null; end if;
  select u.email into v_email from auth.users u where u.id = p_uid;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target)
    values (p_tenant, p_uid, v_email, 'member', 'shop.name_dropped', v_name);
  return v_name;
end;
$$;

--> statement-breakpoint
-- ── D1·8: "Razorpay approved it" on one of the shop's live names (current or added); owner or admin, audited. ──
create or replace function app_name_razorpay_ok(p_tenant uuid, p_uid uuid, p_name text, p_ok boolean)
  returns void
  language plpgsql volatile security definer set search_path = '' as $$
declare
  v_name text;
  v_email text;
begin
  if not exists (select 1 from public.members m where m.tenant_id = p_tenant and m.user_id = p_uid and m.role in ('owner','admin')) then
    raise exception 'not_owner' using errcode = 'P0001';
  end if;
  update public.shop_names n set razorpay_ok_at = case when p_ok then coalesce(n.razorpay_ok_at, now()) end,
      razorpay_ok_by = case when p_ok then coalesce(n.razorpay_ok_by, p_uid) end
   where n.tenant_id = p_tenant and n.name = lower(p_name) and n.retired_at is null
   returning n.name into v_name;
  if v_name is null then raise exception 'no_name' using errcode = 'P0001'; end if;
  select u.email into v_email from auth.users u where u.id = p_uid;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target)
    values (p_tenant, p_uid, v_email, 'member', case when p_ok then 'shop.name_razorpay_ok' else 'shop.name_razorpay_unset' end, v_name);
end;
$$;

--> statement-breakpoint
-- ── The name lookup (same signature as 0068): an added name older than 14 days serves nothing. ──
create or replace function app_shop_for_name(p_name text)
  returns table (id uuid, name text, current_name text, retired boolean, retired_by_frrata boolean)
  language sql stable security definer set search_path = '' as $$
    select t.id, t.name, t.slug, n.retired_at is not null, n.retired_by_frrata
      from public.shop_names n join public.tenants t on t.id = n.tenant_id
     where n.name = lower(p_name) and not (n.added_at is not null and n.added_at < now() - interval '14 days')
$$;

--> statement-breakpoint
revoke all on function app_change_shop_address(uuid, uuid, text), app_add_shop_name(uuid, uuid, text), app_drop_added_name(uuid, uuid),
  app_name_razorpay_ok(uuid, uuid, text, boolean), app_shop_for_name(text) from public, anon, authenticated, service_role;

--> statement-breakpoint
grant execute on function app_change_shop_address(uuid, uuid, text), app_add_shop_name(uuid, uuid, text), app_drop_added_name(uuid, uuid),
  app_name_razorpay_ok(uuid, uuid, text, boolean), app_shop_for_name(text) to frata_app;
