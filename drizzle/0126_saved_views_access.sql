-- =============================================================================
-- NEEL N1c — SAVED VIEWS, ACCESS (docs/plans/2026-11-13-neel-n1c.md § N1c·2). Hand-written.
--
-- saved_views: the shop's own views of the Orders list, kept as tabs for its whole team. frata_app reads and adds its
--   own (Remove is removed_at, with Undo: nothing is deleted), and changes only a view's name, its updated_at and removed_at (Remove with Undo); its shop, tab,
--   filters and who saved it never change. frata_admin: none. anon, authenticated, service_role: none.
-- =============================================================================
revoke all on saved_views from anon, authenticated, service_role;
--> statement-breakpoint
alter table saved_views enable row level security;
--> statement-breakpoint
create policy tenant_rows on saved_views for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint
grant select, insert on saved_views to frata_app;
--> statement-breakpoint
grant update (name, updated_at, removed_at) on saved_views to frata_app;
