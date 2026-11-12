-- =============================================================================
-- DELIVERY ZONES (plan docs/plans/2026-11-12-delivery-zones.md; tables 0112). The shop's own rows for frata_app, both
-- ways on app_current_tenant(); no other role. Delivery Zones is in Growth and Scale (owner, 2026-11-12): as 0075 did
-- for GST, every Growth and Scale version lists it (more for the same price; Launch unchanged). On Launch it is an
-- add-on at ₹999/month (addon_prices v1).
-- =============================================================================
revoke all on delivery_zones, delivery_zone_pins, delivery_rules, shop_holidays from public, anon, authenticated, service_role, frata_admin;--> statement-breakpoint
alter table delivery_zones enable row level security;--> statement-breakpoint
alter table delivery_zone_pins enable row level security;--> statement-breakpoint
alter table delivery_rules enable row level security;--> statement-breakpoint
alter table shop_holidays enable row level security;--> statement-breakpoint
grant select, insert, update, delete on delivery_zones, delivery_zone_pins, delivery_rules, shop_holidays to frata_app;--> statement-breakpoint
create policy tenant_rows on delivery_zones for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());--> statement-breakpoint
create policy tenant_rows on delivery_zone_pins for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());--> statement-breakpoint
create policy tenant_rows on delivery_rules for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());--> statement-breakpoint
create policy tenant_rows on shop_holidays for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());--> statement-breakpoint
update plan_versions v set features = array_append(v.features, 'delivery_zones') from plans p
 where p.id = v.plan_id and p.code in ('growth', 'scale') and not ('delivery_zones' = any(v.features));--> statement-breakpoint
insert into addon_prices (module, version, monthly_price) values ('delivery_zones', 1, 99900) on conflict do nothing;
