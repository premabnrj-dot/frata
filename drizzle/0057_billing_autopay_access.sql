-- =============================================================================
-- BILLING B3 ACCESS: autopay (docs/plans/2026-11-08-billing.md § Review findings 9, 10, 12, 13, 14). Hand-written.
--
-- billing_mandate_setups: the shop reads its own; written only by definers bound to app_current_tenant() — a set-up
--   starts for THIS shop and completes only against THIS shop's pending row (finding 14).
-- billing_events: no app grant at all; stored by an insert-only definer, applied by another from the stored row (12).
-- billing_notices: the shop reads its own (owners and admins, through src/lib/queries/billing.ts); written by definers.
-- Debits: one frrata_payments row per attempt (unique per invoice and attempt) and one outbox row 'bill:attempt' per
--   attempt, in one transaction (13). The gateway's ids are unique; an outcome only moves forward; a timeout stays
--   unknown until the gateway or the webhook settles it, never resent.
-- The mandate's gateway ids stay away from frata_app's columns (0048): the debit's context comes from a definer that
--   answers only for a payment row still waiting for the gateway.
-- =============================================================================
revoke all on billing_mandate_setups, billing_events, billing_notices from anon, authenticated, service_role;
--> statement-breakpoint
alter table billing_mandate_setups enable row level security;
--> statement-breakpoint
alter table billing_events enable row level security;
--> statement-breakpoint
alter table billing_notices enable row level security;
--> statement-breakpoint
grant select (id, tenant_id, method, max_amount, created_at, completed_at) on billing_mandate_setups to frata_app;
--> statement-breakpoint
create policy tenant_read on billing_mandate_setups for select to frata_app using (tenant_id = app_current_tenant());
--> statement-breakpoint
grant select on billing_notices to frata_app;
--> statement-breakpoint
create policy tenant_read on billing_notices for select to frata_app using (tenant_id = app_current_tenant());
--> statement-breakpoint
grant select on billing_mandate_setups, billing_notices to frata_admin;
--> statement-breakpoint
create policy admin_read on billing_mandate_setups for select to frata_admin using (true);
--> statement-breakpoint
create policy admin_read on billing_notices for select to frata_admin using (true);
--> statement-breakpoint
create policy definer_only on billing_events as restrictive for all to public using (false) with check (false);
--> statement-breakpoint
create unique index frrata_payments_attempt on frrata_payments (invoice_id, attempt) where attempt > 0;
--> statement-breakpoint
-- The shop sees whether autopay is on, how and up to what (never the gateway's customer or token id).
grant select (mandate_method, mandate_max, mandate_at, mandate_revoked_at) on billing_accounts to frata_app;
--> statement-breakpoint
-- ── The shop's own (bound to app_current_tenant()) ──
create or replace function app_begin_mandate(p_customer text, p_order text, p_method text, p_max bigint, p_by uuid) returns void
  language plpgsql security definer set search_path = '' as $$
declare t uuid := public.app_current_tenant();
begin
  if t is null then raise exception 'mandate: no shop' using errcode = 'insufficient_privilege'; end if;
  insert into public.billing_mandate_setups (tenant_id, gateway_order_id, gateway_customer_id, method, max_amount, created_by) values (t, p_order, p_customer, p_method, p_max, p_by);
end $$;
--> statement-breakpoint
create or replace function app_complete_mandate(p_order text, p_token text) returns boolean
  language plpgsql security definer set search_path = '' as $$
declare t uuid := public.app_current_tenant(); s record;
begin
  if t is null or coalesce(p_token, '') = '' then return false; end if;
  select * from public.billing_mandate_setups where gateway_order_id = p_order and tenant_id = t and completed_at is null for update into s;
  if s.id is null then return false; end if;
  update public.billing_mandate_setups set completed_at = now() where id = s.id;
  insert into public.billing_accounts (tenant_id, gateway_customer_id, mandate_token_id, mandate_method, mandate_max, mandate_at, mandate_revoked_at)
    values (t, s.gateway_customer_id, p_token, s.method, s.max_amount, now(), null)
    on conflict (tenant_id) do update set gateway_customer_id = excluded.gateway_customer_id, mandate_token_id = excluded.mandate_token_id, mandate_method = excluded.mandate_method,
      mandate_max = excluded.mandate_max, mandate_at = excluded.mandate_at, mandate_revoked_at = null, updated_at = now();
  return true;
end $$;
--> statement-breakpoint
create or replace function app_revoke_mandate() returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.billing_accounts set mandate_revoked_at = now(), updated_at = now() where tenant_id = public.app_current_tenant() and mandate_token_id is not null and mandate_revoked_at is null;
end $$;
--> statement-breakpoint
-- "Pay now" (a one-off Checkout payment against the shop's own issued invoice): the pending row, before Checkout opens.
create or replace function app_billing_checkout_begin(p_invoice uuid, p_order text, p_amount bigint) returns void
  language plpgsql security definer set search_path = '' as $$
declare t uuid := public.app_current_tenant(); inv record;
begin
  select id, tenant_id from public.frrata_invoices where id = p_invoice and tenant_id = t and number is not null into inv;
  if inv.id is null or p_amount <= 0 then raise exception 'pay: no such invoice' using errcode = 'invalid_parameter_value'; end if;
  insert into public.frrata_payments (tenant_id, invoice_id, method, amount, gateway_order_id) values (t, p_invoice, 'paylink', p_amount, p_order);
end $$;
--> statement-breakpoint
-- ── The system's (the daily run, the outbox sender, the webhook; no shop set) ──
create or replace function app_billing_due() returns table (tenant_id uuid, invoice_id uuid, number text, due bigint, test_mode boolean, issued_at timestamptz,
  mandate boolean, mandate_max bigint, mandate_method text, notice_at timestamptz, attempts int, pending int, last_failed_at timestamptz, acknowledged boolean)
  language sql stable security definer set search_path = '' as $$
  select i.tenant_id, i.id, i.number,
         i.total - coalesce((select sum(p.amount) from public.frrata_payments p where p.invoice_id = i.id and p.captured_at is not null), 0)
                 - coalesce((select sum(c.total) from public.frrata_credit_notes c where c.invoice_id = i.id), 0),
         i.test_mode, i.issued_at,
         (b.mandate_token_id is not null and b.mandate_revoked_at is null), b.mandate_max, b.mandate_method,
         (select max(n.created_at) from public.billing_notices n where n.invoice_id = i.id and n.kind = 'debit_notice'),
         (select count(*)::int from public.frrata_payments p where p.invoice_id = i.id and p.attempt > 0),
         (select count(*)::int from public.frrata_payments p where p.invoice_id = i.id and p.attempt > 0 and p.captured_at is null and p.failed_at is null),
         (select max(p.failed_at) from public.frrata_payments p where p.invoice_id = i.id and p.attempt > 0),
         exists (select 1 from public.billing_notices n where n.invoice_id = i.id and n.kind = 'acknowledge')
    from public.frrata_invoices i left join public.billing_accounts b on b.tenant_id = i.tenant_id
   where i.number is not null and i.issued_at > now() - interval '60 days'
     and i.total > coalesce((select sum(p.amount) from public.frrata_payments p where p.invoice_id = i.id and p.captured_at is not null), 0)
                 + coalesce((select sum(c.total) from public.frrata_credit_notes c where c.invoice_id = i.id), 0)
$$;
--> statement-breakpoint
create or replace function app_billing_notice(p_invoice uuid, p_kind text, p_amount bigint, p_debit_at timestamptz) returns void
  language plpgsql security definer set search_path = '' as $$
declare inv record;
begin
  select id, tenant_id from public.frrata_invoices where id = p_invoice and number is not null into inv;
  if inv.id is null then return; end if;
  if p_kind = 'acknowledge' and exists (select 1 from public.billing_notices where invoice_id = p_invoice and kind = 'acknowledge') then return; end if;
  insert into public.billing_notices (tenant_id, invoice_id, kind, amount, debit_at) values (inv.tenant_id, p_invoice, p_kind, p_amount, p_debit_at);
end $$;
--> statement-breakpoint
-- One attempt: its payment row and its outbox row, together (finding 13). Refused while another attempt is unsettled.
create or replace function app_billing_begin_attempt(p_invoice uuid, p_attempt int) returns uuid
  language plpgsql security definer set search_path = '' as $$
declare inv record; b record; due bigint; pid uuid;
begin
  select id, tenant_id, total from public.frrata_invoices where id = p_invoice and number is not null for update into inv;
  if inv.id is null then return null; end if;
  -- An unsettled debit blocks the next; an abandoned Pay now (attempt 0) does not.
  if exists (select 1 from public.frrata_payments where invoice_id = p_invoice and attempt > 0 and captured_at is null and failed_at is null) then return null; end if;
  select mandate_token_id, mandate_method, mandate_revoked_at, mandate_max from public.billing_accounts where tenant_id = inv.tenant_id into b;
  if b.mandate_token_id is null or b.mandate_revoked_at is not null then return null; end if;
  due := inv.total - coalesce((select sum(amount) from public.frrata_payments where invoice_id = p_invoice and captured_at is not null), 0)
                   - coalesce((select sum(total) from public.frrata_credit_notes where invoice_id = p_invoice), 0);
  if due <= 0 or due > b.mandate_max then return null; end if;
  insert into public.frrata_payments (tenant_id, invoice_id, attempt, method, amount) values (inv.tenant_id, p_invoice, p_attempt, b.mandate_method, due) returning id into pid;
  insert into public.outbox (tenant_id, kind, dedupe_key, payload) values (inv.tenant_id, 'bill:attempt', 'bill:attempt:' || p_invoice || ':' || p_attempt, jsonb_build_object('payment', pid))
    on conflict (tenant_id, dedupe_key) do nothing;
  return pid;
end $$;
--> statement-breakpoint
-- What the sender needs for ONE waiting attempt (or a Pay-now order). Nothing for a settled one.
create or replace function app_billing_attempt_context(p_payment uuid) returns table (tenant_id uuid, amount bigint, receipt text, gateway_order_id text, customer text, token text, test_mode boolean)
  language sql stable security definer set search_path = '' as $$
  select p.tenant_id, p.amount, i.number || ':' || p.attempt, p.gateway_order_id, b.gateway_customer_id, b.mandate_token_id, i.test_mode
    from public.frrata_payments p join public.frrata_invoices i on i.id = p.invoice_id left join public.billing_accounts b on b.tenant_id = p.tenant_id
   where p.id = p_payment and p.captured_at is null and p.failed_at is null and p.gateway_payment_id is null
$$;
--> statement-breakpoint
create or replace function app_billing_attempt_order(p_payment uuid, p_order text) returns void language sql security definer set search_path = '' as $$
  update public.frrata_payments set gateway_order_id = p_order where id = p_payment and gateway_order_id is null and captured_at is null and failed_at is null
$$;
--> statement-breakpoint
-- The outcome, from the sender's answer, the webhook or Pay now's verified Checkout: forward only, once.
create or replace function app_billing_attempt_result(p_order text, p_payment_id text, p_captured boolean, p_reason text) returns boolean
  language plpgsql security definer set search_path = '' as $$
declare p record; n int;
begin
  select id, invoice_id, tenant_id, amount, captured_at, failed_at, gateway_payment_id from public.frrata_payments where gateway_order_id = p_order for update into p;
  if p.id is null then return false; end if;
  if p.captured_at is not null then return false; end if;                       -- captured is final
  if p.failed_at is not null and not p_captured then return false; end if;      -- failed only moves to captured
  update public.frrata_payments set gateway_payment_id = coalesce(p_payment_id, gateway_payment_id),
    captured_at = case when p_captured then now() else null end, failed_at = case when p_captured then null else now() end,
    failure_reason = case when p_captured then null else left(coalesce(p_reason, 'declined'), 120) end
   where id = p.id;
  get diagnostics n = row_count;
  if not p_captured then perform public.app_billing_notice(p.invoice_id, 'failed', p.amount, null); end if;
  return n = 1;
end $$;
--> statement-breakpoint
-- Attempts still unsettled after `p_older` (a lost webhook): the daily run asks the gateway and records the answer.
create or replace function app_billing_unsettled(p_older interval) returns table (payment_id uuid, gateway_order_id text)
  language sql stable security definer set search_path = '' as $$
  select id, gateway_order_id from public.frrata_payments
   where attempt > 0 and captured_at is null and failed_at is null and gateway_order_id is not null and created_at < now() - p_older
$$;
--> statement-breakpoint
create or replace function app_store_billing_event(p_event text, p_type text, p_payload jsonb) returns uuid
  language plpgsql security definer set search_path = '' as $$
declare eid uuid;
begin
  insert into public.billing_events (event_id, type, payload) values (left(p_event, 80), left(p_type, 60), p_payload) on conflict (event_id) do nothing returning id into eid;
  return eid;
end $$;
--> statement-breakpoint
create or replace function app_apply_billing_event(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare e record; ord text; pay text; tok text;
begin
  select * from public.billing_events where id = p_id and applied_at is null for update into e;
  if e.id is null then return; end if;
  ord := e.payload #>> '{payload,payment,entity,order_id}';
  pay := e.payload #>> '{payload,payment,entity,id}';
  if e.type = 'payment.captured' and ord is not null then perform public.app_billing_attempt_result(ord, pay, true, null);
  elsif e.type = 'payment.failed' and ord is not null then perform public.app_billing_attempt_result(ord, pay, false, e.payload #>> '{payload,payment,entity,error_description}');
  elsif e.type in ('token.cancelled', 'token.rejected', 'token.paused') then
    tok := e.payload #>> '{payload,token,entity,id}';
    if tok is not null then update public.billing_accounts set mandate_revoked_at = now(), updated_at = now() where mandate_token_id = tok and mandate_revoked_at is null; end if;
  end if;
  update public.billing_events set applied_at = now() where id = e.id;
end $$;
--> statement-breakpoint
revoke all on function app_begin_mandate(text, text, text, bigint, uuid), app_complete_mandate(text, text), app_revoke_mandate(), app_billing_checkout_begin(uuid, text, bigint),
  app_billing_due(), app_billing_notice(uuid, text, bigint, timestamptz), app_billing_begin_attempt(uuid, int), app_billing_attempt_context(uuid), app_billing_attempt_order(uuid, text),
  app_billing_attempt_result(text, text, boolean, text), app_billing_unsettled(interval), app_store_billing_event(text, text, jsonb), app_apply_billing_event(uuid) from public, anon, authenticated, service_role;
--> statement-breakpoint
grant execute on function app_begin_mandate(text, text, text, bigint, uuid), app_complete_mandate(text, text), app_revoke_mandate(), app_billing_checkout_begin(uuid, text, bigint),
  app_billing_due(), app_billing_notice(uuid, text, bigint, timestamptz), app_billing_begin_attempt(uuid, int), app_billing_attempt_context(uuid), app_billing_attempt_order(uuid, text),
  app_billing_attempt_result(text, text, boolean, text), app_billing_unsettled(interval), app_store_billing_event(text, text, jsonb), app_apply_billing_event(uuid) to frata_app;
