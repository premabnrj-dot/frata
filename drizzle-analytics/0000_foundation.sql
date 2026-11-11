-- =============================================================================
-- THE ANALYTICS DATABASE'S FOUNDATION (A·2; plan docs/plans/2026-11-11-guardrails-infra-a2.md A2·1). Its own Postgres
-- (the frata-analytics Supabase project in Mumbai, Data API off); the same two locks as the main database (ADR-0002):
-- row policies keyed by app_current_tenant(), and withAnalyticsTenant() in code (src/lib/db/analytics.ts).
--
-- The app logs in as frata_app (and Admin, later, as frata_admin): never postgres, which bypasses the policies.
-- Their settings here are set IN THIS DATABASE (alter role … in database): on a throwaway Postgres both databases share
-- one set of roles, and the main database's 20 s statement timeout must not change (tenancy review, 2026-11-11).
-- Passwords are set by the owner after this runs, as for the main database (docs/setup.md).
-- =============================================================================
-- NOT THE MAIN DATABASE. Both Supabase databases are called `postgres`; run here by mistake, the limits below would
-- give the whole app a 2 s statement timeout (impact review 2026-11-11). This refuses before anything changes.
do $$ begin
  if to_regclass('public.tenants') is not null or to_regclass('public.orders') is not null then
    raise exception 'drizzle-analytics: this is the main Frrata database, not the analytics one — nothing was applied';
  end if;
end $$;
--> statement-breakpoint
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'frata_app') then create role frata_app login noinherit nobypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'frata_admin') then create role frata_admin login noinherit nobypassrls; end if;
end $$;
--> statement-breakpoint
-- The ingest is the cheapest request we have (speed review MED 7): a stalled analytics database costs a shopper's
-- beacon 2 s at most, never a held connection; an event lost to a crash is acceptable, so commits don't wait for disk.
do $$ begin
  execute format('alter role frata_app in database %I set statement_timeout = %L', current_database(), '2s');
  execute format('alter role frata_app in database %I set lock_timeout = %L', current_database(), '1s');
  execute format('alter role frata_app in database %I set idle_in_transaction_session_timeout = %L', current_database(), '5s');
  execute format('alter role frata_app in database %I set synchronous_commit = %L', current_database(), 'off');
  execute format('alter role frata_admin in database %I set statement_timeout = %L', current_database(), '10s');
  execute format('alter role frata_admin in database %I set lock_timeout = %L', current_database(), '1s');
  execute format('alter role frata_admin in database %I set idle_in_transaction_session_timeout = %L', current_database(), '10s');
end $$;
--> statement-breakpoint
grant usage on schema public to frata_app, frata_admin;
--> statement-breakpoint
-- Unlike Supabase's defaults: nothing new in public reaches the API roles (service_role included: it bypasses RLS, and
-- this database has no use for it), and no new function is callable by everyone.
alter default privileges in schema public revoke all on tables from anon, authenticated, service_role;
--> statement-breakpoint
alter default privileges in schema public revoke all on functions from anon, authenticated, service_role;
--> statement-breakpoint
alter default privileges revoke execute on functions from public;
--> statement-breakpoint
create or replace function app_current_tenant() returns uuid
  language sql stable as $$ select nullif(current_setting('app.tenant_id', true), '')::uuid $$;
--> statement-breakpoint
-- Functions are no one's by default here (above), so the policies' one function is granted by name.
revoke all on function app_current_tenant() from public, anon, authenticated, service_role;
--> statement-breakpoint
grant execute on function app_current_tenant() to frata_app, frata_admin;
--> statement-breakpoint
-- Supabase keeps pgcrypto in `extensions`; a plain Postgres gets the same, so definers can name it there.
create schema if not exists extensions;
--> statement-breakpoint
create extension if not exists pgcrypto with schema extensions;
--> statement-breakpoint
-- The raw events' daily partitions live here: no role but the owner has USAGE, so a partition can never be read
-- around the parent's policy (a query on a partition skips the parent's RLS).
create schema if not exists ev;
--> statement-breakpoint
revoke all on schema ev from public;
