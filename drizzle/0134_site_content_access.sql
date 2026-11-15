-- =============================================================================
-- V1 CONTENT — SITE_CONTENT ACCESS (plan docs/plans/2026-11-15-v1-content.md § site_content; tenancy-auditor and
-- security-reviewer 2026-11-15). Hand-written.
--
-- site_content: the store reads, inserts and deletes its OWN rows and updates only the content columns (never
--   tenant_id, id, kind or key: a row can't move to another store or become another fact). One policy for every command,
--   with `using` and `with check`.
-- At most 3 bars a store that are not deleted (trigger, under the store's own `content:` lock, taken only after the row
--   is known to be this store's: a foreign row is refused before any lock). No null-tenant branch: a write with no store
--   set is refused like any other store's.
-- frata_admin: none. anon, authenticated, service_role: none (Supabase grants new objects by default; Frrata never uses
--   that key).
-- =============================================================================
revoke all on site_content from anon, authenticated, service_role;
--> statement-breakpoint
alter table site_content enable row level security;
--> statement-breakpoint
grant select, insert, delete on site_content to frata_app;
--> statement-breakpoint
grant update (value, previous, starts_at, ends_at, stopped_at, deleted_at, version, updated_at, updated_by) on site_content to frata_app;
--> statement-breakpoint
create policy tenant_rows on site_content for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint
create or replace function app_site_content_cap() returns trigger
  language plpgsql security invoker set search_path = '' as $$
begin
  if new.tenant_id is distinct from public.app_current_tenant() then
    raise exception 'not this shop' using errcode = 'insufficient_privilege';
  end if;
  if new.kind <> 'announcement' or new.deleted_at is not null then return new; end if;
  perform pg_advisory_xact_lock(hashtext('content:' || new.tenant_id::text));
  if (select count(*) from public.site_content c where c.tenant_id = new.tenant_id and c.kind = 'announcement'
        and c.deleted_at is null and c.id <> new.id) >= 3 then
    raise exception 'a store has at most 3 bars' using errcode = 'check_violation';
  end if;
  return new;
end $$;
--> statement-breakpoint
revoke all on function app_site_content_cap() from public, anon, authenticated, service_role, frata_app;
--> statement-breakpoint
create trigger site_content_cap before insert or update of deleted_at on site_content for each row execute function app_site_content_cap();
