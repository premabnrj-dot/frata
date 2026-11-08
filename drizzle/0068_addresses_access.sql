-- =============================================================================
-- SHOP ADDRESSES D·1 ACCESS (spec docs/specs/2026-11-08-shop-addresses.md; plan docs/plans/2026-11-08-shop-addresses.md
-- § D·1, reviews: tenancy H4/M10/M12, architecture B1/B3/M8/M9/M10/M11, security M3). Hand-written.
--
-- ONE record of names: every name a shop has had is a shop_names row, and its primary key means a name is never given
-- to a second shop. A trigger on tenants writes the row for every creator (sign-up, partners, Admin), so no path can
-- take a retired name; tenants.slug mirrors the current row and may change only through the rename definers.
-- Renames: free before the shop's FIRST opening (the unshared row is deleted); two after it, counted by
-- tenants.renames_used (taking back an old name counts too: no back-and-forth); the old name retires and redirects. Frrata's rename (impersonation) retires the old name WITHOUT a redirect.
-- New definers sit beside the old ones (B3): app_slug_available and app_tenant_for_slug stay until the code has moved.
-- =============================================================================
insert into shop_names (name, tenant_id, created_at) select t.slug, t.id, t.created_at from tenants t on conflict (name) do nothing;
--> statement-breakpoint
-- The first opening: the earliest of "opened" in the audit log and today's published_at, so a shop that opened and then
-- closed still counts as opened (impact review D·1).
update tenants t set first_opened_at = o.first from (
  select x.tenant_id, min(x.at) as first from (
    select a.tenant_id, a.at from audit_events a where a.action = 'shop.open'
    union all select s.tenant_id, s.published_at from shop_settings s where s.published_at is not null
  ) x group by x.tenant_id
) o where o.tenant_id = t.id and t.first_opened_at is null;
--> statement-breakpoint
revoke all on shop_names, blocked_names from anon, authenticated, service_role;
--> statement-breakpoint
alter table shop_names enable row level security;
--> statement-breakpoint
alter table blocked_names enable row level security;
--> statement-breakpoint
-- A shop reads its own names (Settings shows the old ones); no app writes: only the trigger and the definers below.
grant select on shop_names to frata_app;
--> statement-breakpoint
create policy tenant_read on shop_names for select to frata_app using (tenant_id = app_current_tenant());
--> statement-breakpoint
grant select on shop_names to frata_admin;
--> statement-breakpoint
create policy admin_read on shop_names for select to frata_admin using (true);
--> statement-breakpoint
-- The blocked list never reaches the app (a check answers only "Taken"); Admin keeps it.
grant select, insert, delete on blocked_names to frata_admin;
--> statement-breakpoint
create policy admin_all on blocked_names for all to frata_admin using (true) with check (true);
--> statement-breakpoint
-- Admin may no longer write a slug directly (tenancy H4): names change only through the rename definers.
revoke update on tenants from frata_admin;
--> statement-breakpoint
grant update (name, is_internal, address_frozen_at) on tenants to frata_admin;
--> statement-breakpoint

-- ── Every new shop's name is a shop_names row; a name ever used or blocked is refused (every creator) ──
create or replace function app_tenant_name_recorded() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.blocked_names b where b.name = new.slug) then
    raise exception 'slug_taken' using errcode = 'P0001';
  end if;
  insert into public.shop_names (name, tenant_id) values (new.slug, new.id);
  return null;
exception when unique_violation then
  raise exception 'slug_taken' using errcode = 'P0001';
end;
$$;
--> statement-breakpoint
create trigger tenants_name_recorded after insert on tenants for each row execute function app_tenant_name_recorded();
--> statement-breakpoint
-- tenants.slug may only become the shop's current name (the rename definers write shop_names first).
create or replace function app_tenant_slug_matches() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.shop_names n where n.tenant_id = new.id and n.name = new.slug and n.retired_at is null) then
    raise exception 'rename_through_definer' using errcode = 'P0001';
  end if;
  return null;
end;
$$;
--> statement-breakpoint
create trigger tenants_slug_matches after update of slug on tenants for each row execute function app_tenant_slug_matches();
--> statement-breakpoint
-- The first opening, set once (a close nulls published_at; renames still count from here: architecture M8).
create or replace function app_shop_first_opened() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  update public.tenants set first_opened_at = coalesce(first_opened_at, new.published_at) where id = new.tenant_id and first_opened_at is null;
  return null;
end;
$$;
--> statement-breakpoint
create trigger shop_settings_first_opened after insert or update of published_at on shop_settings
  for each row when (new.published_at is not null) execute function app_shop_first_opened();
--> statement-breakpoint
revoke all on function app_tenant_name_recorded(), app_tenant_slug_matches(), app_shop_first_opened() from public, anon, authenticated, service_role;
--> statement-breakpoint

-- ── Is a name free? "ok" or "taken" only: taken, retired and blocked all say taken (the list is never readable) ──
create or replace function app_name_check(p_name text) returns text
  language sql stable security definer set search_path = '' as $$
    select case when exists (select 1 from public.shop_names n where n.name = lower(p_name))
                  or exists (select 1 from public.blocked_names b where b.name = lower(p_name)) then 'taken' else 'ok' end
$$;
--> statement-breakpoint

-- ── The one rename, for the merchant (same signature as 0010, so live code keeps working) ──
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
    -- Never shared: nothing to keep.
    delete from public.shop_names where tenant_id = p_tenant and name = v_old;
  else
    if v_used >= 2 then raise exception 'no_renames_left' using errcode = 'P0001'; end if;
    update public.shop_names set retired_at = now() where tenant_id = p_tenant and name = v_old;
  end if;
  -- One of this shop's own old names comes back to life; a new one is recorded. A shop that lost the race for the
  -- same new name inserts nothing: "taken" (impact review D·1).
  insert into public.shop_names (name, tenant_id) values (p_slug, p_tenant)
    on conflict (name) do update set retired_at = null, created_at = now() where public.shop_names.tenant_id = p_tenant and not public.shop_names.retired_by_frrata;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'slug_taken' using errcode = 'P0001'; end if;
  update public.tenants set slug = p_slug, renames_used = renames_used + (case when v_opened is null then 0 else 1 end) where id = p_tenant;
  select u.email into v_email from auth.users u where u.id = p_uid;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    values (p_tenant, p_uid, v_email, 'member', 'shop.address_changed', p_slug, jsonb_build_object('from', v_old));
end;
$$;
--> statement-breakpoint

-- ── Frrata's rename (impersonation, trademark): no limit, the old name retired WITHOUT a redirect, a reason kept ──
create or replace function app_admin_rename_shop(p_tenant uuid, p_staff uuid, p_slug text, p_reason text)
  returns void
  language plpgsql volatile security definer set search_path = '' as $$
declare
  v_old text;
  v_email text;
begin
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then raise exception 'reason' using errcode = 'P0001'; end if;
  if p_slug !~ '^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])$' or p_slug ~ '--' then raise exception 'bad_slug' using errcode = 'P0001'; end if;
  select s.email into v_email from public.platform_staff s where s.user_id = p_staff;
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

-- ── What a name serves: facts only (architecture B4); the TS rule decides serve, redirect or nothing ──
create or replace function app_shop_for_name(p_name text)
  returns table (id uuid, name text, current_name text, retired boolean, retired_by_frrata boolean)
  language sql stable security definer set search_path = '' as $$
    select t.id, t.name, t.slug, n.retired_at is not null, n.retired_by_frrata
      from public.shop_names n join public.tenants t on t.id = n.tenant_id
     where n.name = lower(p_name)
$$;
--> statement-breakpoint
revoke all on function app_name_check(text), app_change_shop_address(uuid, uuid, text), app_admin_rename_shop(uuid, uuid, text, text), app_shop_for_name(text) from public, anon, authenticated, service_role;
--> statement-breakpoint
grant execute on function app_name_check(text), app_change_shop_address(uuid, uuid, text), app_shop_for_name(text) to frata_app;
--> statement-breakpoint
grant execute on function app_name_check(text), app_admin_rename_shop(uuid, uuid, text, text) to frata_admin;
