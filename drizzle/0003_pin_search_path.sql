-- Supabase security advisor 0011 (function_search_path_mutable), 2026-11-06:
-- app_current_tenant() is read by every tenant policy, so nothing on a
-- caller's search_path may shadow what it calls. Empty search_path: the
-- built-ins it uses (current_setting, nullif, uuid) always resolve from pg_catalog.
alter function public.app_current_tenant() set search_path = '';
