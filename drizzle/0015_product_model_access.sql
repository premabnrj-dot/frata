-- =============================================================================
-- PRODUCT MODEL ACCESS (docs/specs/2026-11-06-product-model.md). Hand-written.
-- frata_app: its own shop's rows only. frata_admin: deliberately NO grant.
-- =============================================================================
revoke all on product_handle_history, product_colours, product_attributes, collections, collection_products from anon, authenticated;
--> statement-breakpoint
alter table product_handle_history enable row level security;
--> statement-breakpoint
alter table product_colours enable row level security;
--> statement-breakpoint
alter table product_attributes enable row level security;
--> statement-breakpoint
alter table collections enable row level security;
--> statement-breakpoint
alter table collection_products enable row level security;
--> statement-breakpoint
grant select, insert, update, delete on product_colours, product_attributes, collections, collection_products to frata_app;
--> statement-breakpoint
-- History is append-only for the app: an old address must never be pointed somewhere else.
grant select, insert on product_handle_history to frata_app;
--> statement-breakpoint
create policy tenant_rows on product_handle_history for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint
create policy tenant_rows on product_colours for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint
create policy tenant_rows on product_attributes for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint
create policy tenant_rows on collections for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint
create policy tenant_rows on collection_products for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint
-- Products that were already showing keep showing: published_at now means "first went live".
update products set status = 'active' where published_at is not null and status = 'draft';
