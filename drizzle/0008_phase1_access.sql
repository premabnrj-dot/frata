-- =============================================================================
-- PHASE 1 ACCESS (docs/plans/2026-11-06-phase-1-first-sale.md). Hand-written.
-- Grants, RLS and policies for the 0007 tables; the review's fixes to existing
-- grants; and the self-serve shop creator. Every function: search_path '',
-- EXECUTE revoked from public/anon/authenticated, then one grant.
-- =============================================================================

-- ── Fixes to what exists (tenancy-auditor, architecture-reviewer, 2026-11-06)
-- The app edits a shop's name, nothing else on tenants; it never creates or
-- re-points a host (a freed address could be squatted). Shops are created by
-- app_create_shop or Admin; hosts by Admin.
revoke insert, update on tenants from frata_app;
--> statement-breakpoint
grant update (name) on tenants to frata_app;
--> statement-breakpoint
revoke insert, update, delete on tenant_domains from frata_app;
--> statement-breakpoint
create or replace function app_tenant_for_host(p_host text)
  returns table (id uuid, name text)
  language sql stable security definer set search_path = '' as $$
    select t.id, t.name from public.tenant_domains d join public.tenants t on t.id = d.tenant_id
    where d.host = lower(p_host)
$$;
--> statement-breakpoint
-- A platform address is <slug>.<shop domain>: the slug says which shop, so a
-- change of shop domain is an environment change, not a rewrite of every row.
create or replace function app_tenant_for_slug(p_slug text)
  returns table (id uuid, name text)
  language sql stable security definer set search_path = '' as $$
    select t.id, t.name from public.tenants t where t.slug = lower(p_slug)
$$;
--> statement-breakpoint
-- Sign-up asks "is this address free?" before a tenant exists. Answers yes/no, nothing else.
create or replace function app_slug_available(p_slug text)
  returns boolean
  language sql stable security definer set search_path = '' as $$
    select not exists (select 1 from public.tenants t where t.slug = lower(p_slug))
$$;
--> statement-breakpoint
revoke all on function app_tenant_for_host(text), app_tenant_for_slug(text), app_slug_available(text) from public, anon, authenticated;
--> statement-breakpoint
grant execute on function app_tenant_for_host(text), app_tenant_for_slug(text), app_slug_available(text) to frata_app;
--> statement-breakpoint

-- ── New tables: nothing for the API roles
revoke all on shop_settings, tenant_counters, pincodes, rate_limits from anon, authenticated;
--> statement-breakpoint
alter table shop_settings enable row level security;
--> statement-breakpoint
alter table tenant_counters enable row level security;
--> statement-breakpoint
alter table pincodes enable row level security;
--> statement-breakpoint
alter table rate_limits enable row level security;
--> statement-breakpoint
-- shop_settings: created by app_create_shop (or Admin); the app reads and edits its own.
grant select, update on shop_settings to frata_app;
--> statement-breakpoint
create policy tenant_rows on shop_settings for all to frata_app
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint
grant select, insert on shop_settings to frata_admin;
--> statement-breakpoint
create policy admin_read on shop_settings for select to frata_admin using (true);
--> statement-breakpoint
create policy admin_insert on shop_settings for insert to frata_admin with check (true);
--> statement-breakpoint
grant select, insert, update on tenant_counters to frata_app;
--> statement-breakpoint
create policy tenant_rows on tenant_counters for all to frata_app
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint
-- Reference data, the same for every shop; loaded by scripts/data/load-pincodes.mjs as the owner.
grant select on pincodes to frata_app;
--> statement-breakpoint
create policy reference_read on pincodes for select to frata_app using (true);
--> statement-breakpoint
-- Hashed keys only, no tenant data; written by src/lib/rate-limit.ts.
grant select, insert, update, delete on rate_limits to frata_app;
--> statement-breakpoint
create policy platform_rows on rate_limits for all to frata_app using (true) with check (true);
--> statement-breakpoint
-- Every shop made before Phase 1 gets its settings row.
-- (order_prefix stays '' = derived from the name by orderPrefix() in src/domains/signup/slug.ts)
insert into shop_settings (tenant_id) select id from tenants on conflict (tenant_id) do nothing;
--> statement-breakpoint

-- ── Self-serve shop creation. The caller passes the uid from getUser()
-- (requireUser); the function trusts nothing else about who is asking.
create or replace function app_create_shop(p_uid uuid, p_name text, p_slug text, p_pickup text, p_sells text[])
  returns uuid
  language plpgsql volatile security definer set search_path = '' as $$
declare
  v_email text;
  v_tenant uuid;
  v_version uuid;
  v_name text := btrim(p_name);
begin
  select u.email into v_email from auth.users u where u.id = p_uid and u.email_confirmed_at is not null;
  if v_email is null then raise exception 'email_unconfirmed' using errcode = 'P0001'; end if;
  -- One shop per person (Admin can add more). The lock makes two calls at once wait, so the count holds.
  perform pg_advisory_xact_lock(hashtext('create_shop:' || p_uid::text));
  if exists (select 1 from public.members m where m.user_id = p_uid and m.role = 'owner') then
    raise exception 'has_shop' using errcode = 'P0001';
  end if;
  if v_name = '' or length(v_name) > 60 then raise exception 'bad_name' using errcode = 'P0001'; end if;
  if p_slug !~ '^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])$' or p_slug ~ '--' then raise exception 'bad_slug' using errcode = 'P0001'; end if;
  if p_pickup !~ '^[1-9][0-9]{5}$' then raise exception 'bad_pincode' using errcode = 'P0001'; end if;
  if exists (select 1 from public.tenants t where t.slug = p_slug) then raise exception 'slug_taken' using errcode = 'P0001'; end if;
  select pv.id into v_version from public.plan_versions pv join public.plans p on p.id = pv.plan_id
    where p.code = 'launch' order by pv.version desc limit 1;
  if v_version is null then raise exception 'no_launch_plan' using errcode = 'P0001'; end if;

  insert into public.tenants (slug, name) values (p_slug, v_name) returning id into v_tenant;
  insert into public.members (tenant_id, user_id, role) values (v_tenant, p_uid, 'owner');
  insert into public.shop_settings (tenant_id, pickup_pincode, sells, support_email)
    values (v_tenant, p_pickup, coalesce(p_sells, '{}'), v_email);
  insert into public.tenant_plans (tenant_id, plan_version_id, starts_at, created_by)
    values (v_tenant, v_version, now(), p_uid);
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    values (v_tenant, p_uid, v_email, 'member', 'shop.created', p_slug, jsonb_build_object('pickup', p_pickup, 'sells', p_sells));
  return v_tenant;
end;
$$;
--> statement-breakpoint
revoke all on function app_create_shop(uuid, text, text, text, text[]) from public, anon, authenticated;
--> statement-breakpoint
grant execute on function app_create_shop(uuid, text, text, text, text[]) to frata_app;
