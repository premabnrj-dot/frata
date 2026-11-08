-- =============================================================================
-- THEME VERSIONS ACCESS, T3 (plan § T3 and its review). Hand-written.
--
-- theme_versions: platform data (no tenant). frata_app reads id, key, version and the three dates (never who or
--   why) under catalogue_read. frata_admin reads, inserts, and sets the lifecycle columns; a trigger makes each
--   decision final (a set date never changes or clears: the fix for a bad version is a new version).
-- theme_version_stages: a shop reads its own rows (version, shop, when); frata_admin stages and unstages.
-- Admin's "shops live on it" count reads publishes and revisions by column (never settings), ADR-0007.
-- =============================================================================
revoke all on theme_versions, theme_version_stages from anon, authenticated, service_role;
--> statement-breakpoint
alter table theme_versions enable row level security;
--> statement-breakpoint
alter table theme_version_stages enable row level security;
--> statement-breakpoint
grant select (id, theme_key, version, released_at, recalled_at, withdrawn_at) on theme_versions to frata_app;
--> statement-breakpoint
create policy catalogue_read on theme_versions for select to frata_app, frata_admin using (true);
--> statement-breakpoint
grant select, insert on theme_versions to frata_admin;
--> statement-breakpoint
grant update (released_at, released_by, recalled_at, recalled_by, recalled_reason, withdrawn_at, withdrawn_by, withdrawn_reason) on theme_versions to frata_admin;
--> statement-breakpoint
create policy admin_insert on theme_versions for insert to frata_admin with check (true);
--> statement-breakpoint
create policy admin_update on theme_versions for update to frata_admin using (true) with check (true);
--> statement-breakpoint
create or replace function app_theme_version_final() returns trigger
  language plpgsql security invoker set search_path = '' as $$
begin
  if (old.released_at is not null and new.released_at is distinct from old.released_at)
     or (old.recalled_at is not null and (new.recalled_at is distinct from old.recalled_at or new.recalled_reason is distinct from old.recalled_reason))
     or (old.withdrawn_at is not null and (new.withdrawn_at is distinct from old.withdrawn_at or new.withdrawn_reason is distinct from old.withdrawn_reason)) then
    raise exception 'a theme version decision is final' using errcode = 'check_violation';
  end if;
  return new;
end $$;
--> statement-breakpoint
revoke all on function app_theme_version_final() from public, anon, authenticated, service_role;
--> statement-breakpoint
create trigger theme_versions_final before update on theme_versions for each row execute function app_theme_version_final();
--> statement-breakpoint
grant select (version_id, tenant_id, staged_at) on theme_version_stages to frata_app;
--> statement-breakpoint
-- Select only, on purpose: a shop never writes a stage (Admin stages and unstages). Don't add a write grant here.
create policy tenant_rows on theme_version_stages for select to frata_app using (tenant_id = app_current_tenant());
--> statement-breakpoint
grant select, insert, delete on theme_version_stages to frata_admin;
--> statement-breakpoint
create policy admin_all on theme_version_stages for all to frata_admin using (true) with check (true);
--> statement-breakpoint
grant select (id, tenant_id, revision_id, published_at) on shop_theme_publishes to frata_admin;
--> statement-breakpoint
create policy admin_read on shop_theme_publishes for select to frata_admin using (true);
--> statement-breakpoint
grant select (id, tenant_id, theme_key, theme_version) on shop_theme_revisions to frata_admin;
--> statement-breakpoint
create policy admin_read on shop_theme_revisions for select to frata_admin using (true);
--> statement-breakpoint
-- Every version in this build is available today (the spec's "before T3"): recorded as released by the system actor.
insert into theme_versions (theme_key, version, released_at, released_by) values
  ('classic', '1.0.0', now(), '00000000-0000-0000-0000-000000000000'),
  ('editorial', '1.0.0', now(), '00000000-0000-0000-0000-000000000000'),
  ('editorial', '1.1.0', now(), '00000000-0000-0000-0000-000000000000'),
  ('bazaar', '1.0.0', now(), '00000000-0000-0000-0000-000000000000'),
  ('minimal', '1.0.0', now(), '00000000-0000-0000-0000-000000000000'),
  ('atelier', '1.0.0', now(), '00000000-0000-0000-0000-000000000000')
  on conflict (theme_key, version) do nothing;
