-- =============================================================================
-- DOCUMENTS D3 ACCESS: credit notes (docs/plans/2026-11-08-documents-pdf.md § Review findings 8). Hand-written.
--
-- credit_notes: the shop's own rows only (frata_app under RLS): it reads them and issues one (insert); it never
-- changes or deletes one — a credit note is final once written, for every role (the trigger below). frata_admin and
-- the API roles: nothing.
-- =============================================================================
revoke all on credit_notes from anon, authenticated, service_role;
--> statement-breakpoint
alter table credit_notes enable row level security;
--> statement-breakpoint
grant select, insert on credit_notes to frata_app;
--> statement-breakpoint
create policy tenant_rows on credit_notes for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint
create or replace function credit_note_final() returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'a credit note is final once issued' using errcode = 'check_violation';
end $$;
--> statement-breakpoint
revoke all on function credit_note_final() from public, anon, authenticated, service_role;
--> statement-breakpoint
create trigger credit_notes_final before update or delete on credit_notes for each row execute function credit_note_final();
--> statement-breakpoint
create trigger credit_notes_no_truncate before truncate on credit_notes for each statement execute function credit_note_final();
