-- =============================================================================
-- ADMIN › INFRASTRUCTURE's platform tables (plan docs/plans/2026-11-11-guardrails-infra-a2.md I·0; tenancy review
-- 2026-11-11). Hand-written. No tenant data: what vendors billed Frrata and each pull's outcome. frata_admin reads and
-- writes them (the hourly cron through src/lib/admin/infra.ts, fenced by check:tenant); frata_app and the API roles
-- hold nothing, so a shop's code path can never read or forge Frrata's costs.
-- =============================================================================
revoke all on infra_usage_daily, infra_pulls from public, anon, authenticated, service_role, frata_app;
--> statement-breakpoint
alter table infra_usage_daily enable row level security;
--> statement-breakpoint
alter table infra_pulls enable row level security;
--> statement-breakpoint
grant select, insert, update on infra_usage_daily to frata_admin;
--> statement-breakpoint
grant select, insert, delete on infra_pulls to frata_admin;
--> statement-breakpoint
create policy admin_infra on infra_usage_daily for all to frata_admin using (true) with check (true);
--> statement-breakpoint
create policy admin_infra on infra_pulls for all to frata_admin using (true) with check (true);
