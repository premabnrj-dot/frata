-- V3b K2 (docs/plans/2026-11-24-v3b-first.md; mockup docs/mockups/2026-11-24-v3b-first.html § 1, approved 2026-11-24):
-- Admin › Money › Dollar rate lists the last days' typed rates. fx_rates is definer-only; this reads the newest rows and
-- nothing else, for frata_admin alone (who typed each comes from Activity's own rows, audit_events 'credits.rate.set').
create or replace function admin_fx_rates_recent(p_limit integer) returns table (day date, rate_e4 integer, set_at timestamptz)
  language sql stable security definer set search_path = '' as $$
  select r.day, r.rate_e4, r.fetched_at from public.fx_rates r order by r.day desc limit least(greatest(coalesce(p_limit, 7), 1), 31)
$$;
--> statement-breakpoint
revoke all on function admin_fx_rates_recent(integer) from public, anon, authenticated, service_role, frata_app, frata_builder;
--> statement-breakpoint
grant execute on function admin_fx_rates_recent(integer) to frata_admin;
