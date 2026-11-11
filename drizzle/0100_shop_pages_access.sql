-- =============================================================================
-- THEME STUDIO TS1a — SHOP PAGES ACCESS (plan docs/plans/2026-11-11-theme-studio-ts1.md; tenancy-auditor 2026-11-11).
-- Hand-written.
--
-- shop_pages: the shop reads, inserts and deletes its OWN rows (delete: a page never published, or one removed at an
--   earlier publish) and updates only the content columns (never tenant_id, id or template). A page reaches the shop
--   only through `live`, set by the look's Publish in the same transaction (src/lib/themes/look.ts).
-- Addresses: unique per shop (an expression index on the draft's handle, which is the live one once published: the
--   handle is fixed then). One FAQ per shop. At most 20 pages a shop (trigger, under the look's per-shop lock).
-- frata_admin: none. service_role: none (Supabase grants every new object by default; Frrata never uses that key).
-- =============================================================================
revoke all on shop_pages from anon, authenticated, service_role;
--> statement-breakpoint
alter table shop_pages enable row level security;
--> statement-breakpoint
grant select, insert, delete on shop_pages to frata_app;
--> statement-breakpoint
grant update (draft, live, previous, live_publish_id, version, removed_at, updated_at) on shop_pages to frata_app;
--> statement-breakpoint
create policy tenant_rows on shop_pages for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint
-- The handle is an address: a-z, 0-9 and dashes, 1–60 (the app refuses reserved words before this).
alter table shop_pages add constraint shop_pages_handle_shape check ((draft->>'handle') ~ '^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$');
--> statement-breakpoint
create unique index shop_pages_handle on shop_pages (tenant_id, (draft->>'handle'));
--> statement-breakpoint
create unique index shop_pages_one_faq on shop_pages (tenant_id) where template = 'faq' and removed_at is null;
--> statement-breakpoint
create index shop_pages_live_publish_idx on shop_pages (tenant_id, live_publish_id) where live_publish_id is not null;
--> statement-breakpoint
-- At most 20 pages a shop. Caller's rights (it sees only the caller's shop, all it needs), under the same per-shop lock
-- the look's saves and publishes take, so two inserts can't both pass at 19.
create or replace function app_shop_pages_cap() returns trigger
  language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('look:' || new.tenant_id::text));
  if (select count(*) from public.shop_pages p where p.tenant_id = new.tenant_id) >= 20 then
    raise exception 'a shop has at most 20 pages' using errcode = 'check_violation';
  end if;
  return new;
end $$;
--> statement-breakpoint
revoke all on function app_shop_pages_cap() from public, anon, authenticated, service_role;
--> statement-breakpoint
create trigger shop_pages_cap before insert on shop_pages for each row execute function app_shop_pages_cap();
