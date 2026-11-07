-- =============================================================================
-- CHECKOUT ACCESS (docs/specs/2026-11-07-checkout.md). Hand-written.
-- frata_app: its own shop's rows only. frata_admin: deliberately NO grant on
-- order_lines or payment_keys (a merchant's keys and costs are not staff data).
-- =============================================================================
revoke all on order_lines, payment_keys from anon, authenticated;
--> statement-breakpoint
alter table order_lines enable row level security;
--> statement-breakpoint
alter table payment_keys enable row level security;
--> statement-breakpoint
-- Lines are written once at placement; an order never changes what was sold.
grant select, insert on order_lines to frata_app;
--> statement-breakpoint
grant select, insert, update, delete on payment_keys to frata_app;
--> statement-breakpoint
create policy tenant_rows on order_lines for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint
create policy tenant_rows on payment_keys for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint
-- A line points at its shop's own variant; deleting the variant keeps the line and its snapshot (PG 15+ column list).
alter table order_lines add constraint order_lines_variant_fk foreign key (tenant_id, variant_id) references variants (tenant_id, id) on delete set null (variant_id);
--> statement-breakpoint
-- A webhook arrives with only our key in its URL: this says which shop it is and gives the webhook secret (encrypted;
-- the app decrypts). Never the key secret. Nothing else is readable before the tenant is known.
create or replace function app_payment_webhook_for(p_key text) returns table (tenant_id uuid, webhook_secret_enc text)
  language sql stable security definer set search_path = '' as $$
  select k.tenant_id, k.webhook_secret_enc from public.payment_keys k where k.webhook_key = p_key and p_key ~ '^k_[a-f0-9]{32}$' limit 1
$$;
--> statement-breakpoint
revoke all on function app_payment_webhook_for(text) from public, anon, authenticated;
--> statement-breakpoint
grant execute on function app_payment_webhook_for(text) to frata_app;
--> statement-breakpoint
-- Platform tables now carry shopper details: inside a tenant's transaction, only that tenant's rows (tenancy review 2026-11-07).
drop policy webhook_platform on webhook_events;
--> statement-breakpoint
create policy webhook_read on webhook_events for select to frata_app using (app_current_tenant() is null or tenant_id = app_current_tenant());
--> statement-breakpoint
create policy webhook_insert on webhook_events for insert to frata_app with check (true);
--> statement-breakpoint
create policy webhook_update on webhook_events for update to frata_app using (app_current_tenant() is null or tenant_id = app_current_tenant()) with check (true);
--> statement-breakpoint
drop policy outbox_sweep_read on outbox;
--> statement-breakpoint
drop policy outbox_sweep_update on outbox;
--> statement-breakpoint
create policy outbox_sweep_read on outbox for select to frata_app using (app_current_tenant() is null or tenant_id = app_current_tenant());
--> statement-breakpoint
create policy outbox_sweep_update on outbox for update to frata_app using (app_current_tenant() is null or tenant_id = app_current_tenant()) with check (true);
--> statement-breakpoint
-- Plan usage counts real orders: an online order that was never paid (and not switched to COD) is not one.
create or replace function app_admin_order_counts(p_since timestamptz) returns table (tenant_id uuid, n bigint)
  language sql stable security definer set search_path = '' as $$
  select o.tenant_id, count(*) from public.orders o
   where o.placed_at >= p_since and not (o.payment_method = 'prepaid' and o.paid_at is null and o.switched_to_cod_at is null)
   group by o.tenant_id
$$;
