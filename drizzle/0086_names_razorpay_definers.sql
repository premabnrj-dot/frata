-- =============================================================================
-- SHOP ADDRESSES D1·8 + D1·9 (plan docs/plans/2026-11-08-shop-addresses.md § D1·8, D1·9). Hand-written.
--
-- D1·8: the merchant's word that Razorpay approved a frrata address (no Razorpay API exists to check it): per name,
-- owner or admin, audited. Checkout offers online payment on a host only once it is approved (src/lib/queries/checkout).
-- D1·9: a shop on live payments renames in two steps, so checkout never stops: it ADDS the new name, which serves
-- beside the current one (never redirects) for Razorpay to review; Make main is today's rename (app_change_shop_address,
-- which now also clears `added_at`); an added name not made main in 14 days is let go. One added name at a time.
-- On live payments an opened shop's rename, and the way back from a main domain, land only on a name Razorpay approved
-- (the server's rule, not only the UI's). A shop may add one of its own old names back (it was its own; it redirected).
-- Letting an added name go (dropped, 14 days, Frrata's block) is ONE routine, app_let_go_names: an old name added back
-- is old again (it keeps redirecting, as promised); a new one is deleted (free for anyone). Past its 14 days a new
-- added name serves nothing at once; the next write that reads it, or the daily sweep (app_let_go_added_names), lets it go.
-- =============================================================================

-- ── The one way an added name is let go. Internal: run only inside the definers below (granted to no role). An old
--    name added back is told apart by its row being older than its adding (created_at < added_at). ──
create or replace function app_let_go_names(p_tenant uuid, p_name text, p_expired_only boolean)
  returns setof text
  language plpgsql volatile security definer set search_path = '' as $$
begin
  return query update public.shop_names n set retired_at = now(), added_at = null
    where n.added_at is not null and n.created_at < n.added_at
      and (p_tenant is null or n.tenant_id = p_tenant) and (p_name is null or n.name = p_name)
      and (not p_expired_only or n.added_at < now() - interval '14 days')
    returning n.name;
  return query delete from public.shop_names n
    where n.added_at is not null
      and (p_tenant is null or n.tenant_id = p_tenant) and (p_name is null or n.name = p_name)
      and (not p_expired_only or n.added_at < now() - interval '14 days')
    returning n.name;
end;
$$;

--> statement-breakpoint

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
  -- Added names past their 14 days (this shop's, and the asked name wherever it is) are let go before anything reads them.
  perform public.app_let_go_names(p_tenant, null, true);
  perform public.app_let_go_names(null, p_slug, true);
  if exists (select 1 from public.blocked_names b where b.name = p_slug)
     or exists (select 1 from public.shop_names n where n.name = p_slug and (n.tenant_id <> p_tenant or n.retired_by_frrata)) then
    raise exception 'slug_taken' using errcode = 'P0001';
  end if;
  if v_opened is null then
    delete from public.shop_names where tenant_id = p_tenant and name = v_old;
  else
    if v_used >= 2 then raise exception 'no_renames_left' using errcode = 'P0001'; end if;
    -- Live payments (0084's test): online payment must not stop, so the new main name is one Razorpay approved.
    if exists (select 1 from public.payment_keys k where k.tenant_id = p_tenant and k.mode = 'live' and k.webhook_seen_at is not null)
       and not exists (select 1 from public.shop_names n where n.tenant_id = p_tenant and n.name = p_slug and n.razorpay_ok_at is not null and not n.retired_by_frrata) then
      raise exception 'needs_razorpay' using errcode = 'P0001';
    end if;
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
-- ── D1·9: add a name beside the current one (taken for everyone at once; no change used until it is made main), or
--    add one of the shop's own old names back (not one Frrata retired). ──
create or replace function app_add_shop_name(p_tenant uuid, p_uid uuid, p_slug text)
  returns void
  language plpgsql volatile security definer set search_path = '' as $$
declare
  v_frozen timestamptz;
  v_used int;
  v_n int;
  v_email text;
begin
  if not exists (select 1 from public.members m where m.tenant_id = p_tenant and m.user_id = p_uid and m.role in ('owner','admin')) then
    raise exception 'not_owner' using errcode = 'P0001';
  end if;
  if p_slug !~ '^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])$' or p_slug ~ '--' then raise exception 'bad_slug' using errcode = 'P0001'; end if;
  select t.address_frozen_at, t.renames_used into v_frozen, v_used from public.tenants t where t.id = p_tenant for update;
  if v_frozen is not null then raise exception 'frozen' using errcode = 'P0001'; end if;
  if v_used >= 2 then raise exception 'no_renames_left' using errcode = 'P0001'; end if;
  -- A name added more than 14 days ago and never made main is let go first (no change was used).
  perform public.app_let_go_names(p_tenant, null, true);
  perform public.app_let_go_names(null, p_slug, true);
  if exists (select 1 from public.shop_names n where n.tenant_id = p_tenant and n.added_at is not null) then raise exception 'one_added' using errcode = 'P0001'; end if;
  if exists (select 1 from public.blocked_names b where b.name = p_slug)
     or exists (select 1 from public.shop_names n where n.name = p_slug and (n.tenant_id <> p_tenant or n.retired_by_frrata or n.retired_at is null)) then
    raise exception 'slug_taken' using errcode = 'P0001';
  end if;
  insert into public.shop_names (name, tenant_id, added_at) values (p_slug, p_tenant, now())
    on conflict (name) do update set retired_at = null, added_at = now()
    where public.shop_names.tenant_id = p_tenant and not public.shop_names.retired_by_frrata and public.shop_names.retired_at is not null;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'slug_taken' using errcode = 'P0001'; end if;
  select u.email into v_email from auth.users u where u.id = p_uid;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target)
    values (p_tenant, p_uid, v_email, 'member', 'shop.name_added', p_slug);
end;
$$;

--> statement-breakpoint
-- ── D1·9: let the added name go (app_let_go_names: a new one is free again; an old one added back redirects again). ──
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
  select x into v_name from public.app_let_go_names(p_tenant, null, false) as x limit 1;
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
     and not (n.added_at is not null and n.added_at < now() - interval '14 days')
   returning n.name into v_name;
  if v_name is null then raise exception 'no_name' using errcode = 'P0001'; end if;
  select u.email into v_email from auth.users u where u.id = p_uid;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target)
    values (p_tenant, p_uid, v_email, 'member', case when p_ok then 'shop.name_razorpay_ok' else 'shop.name_razorpay_unset' end, v_name);
end;
$$;

--> statement-breakpoint
-- ── The name lookup (same signature as 0068): a new added name past its 14 days serves nothing; an old name added
--    back redirects again once its 14 days are up. ──
create or replace function app_shop_for_name(p_name text)
  returns table (id uuid, name text, current_name text, retired boolean, retired_by_frrata boolean)
  language sql stable security definer set search_path = '' as $$
    select t.id, t.name, t.slug, n.retired_at is not null or coalesce(n.added_at < now() - interval '14 days', false), n.retired_by_frrata
      from public.shop_names n join public.tenants t on t.id = n.tenant_id
     where n.name = lower(p_name) and (n.added_at is null or n.added_at >= now() - interval '14 days' or n.created_at < n.added_at)
$$;

--> statement-breakpoint
-- ── The daily sweep (the domains cron): added names past their 14 days are let go, free for anyone; their names come
--    back so the host lookups can be refreshed. ──
create or replace function app_let_go_added_names()
  returns setof text
  language sql volatile security definer set search_path = '' as $$
    select public.app_let_go_names(null, null, true)
$$;

--> statement-breakpoint
-- ── Blocking a name (same signature as 0069) also takes down a shop's added name of that name: it was never main, so
--    nothing redirects from it; audited on that shop. ──
create or replace function app_admin_block_name(p_staff uuid, p_name text, p_kind text, p_reason text)
  returns boolean
  language plpgsql volatile security definer set search_path = '' as $$
declare
  v_email text;
  v_n int;
  v_tenant uuid;
begin
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then raise exception 'reason' using errcode = 'P0001'; end if;
  select s.email into v_email from public.platform_staff s where s.user_id = p_staff and s.role = 'admin';
  if v_email is null then raise exception 'not_staff' using errcode = 'P0001'; end if;
  if p_kind not in ('protected', 'offensive', 'domain')
     or (p_kind = 'domain' and p_name !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$')
     or (p_kind <> 'domain' and (p_name !~ '^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])$' or p_name ~ '--')) then
    raise exception 'bad_slug' using errcode = 'P0001';
  end if;
  select n.tenant_id into v_tenant from public.shop_names n where n.name = p_name and n.added_at is not null;
  if v_tenant is not null then
    perform public.app_let_go_names(v_tenant, p_name, false);
    insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
      values (v_tenant, p_staff, v_email, 'staff', 'shop.name_taken_down', p_name, jsonb_build_object('reason', btrim(p_reason)));
  end if;
  insert into public.blocked_names (name, kind, reason, created_by) values (p_name, p_kind, btrim(p_reason), p_staff) on conflict (name) do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then return false; end if;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    values (null, p_staff, v_email, 'staff', 'name.blocked', p_name, jsonb_build_object('kind', p_kind, 'reason', btrim(p_reason)));
  return true;
end;
$$;

--> statement-breakpoint
-- ── Back from a main domain to the frrata name (same signature as 0084): on live payments, only to a name Razorpay
--    approved (online payment must not stop). ──
create or replace function app_unmake_domain_main(p_tenant uuid, p_uid uuid)
  returns void
  language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_host text;
  v_email text;
begin
  if not exists (select 1 from public.members m where m.tenant_id = p_tenant and m.user_id = p_uid and m.role in ('owner','admin')) then
    raise exception 'not_owner' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.shop_domains d where d.tenant_id = p_tenant and d.main_at is not null)
     and exists (select 1 from public.payment_keys k where k.tenant_id = p_tenant and k.mode = 'live' and k.webhook_seen_at is not null)
     and not exists (select 1 from public.shop_names n where n.tenant_id = p_tenant and n.retired_at is null and n.added_at is null and n.razorpay_ok_at is not null) then
    raise exception 'razorpay' using errcode = 'P0001';
  end if;
  update public.shop_domains d set main_at = null where d.tenant_id = p_tenant and d.main_at is not null returning d.host into v_host;
  if v_host is null then return; end if;
  select u.email into v_email from auth.users u where u.id = p_uid;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target)
    values (p_tenant, p_uid, v_email, 'member', 'domain.main_back_to_name', v_host);
end;
$$;

--> statement-breakpoint
revoke all on function app_let_go_names(uuid, text, boolean) from public, anon, authenticated, service_role, frata_app, frata_admin;

--> statement-breakpoint
revoke all on function app_change_shop_address(uuid, uuid, text), app_add_shop_name(uuid, uuid, text), app_drop_added_name(uuid, uuid),
  app_name_razorpay_ok(uuid, uuid, text, boolean), app_shop_for_name(text), app_let_go_added_names(),
  app_admin_block_name(uuid, text, text, text), app_unmake_domain_main(uuid, uuid) from public, anon, authenticated, service_role;

--> statement-breakpoint
grant execute on function app_change_shop_address(uuid, uuid, text), app_add_shop_name(uuid, uuid, text), app_drop_added_name(uuid, uuid),
  app_name_razorpay_ok(uuid, uuid, text, boolean), app_shop_for_name(text), app_let_go_added_names(), app_unmake_domain_main(uuid, uuid) to frata_app;

--> statement-breakpoint
grant execute on function app_admin_block_name(uuid, text, text, text) to frata_admin;
