-- apply: after-live
-- O1 sign-up (plan docs/plans/2026-11-23-o1-signup.md O1·11), CONTRACT: the definers the old build called are dropped.
-- Apply ONLY after the build that calls app_create_shop_v3 and app_partner_create_shop_v2 (0178) is live and the old
-- deployment's functions have run out (plan § Deploy order); O2's 0180 never reaches production before this file's
-- journal row. A rollback to a pre-O1 build after this needs both old functions re-created WITH their revoke/grant
-- (docs/setup.md § Sign-up definers).
drop function app_create_shop(uuid, text, text, text, text[]);
--> statement-breakpoint
drop function app_create_shop_v2(uuid, text, text, text, text[], text, text, smallint, uuid);
--> statement-breakpoint
drop function app_partner_create_shop(uuid, uuid, text, text, text, text, integer, integer, integer, integer);
