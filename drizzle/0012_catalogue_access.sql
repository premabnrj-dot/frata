-- =============================================================================
-- 1A CATALOGUE ACCESS (docs/plans/2026-11-06-phase-1-first-sale.md). Hand-written.
-- frata_app: its own shop's rows only. frata_admin: deliberately NO grant — staff
-- see a shop's catalogue through a support visit, inside that shop's console.
-- variants.unit_cost is the merchant's cost: storefront code never selects it
-- (check:tenant), and no browser chunk may carry it (check:client-bundle).
-- =============================================================================
revoke all on product_types, products, variants, product_images from anon, authenticated;
--> statement-breakpoint
alter table product_types enable row level security;
--> statement-breakpoint
alter table products enable row level security;
--> statement-breakpoint
alter table variants enable row level security;
--> statement-breakpoint
alter table product_images enable row level security;
--> statement-breakpoint
grant select, insert, update, delete on product_types, products, variants, product_images to frata_app;
--> statement-breakpoint
create policy tenant_rows on product_types for all to frata_app
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint
create policy tenant_rows on products for all to frata_app
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint
create policy tenant_rows on variants for all to frata_app
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint
create policy tenant_rows on product_images for all to frata_app
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
