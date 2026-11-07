-- =============================================================================
-- COMMUNICATION ACCESS, C1 (docs/specs/2026-11-07-communication.md; tenancy review in docs/plans/2026-11-07-m2.md).
-- Hand-written.
--
-- wa_connections: the shop reads and writes its OWN row (connect inserts; health, disconnect and the token
--   update it); nothing deletes, so a number's history stays. frata_admin has NO grant (tenancy review:
--   staff never read a shop's WhatsApp).
-- app_tenant_for_wa / app_tenant_for_waba: the webhook's only route to a shop, before a tenant is known.
--   Open connections only, digits only, tenant id only.
-- service_role too: Supabase grants it every new object by default; Frrata never uses that key.
-- =============================================================================
revoke all on wa_connections from anon, authenticated, service_role;
--> statement-breakpoint
alter table wa_connections enable row level security;
--> statement-breakpoint
grant select, insert on wa_connections to frata_app;
--> statement-breakpoint
grant update (business_id, display_phone, verified_name, token_enc, disconnected_at, disconnected_by, quality, limit_tier, name_status, payment_ok, currency, can_send, token_rejected_at, history_sync_at, checked_at) on wa_connections to frata_app;
--> statement-breakpoint
create policy tenant_rows on wa_connections for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint
create or replace function app_tenant_for_wa(p_phone_number_id text) returns uuid
  language sql stable security definer set search_path = '' as $$
  select c.tenant_id from public.wa_connections c
   where p_phone_number_id ~ '^[0-9]{5,20}$' and c.phone_number_id = p_phone_number_id and c.disconnected_at is null
   limit 1
$$;
--> statement-breakpoint
create or replace function app_tenant_for_waba(p_waba_id text) returns uuid
  language sql stable security definer set search_path = '' as $$
  select c.tenant_id from public.wa_connections c
   where p_waba_id ~ '^[0-9]{5,20}$' and c.waba_id = p_waba_id and c.disconnected_at is null
   limit 1
$$;
--> statement-breakpoint
revoke all on function app_tenant_for_wa(text), app_tenant_for_waba(text) from public, anon, authenticated, service_role;
--> statement-breakpoint
grant execute on function app_tenant_for_wa(text), app_tenant_for_waba(text) to frata_app;
