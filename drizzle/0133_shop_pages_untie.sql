-- =============================================================================
-- V1 CONTENT — PAGES SAVE LIVE: THE TIE TO THE LOOK'S PUBLISH IS CUT (plan docs/plans/2026-11-15-v1-content.md § The
-- move; speed review H2c, tenancy-auditor H2). Hand-written. Its own migration, after the move commits, so the lock it
-- takes on shop_theme_publishes (dropping the foreign key) is short and gives up rather than queue shop reads.
-- `live_publish_id` stays, unused and no longer writable by frata_app (without the key nothing would stop a page naming
-- another store's publish; tenancy.sql block 70); a later migration drops it with app_move_content.
-- =============================================================================
set local lock_timeout = '2s';
--> statement-breakpoint
alter table shop_pages drop constraint shop_pages_live_publish;
--> statement-breakpoint
revoke update (live_publish_id) on shop_pages from frata_app;
