-- 1D·7: the 0019 backfill has done its work. It was re-run on production after the push (2026-11-07:
-- 0 lines, 0 orders, none flagged) and is no longer needed: a function nothing calls is a function to audit.
drop function if exists public.app_backfill_0019();
