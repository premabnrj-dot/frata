-- =============================================================================
-- ADMIN ACCESS (ADR-0007). Hand-written. The whole reach of frata_admin is in
-- this file; frata_app loses member writes and tenant deletes. Every function
-- here: search_path '', EXECUTE revoked from public/anon/authenticated, then one
-- grant (Postgres gives PUBLIC EXECUTE by default; Supabase exposes RPC).
-- frata_admin is created WITHOUT a password — set one out of band:
--   alter role frata_admin with password '<hex>';   (openssl rand -hex 24)
-- =============================================================================
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'frata_admin') then
    create role frata_admin login noinherit nobypassrls;
  end if;
end $$;
--> statement-breakpoint
alter role frata_admin set statement_timeout = '20s';
--> statement-breakpoint
alter role frata_admin set lock_timeout = '10s';
--> statement-breakpoint
alter role frata_admin set idle_in_transaction_session_timeout = '30s';
--> statement-breakpoint
grant usage on schema public to frata_admin;
--> statement-breakpoint
-- ── frata_app narrows: members are written only by app_claim_invites; tenants are never deleted by the app.
revoke insert, update, delete on members from frata_app;
--> statement-breakpoint
revoke delete on tenants from frata_app;
--> statement-breakpoint
revoke all on platform_staff, invites, support_sessions, audit_events, plans, plan_versions, tenant_plans from anon, authenticated;
--> statement-breakpoint
alter table platform_staff enable row level security;
--> statement-breakpoint
alter table invites enable row level security;
--> statement-breakpoint
alter table support_sessions enable row level security;
--> statement-breakpoint
alter table audit_events enable row level security;
--> statement-breakpoint
alter table plans enable row level security;
--> statement-breakpoint
alter table plan_versions enable row level security;
--> statement-breakpoint
alter table tenant_plans enable row level security;
--> statement-breakpoint
-- ── frata_app on the new tables
grant select on support_sessions, plans, plan_versions, tenant_plans to frata_app;
--> statement-breakpoint
grant select, insert on audit_events to frata_app;
--> statement-breakpoint
create policy tenant_read on support_sessions for select to frata_app using (tenant_id = app_current_tenant());
--> statement-breakpoint
create policy tenant_read on tenant_plans for select to frata_app using (tenant_id = app_current_tenant());
--> statement-breakpoint
create policy tenant_read on audit_events for select to frata_app using (tenant_id = app_current_tenant());
--> statement-breakpoint
create policy tenant_insert on audit_events for insert to frata_app with check (tenant_id = app_current_tenant());
--> statement-breakpoint
create policy catalogue_read on plans for select to frata_app, frata_admin using (true);
--> statement-breakpoint
create policy catalogue_read on plan_versions for select to frata_app, frata_admin using (true);
--> statement-breakpoint
-- ── frata_admin: exactly this, nothing else
grant select, insert, update on tenants to frata_admin;
--> statement-breakpoint
create policy admin_read on tenants for select to frata_admin using (true);
--> statement-breakpoint
create policy admin_insert on tenants for insert to frata_admin with check (true);
--> statement-breakpoint
create policy admin_update on tenants for update to frata_admin using (true) with check (true);
--> statement-breakpoint
grant select, insert on tenant_domains to frata_admin;
--> statement-breakpoint
create policy admin_read on tenant_domains for select to frata_admin using (true);
--> statement-breakpoint
create policy admin_insert on tenant_domains for insert to frata_admin with check (true);
--> statement-breakpoint
grant select on members to frata_admin;
--> statement-breakpoint
create policy admin_read on members for select to frata_admin using (true);
--> statement-breakpoint
grant select, insert, delete on platform_staff to frata_admin;
--> statement-breakpoint
create policy admin_all on platform_staff for all to frata_admin using (true) with check (true);
--> statement-breakpoint
grant select, insert on invites to frata_admin;
--> statement-breakpoint
grant update (revoked_at) on invites to frata_admin;
--> statement-breakpoint
create policy admin_all on invites for all to frata_admin using (true) with check (true);
--> statement-breakpoint
grant select, insert on support_sessions to frata_admin;
--> statement-breakpoint
grant update (ended_at) on support_sessions to frata_admin;
--> statement-breakpoint
create policy admin_all on support_sessions for all to frata_admin using (true) with check (true);
--> statement-breakpoint
grant select, insert on audit_events to frata_admin;
--> statement-breakpoint
create policy admin_read on audit_events for select to frata_admin using (true);
--> statement-breakpoint
create policy admin_insert on audit_events for insert to frata_admin with check (true);
--> statement-breakpoint
grant select on plans to frata_admin;
--> statement-breakpoint
grant select, insert on plan_versions to frata_admin;
--> statement-breakpoint
create policy admin_insert on plan_versions for insert to frata_admin with check (true);
--> statement-breakpoint
grant select, insert on tenant_plans to frata_admin;
--> statement-breakpoint
create policy admin_read on tenant_plans for select to frata_admin using (true);
--> statement-breakpoint
create policy admin_insert on tenant_plans for insert to frata_admin with check (true);
--> statement-breakpoint
-- ── Functions. app_memberships_for is replaced by app_access_for (one round trip: staff role + stores).
drop function if exists app_memberships_for(uuid);
--> statement-breakpoint
create or replace function app_access_for(p_user uuid) returns jsonb
  language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'staffRole', (select ps.role from public.platform_staff ps where ps.user_id = p_user),
    'memberships', coalesce((
      select jsonb_agg(d.x order by d.name)
      from (
        select distinct on (u.tenant_id) u.tenant_id, u.tenant_name as name,
          jsonb_build_object('tenantId', u.tenant_id, 'tenantName', u.tenant_name,
                             'role', u.role, 'supportSessionId', u.support_session_id) as x
        from (
          select s.tenant_id, t.name as tenant_name, 'owner'::text as role, s.id as support_session_id, 0 as pref
            from public.support_sessions s
            join public.tenants t on t.id = s.tenant_id
            join public.platform_staff ps on ps.user_id = s.staff_user_id
           where s.staff_user_id = p_user and s.ended_at is null and s.expires_at > now()
          union all
          select m.tenant_id, t.name, m.role, null::uuid, 1
            from public.members m join public.tenants t on t.id = m.tenant_id
           where m.user_id = p_user
        ) u
        order by u.tenant_id, u.pref
      ) d), '[]'::jsonb))
$$;
--> statement-breakpoint
create or replace function app_claim_invites(p_user uuid) returns integer
  language plpgsql security definer set search_path = '' as $$
declare v_email text; n integer;
begin
  select lower(u.email) into v_email from auth.users u
   where u.id = p_user and u.email_confirmed_at is not null;
  if v_email is null then return 0; end if;
  with claimed as (
    update public.invites i set accepted_at = now()
     where i.email = v_email and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
    returning i.tenant_id, i.role)
  insert into public.members (tenant_id, user_id, role)
  select c.tenant_id, p_user, c.role from claimed c
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
--> statement-breakpoint
create or replace function app_user_directory(p_ids uuid[]) returns table (id uuid, email text, last_sign_in_at timestamptz)
  language sql stable security definer set search_path = '' as $$
  select u.id, u.email::text, u.last_sign_in_at from auth.users u where u.id = any(p_ids)
$$;
--> statement-breakpoint
create or replace function app_find_confirmed_user(p_email text) returns uuid
  language sql stable security definer set search_path = '' as $$
  select u.id from auth.users u
   where lower(u.email) = lower(p_email) and u.email_confirmed_at is not null limit 1
$$;
--> statement-breakpoint
create or replace function app_admin_order_counts(p_since timestamptz) returns table (tenant_id uuid, n bigint)
  language sql stable security definer set search_path = '' as $$
  select o.tenant_id, count(*) from public.orders o where o.placed_at >= p_since group by o.tenant_id
$$;
--> statement-breakpoint
revoke all on function app_access_for(uuid), app_claim_invites(uuid), app_user_directory(uuid[]), app_find_confirmed_user(text), app_admin_order_counts(timestamptz), app_tenant_for_host(text), app_current_tenant() from public, anon, authenticated;
--> statement-breakpoint
grant execute on function app_access_for(uuid), app_claim_invites(uuid), app_tenant_for_host(text), app_current_tenant() to frata_app;
--> statement-breakpoint
grant execute on function app_user_directory(uuid[]), app_find_confirmed_user(text), app_admin_order_counts(timestamptz), app_current_tenant() to frata_admin;
--> statement-breakpoint
-- ── Seed: the decided plans (owner, 2026-11-06). Version 1 of each.
insert into plans (code, name, position) values ('launch', 'Launch', 1), ('growth', 'Growth', 2), ('scale', 'Scale', 3);
--> statement-breakpoint
insert into plan_versions (plan_id, version, monthly_price, included_orders, fee_bps, features)
select p.id, 1, v.price, v.included, v.bps, v.features
from plans p join (values
  ('launch', 149900::bigint, 150, 200, '{}'::text[]),
  ('growth', 499900::bigint, 1500, 100, '{rto_shield,size_fit,cart_flows}'::text[]),
  ('scale', 1499900::bigint, 5000, 50, '{rto_shield,size_fit,cart_flows}'::text[])
) as v(code, price, included, bps, features) on v.code = p.code;
--> statement-breakpoint
update tenants set is_internal = true where slug = 'demo';
--> statement-breakpoint
-- Every existing store starts on Launch v1 from the day it was created. The nil
-- uuid marks a row written by a migration, not a person.
insert into tenant_plans (tenant_id, plan_version_id, starts_at, created_by)
select t.id, pv.id, t.created_at, '00000000-0000-0000-0000-000000000000'
from tenants t
cross join plan_versions pv join plans p on p.id = pv.plan_id
where p.code = 'launch' and pv.version = 1
  and not exists (select 1 from tenant_plans tp where tp.tenant_id = t.id);
