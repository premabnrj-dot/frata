-- =============================================================================
-- TENANT ISOLATION (ADR-0002). Hand-written; drizzle-kit does not generate RLS.
--
-- The app logs in as `frata_app`: NOT the table owner and NOBYPASSRLS, so every
-- policy below applies to it. Migrations run as `postgres`, the owner, which RLS
-- (enabled, not forced) does not restrict — that is what lets the two SECURITY
-- DEFINER lookups at the bottom answer before a tenant is known.
--
-- The role is created WITHOUT a password. Set one out of band, never in git:
--   alter role frata_app with password '…';
-- and connect through the pooler as  frata_app.<project-ref>.
--
-- Supabase's API roles (anon, authenticated) get nothing on any of these
-- tables: nothing here is read through PostgREST. Every new table repeats the
-- grant, revoke, enable and policy lines (frata-architecture § database).
-- =============================================================================

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'frata_app') then
    create role frata_app login noinherit nobypassrls;
  end if;
end $$;
--> statement-breakpoint
grant usage on schema public to frata_app;
--> statement-breakpoint
grant select, insert, update, delete on tenants, tenant_domains, members, orders, outbox, webhook_events to frata_app;
--> statement-breakpoint
revoke all on tenants, tenant_domains, members, orders, outbox, webhook_events from anon, authenticated;
--> statement-breakpoint
alter default privileges in schema public revoke all on tables from anon, authenticated;
--> statement-breakpoint
alter default privileges in schema public revoke all on functions from anon, authenticated;
--> statement-breakpoint

-- The tenant a transaction belongs to, set by src/lib/db/tenant.ts with
-- set_config(…, true). Unset → null → every tenant policy matches nothing.
create or replace function app_current_tenant() returns uuid
  language sql stable as $$ select nullif(current_setting('app.tenant_id', true), '')::uuid $$;
--> statement-breakpoint

alter table tenants enable row level security;
--> statement-breakpoint
alter table tenant_domains enable row level security;
--> statement-breakpoint
alter table members enable row level security;
--> statement-breakpoint
alter table orders enable row level security;
--> statement-breakpoint
alter table outbox enable row level security;
--> statement-breakpoint
alter table webhook_events enable row level security;
--> statement-breakpoint

create policy tenant_self on tenants for all to frata_app
  using (id = app_current_tenant()) with check (id = app_current_tenant());
--> statement-breakpoint
create policy tenant_rows on tenant_domains for all to frata_app
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint
create policy tenant_rows on members for all to frata_app
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint
create policy tenant_rows on orders for all to frata_app
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint

-- The outbox is written inside a tenant's transaction and swept across tenants
-- by the cron: insert only for the current tenant, read and update by the sweep.
create policy outbox_insert on outbox for insert to frata_app
  with check (tenant_id = app_current_tenant());
--> statement-breakpoint
create policy outbox_sweep_read on outbox for select to frata_app using (true);
--> statement-breakpoint
create policy outbox_sweep_update on outbox for update to frata_app using (true) with check (true);
--> statement-breakpoint

-- Webhooks arrive before a tenant is known. Platform scope, written by the
-- signed webhook routes only (scripts/check-tenant.mjs).
create policy webhook_platform on webhook_events for all to frata_app using (true) with check (true);
--> statement-breakpoint

-- ── The two questions asked before a tenant is known (src/lib/db/platform.ts) ──
create or replace function app_tenant_for_host(p_host text)
  returns table (id uuid, name text)
  language sql stable security definer set search_path = public as $$
    select t.id, t.name from tenant_domains d join tenants t on t.id = d.tenant_id
    where d.host = lower(p_host)
$$;
--> statement-breakpoint
create or replace function app_memberships_for(p_user uuid)
  returns table (tenant_id uuid, tenant_name text, role text)
  language sql stable security definer set search_path = public as $$
    select m.tenant_id, t.name, m.role from members m join tenants t on t.id = m.tenant_id
    where m.user_id = p_user order by m.created_at
$$;
--> statement-breakpoint
revoke all on function app_tenant_for_host(text), app_memberships_for(uuid), app_current_tenant() from public;
--> statement-breakpoint
grant execute on function app_tenant_for_host(text), app_memberships_for(uuid), app_current_tenant() to frata_app;
