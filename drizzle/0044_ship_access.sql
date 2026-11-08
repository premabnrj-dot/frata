-- =============================================================================
-- SHIP S·0 ACCESS (docs/specs/2026-11-08-ship.md, plan docs/plans/2026-11-08-ship.md). Hand-written.
--
-- shipments: the shop's own rows only (frata_app under RLS); never deleted by the app (an order's cascade removes
-- them); updated only to end one or correct the courier name and tracking number, never moved to another order.
-- frata_admin and the API roles: nothing.
-- orders.forward_shipping: nothing ever wrote it, so every 0 meant "not known": it becomes null (0043 dropped the
-- default), so freight.ts uses the shop's estimate rather than treating unknown freight as free.
-- =============================================================================
revoke all on shipments from anon, authenticated, service_role;
--> statement-breakpoint
alter table shipments enable row level security;
--> statement-breakpoint
grant select, insert on shipments to frata_app;
--> statement-breakpoint
grant update (courier_name, tracking_number, ended_at, ended_reason) on shipments to frata_app;
--> statement-breakpoint
create policy tenant_rows on shipments for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint
update orders set forward_shipping = null where forward_shipping = 0;
