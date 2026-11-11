-- =============================================================================
-- ADMIN › INFRASTRUCTURE, the Supabase tab (docs/plans/2026-11-11-guardrails-infra-a2.md I·0; tenancy and security
-- reviews 2026-11-11). Hand-written. One definer returns the database's health as AGGREGATES only (ADR-0007 amendment,
-- recorded in the plan):
--   - size, connection limit, cache hit share;
--   - connections counted by role and state (never query, client_addr or application_name);
--   - outbox and webhook backlogs as counts and ages (never a row);
--   - the biggest tables (name, rows, bytes);
--   - the slowest query SHAPES of frata_app and frata_admin only: top-level select/insert/update/delete/with, with quoted
--     strings and numbers stripped before an 80-character cut, so no shopper literal or password reaches staff.
-- Owned by the migration role (postgres, which holds pg_read_all_stats on Supabase); EXECUTE to frata_admin only.
-- pg_stat_statements is read only if installed (Supabase: schema extensions); elsewhere the list is empty.
-- =============================================================================
create or replace function admin_db_health() returns jsonb
language plpgsql security definer set search_path = '' stable as $$
declare
  pss regclass := coalesce(to_regclass('extensions.pg_stat_statements'), to_regclass('public.pg_stat_statements'));
  shapes jsonb := '[]'::jsonb;
begin
  if pss is not null then
    execute format($q$
      select coalesce(jsonb_agg(s order by s.total_ms desc), '[]'::jsonb) from (
        select left(regexp_replace(regexp_replace(regexp_replace(p.query, '''(?:[^'']|'''')*''', '?', 'g'), '\m\d+(\.\d+)?\M', '?', 'g'), '\s+', ' ', 'g'), 80) as shape,
               p.calls::bigint as calls, round(p.mean_exec_time::numeric, 2) as mean_ms, round(p.total_exec_time::numeric) as total_ms
        from %s p
        join pg_catalog.pg_roles r on r.oid = p.userid
        where r.rolname in ('frata_app', 'frata_admin') and p.toplevel
          and p.dbid = (select oid from pg_catalog.pg_database where datname = pg_catalog.current_database())
          and p.query ~* '^\s*(select|insert|update|delete|with)\M'
        order by p.total_exec_time desc limit 5) s
    $q$, pss) into shapes;
  end if;
  return jsonb_build_object(
    'db_bytes', pg_catalog.pg_database_size(pg_catalog.current_database()),
    'max_connections', pg_catalog.current_setting('max_connections')::int,
    'cache_hit', (select round(100.0 * sum(blks_hit) / nullif(sum(blks_hit) + sum(blks_read), 0), 2) from pg_catalog.pg_stat_database where datname = pg_catalog.current_database()),
    'connections', (select coalesce(jsonb_agg(c), '[]'::jsonb) from (
        select case when a.usename in ('frata_app', 'frata_admin') then a.usename else 'other' end as role,
               count(*)::int as open, count(*) filter (where a.state = 'active')::int as busy
        from pg_catalog.pg_stat_activity a where a.datname = pg_catalog.current_database() and a.backend_type = 'client backend'
        group by 1 order by 1) c),
    'outbox_waiting', (select count(*)::int from public.outbox where sent_at is null and dead_at is null),
    'outbox_oldest_s', (select extract(epoch from now() - min(created_at))::int from public.outbox where sent_at is null and dead_at is null),
    'outbox_dead_today', (select count(*)::int from public.outbox where dead_at >= date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata'),
    'webhooks_waiting', (select count(*)::int from public.webhook_events where processed_at is null),
    'tables', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select c.relname as name, greatest(c.reltuples, 0)::bigint as rows, pg_catalog.pg_total_relation_size(c.oid) as bytes
        from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p') order by 3 desc limit 5) t),
    'queries', shapes);
end $$;
--> statement-breakpoint
revoke execute on function admin_db_health() from public, anon, authenticated, service_role, frata_app;
--> statement-breakpoint
grant execute on function admin_db_health() to frata_admin;
