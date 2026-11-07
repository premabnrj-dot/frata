-- =============================================================================
-- WEBHOOK AND OUTBOX WRITES STAY IN THEIR SHOP (tenancy audit of 1C, 2026-11-07).
-- Inside shop A's transaction, frata_app could insert an event for shop B or
-- move a row's tenant_id to B (with check (true)). Now: with no tenant set
-- (the signed webhook receiver, the cron sweep) anything; with one set, only it.
-- =============================================================================
alter policy webhook_insert on webhook_events with check (app_current_tenant() is null or tenant_id = app_current_tenant());
--> statement-breakpoint
alter policy webhook_update on webhook_events with check (app_current_tenant() is null or tenant_id = app_current_tenant());
--> statement-breakpoint
alter policy outbox_sweep_update on outbox with check (app_current_tenant() is null or tenant_id = app_current_tenant());
