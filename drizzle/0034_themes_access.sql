-- =============================================================================
-- THEMES ACCESS, T1 (docs/specs/2026-11-08-themes.md; plan § Review findings, tenancy-auditor 2026-11-08).
-- Hand-written.
--
-- shop_theme_revisions: the shop reads, inserts and deletes its OWN rows (delete: an unpublished draft only, the
--   trigger refuses a published one) and may update only the draft's content columns.
-- shop_theme_publishes: append-only. The live look is the latest row. Nobody updates or deletes one.
-- frata_admin: NO grant in T1 (Admin › Merchant › Look comes with T3, with column grants and never `settings`).
-- service_role too: Supabase grants it every new object by default; Frrata never uses that key.
-- =============================================================================
revoke all on shop_theme_revisions, shop_theme_publishes from anon, authenticated, service_role;
--> statement-breakpoint
alter table shop_theme_revisions enable row level security;
--> statement-breakpoint
alter table shop_theme_publishes enable row level security;
--> statement-breakpoint
grant select, insert, delete on shop_theme_revisions to frata_app;
--> statement-breakpoint
grant update (settings, style_key, version, updated_at, updated_by, updated_by_email) on shop_theme_revisions to frata_app;
--> statement-breakpoint
create policy tenant_rows on shop_theme_revisions for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint
grant select, insert on shop_theme_publishes to frata_app;
--> statement-breakpoint
create policy tenant_rows on shop_theme_publishes for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint
-- A revision that was ever published is frozen: its content can't change and it can't be deleted. Security
-- invoker: it sees only what the caller sees (its own shop's publishes), which is all it needs.
create or replace function app_theme_revision_frozen() returns trigger
  language plpgsql security invoker set search_path = '' as $$
begin
  if exists (select 1 from public.shop_theme_publishes p where p.tenant_id = old.tenant_id and p.revision_id = old.id) then
    raise exception 'a published look cannot change' using errcode = 'check_violation';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
--> statement-breakpoint
revoke all on function app_theme_revision_frozen() from public, anon, authenticated, service_role;
--> statement-breakpoint
create trigger shop_theme_revisions_frozen before update or delete on shop_theme_revisions
  for each row execute function app_theme_revision_frozen();
--> statement-breakpoint
-- Every existing shop's look today, as its first published revision (Classic from accent and display_font), so
-- History starts with it and the first Undo has something to return to. Shops made later get the same row from
-- their first publish (src/lib/themes/look.ts). created_by: the system actor.
insert into shop_theme_revisions (tenant_id, theme_key, theme_version, style_key, settings, created_by, updated_by)
  select s.tenant_id, 'classic', '1.0.0', s.accent, jsonb_build_object('settings', jsonb_build_object('pairing', s.display_font)),
         '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000'
    from shop_settings s;
--> statement-breakpoint
insert into shop_theme_publishes (tenant_id, revision_id, published_at, published_by)
  select r.tenant_id, r.id, r.created_at, r.created_by from shop_theme_revisions r;
