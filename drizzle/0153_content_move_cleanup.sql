-- The storefront reads shop_pages: wait at most 2 s for the lock (as 0136), else fail and retry.
set local lock_timeout = '2s';--> statement-breakpoint
ALTER TABLE "shop_pages" DROP COLUMN "live_publish_id";--> statement-breakpoint
-- The content move (0135) is done: run in production 2026-11-15, 2026-11-15 and 2026-11-16 (nothing left to move).
drop function if exists public.app_move_content();
