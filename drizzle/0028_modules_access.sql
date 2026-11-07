-- =============================================================================
-- MODULES ACCESS (docs/specs/2026-11-07-modules-foundation.md; tenancy review in docs/plans/2026-11-07-m2.md).
-- Hand-written.
--
-- tenant_modules: the merchant's switch. frata_app reads and writes its OWN shop's rows (insert a switch-on,
--   close it by setting disabled_*); never deletes. frata_admin reads.
-- tenant_addons: granted by Frata. frata_app READS its own shop's; frata_admin inserts and may only set
--   ends_at (end a trial or an add-on early). Nobody deletes.
-- addon_prices, module_pauses: platform tables. frata_app reads every row (like plans' catalogue_read);
--   frata_admin writes (a price is a new version; a pause is closed by resumed_*).
-- service_role too: Supabase grants it every new object by default; Frata never uses that key.
-- =============================================================================
revoke all on tenant_modules, tenant_addons, addon_prices, module_pauses from anon, authenticated, service_role;
--> statement-breakpoint
alter table tenant_modules enable row level security;
--> statement-breakpoint
alter table tenant_addons enable row level security;
--> statement-breakpoint
alter table addon_prices enable row level security;
--> statement-breakpoint
alter table module_pauses enable row level security;
--> statement-breakpoint
grant select, insert on tenant_modules to frata_app;
--> statement-breakpoint
grant update (disabled_at, disabled_by) on tenant_modules to frata_app;
--> statement-breakpoint
create policy tenant_rows on tenant_modules for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint
grant select on tenant_addons to frata_app;
--> statement-breakpoint
create policy tenant_read on tenant_addons for select to frata_app using (tenant_id = app_current_tenant());
--> statement-breakpoint
grant select on addon_prices, module_pauses to frata_app;
--> statement-breakpoint
create policy catalogue_read on addon_prices for select to frata_app, frata_admin using (true);
--> statement-breakpoint
create policy catalogue_read on module_pauses for select to frata_app, frata_admin using (true);
--> statement-breakpoint
grant select on tenant_modules to frata_admin;
--> statement-breakpoint
create policy admin_read on tenant_modules for select to frata_admin using (true);
--> statement-breakpoint
grant select, insert on tenant_addons to frata_admin;
--> statement-breakpoint
grant update (ends_at) on tenant_addons to frata_admin;
--> statement-breakpoint
create policy admin_all on tenant_addons for all to frata_admin using (true) with check (true);
--> statement-breakpoint
grant insert on addon_prices to frata_admin;
--> statement-breakpoint
create policy admin_insert on addon_prices for insert to frata_admin with check (true);
--> statement-breakpoint
grant insert on module_pauses to frata_admin;
--> statement-breakpoint
grant update (resumed_at, resumed_by) on module_pauses to frata_admin;
--> statement-breakpoint
create policy admin_write on module_pauses for insert to frata_admin with check (true);
--> statement-breakpoint
create policy admin_resume on module_pauses for update to frata_admin using (true) with check (true);
--> statement-breakpoint
-- Version 1 of each add-on's price (owner, 2026-11-07: tiers plus add-ons, prices as recommended).
insert into addon_prices (module, version, monthly_price) values ('reviews', 1, 49900), ('true_profit', 1, 99900), ('marketplace_export', 1, 149900);
