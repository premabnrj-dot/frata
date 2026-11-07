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
--> statement-breakpoint
-- WhatsApp items carry shoppers' phones and words, so they are stored by a definer that routes them itself
-- (tenancy audit of C1, 2026-11-07): the caller passes the account id it saw and our key's tail, never a tenant.
create or replace function app_store_wa_event(p_by text, p_meta_id text, p_tail text, p_payload jsonb) returns uuid
  language plpgsql volatile security definer set search_path = '' as $$
declare t uuid; inserted uuid;
begin
  if p_meta_id !~ '^[0-9]{5,20}$' or p_tail !~ '^[A-Za-z0-9._=:+/-]{1,250}$' or p_by not in ('number', 'account') then return null; end if;
  select c.tenant_id into t from public.wa_connections c
   where c.disconnected_at is null and (case when p_by = 'number' then c.phone_number_id else c.waba_id end) = p_meta_id limit 1;
  if t is null then return null; end if;
  insert into public.webhook_events (provider, event_key, tenant_id, payload)
    values ('whatsapp', 'whatsapp:' || t || ':' || p_tail, t, p_payload)
    on conflict (event_key) do nothing returning tenant_id into inserted;
  return inserted;
end $$;
--> statement-breakpoint
-- The daily safety net asks only WHICH shops have work, never reads a row before a shop is set.
create or replace function app_pending_event_shops(p_provider text) returns setof uuid
  language sql stable security definer set search_path = '' as $$
  select distinct e.tenant_id from public.webhook_events e
   where e.provider = p_provider and e.processed_at is null and e.tenant_id is not null limit 500
$$;
--> statement-breakpoint
revoke all on function app_store_wa_event(text, text, text, jsonb), app_pending_event_shops(text) from public, anon, authenticated, service_role;
--> statement-breakpoint
grant execute on function app_store_wa_event(text, text, text, jsonb), app_pending_event_shops(text) to frata_app;
--> statement-breakpoint
-- With no shop set, frata_app may no longer read or change any event; it may still insert a signed Razorpay one
-- (the receiver knows its shop from our key) but never a WhatsApp one (only the definer stores those).
alter policy webhook_read on webhook_events using (tenant_id = app_current_tenant());
--> statement-breakpoint
alter policy webhook_update on webhook_events using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint
alter policy webhook_insert on webhook_events with check ((app_current_tenant() is null and provider <> 'whatsapp') or tenant_id = app_current_tenant());
