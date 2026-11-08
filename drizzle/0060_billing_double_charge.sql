-- =============================================================================
-- BILLING B3, SECURITY REVIEW (2026-11-08): NEVER CHARGE A SHOP TWICE. Hand-written; replaces definers from 0057.
--  1. Pay now and autopay never overlap: Pay now is refused while a debit is unsettled, an open Pay-now order is reused
--     (two tabs, one order), and a debit is not begun while a Pay-now order is open (2 hours; after that it is abandoned).
--  2. One sender per attempt: app_billing_attempt_claim takes the attempt once (sending_at). A sender that loses it, or
--     an outbox retry, charges nothing; what is still open after 2 hours is settled from the gateway, or closed.
--  3. The amount is checked again just before charging (a credit note or a payment recorded since): a stale attempt is
--     closed without charging, and the next notice names the new amount.
--  4. A capture beyond what was due is kept in over_paid, for Frrata to refund (Admin shows it).
-- =============================================================================

-- What Pay now needs, for THIS shop's invoice: the amount due and an open Pay-now order to reuse. Refused while a debit
-- is under way.
create or replace function app_billing_paynow_check(p_invoice uuid) returns table (number text, due bigint, test_mode boolean, open_order text, open_amount bigint)
  language plpgsql stable security definer set search_path = '' as $$
declare t uuid := public.app_current_tenant();
begin
  if exists (select 1 from public.frrata_payments p where p.invoice_id = p_invoice and p.tenant_id = t and p.attempt > 0 and p.captured_at is null and p.failed_at is null) then
    raise exception 'pay: an autopay debit for this invoice is under way; it settles within a day' using errcode = 'check_violation'; end if;
  return query
  select i.number,
         (i.total - coalesce((select sum(p.amount) from public.frrata_payments p where p.invoice_id = i.id and p.captured_at is not null), 0)
                  - coalesce((select sum(c.total) from public.frrata_credit_notes c where c.invoice_id = i.id), 0))::bigint,
         i.test_mode, o.gateway_order_id, o.amount
    from public.frrata_invoices i
    left join lateral (select p.gateway_order_id, p.amount from public.frrata_payments p where p.invoice_id = i.id and p.attempt = 0 and p.method = 'paylink'
                         and p.captured_at is null and p.failed_at is null and p.created_at > now() - interval '2 hours' order by p.created_at desc limit 1) o on true
   where i.id = p_invoice and i.tenant_id = t and i.number is not null;
end $$;
--> statement-breakpoint
-- Records the Pay-now order made by the gateway (outside any transaction). Refused, so the caller reuses the open one,
-- when another Pay-now is open, a debit is under way, or the amount is no longer what is due.
create or replace function app_billing_checkout_begin(p_invoice uuid, p_order text, p_amount bigint) returns void
  language plpgsql security definer set search_path = '' as $$
declare t uuid := public.app_current_tenant(); inv record; due bigint;
begin
  select id, tenant_id, total from public.frrata_invoices where id = p_invoice and tenant_id = t and number is not null for update into inv;
  if inv.id is null or p_amount <= 0 then raise exception 'pay: no such invoice' using errcode = 'invalid_parameter_value'; end if;
  if exists (select 1 from public.frrata_payments where invoice_id = p_invoice and captured_at is null and failed_at is null
               and (attempt > 0 or (method = 'paylink' and created_at > now() - interval '2 hours'))) then
    raise exception 'pay: a payment for this invoice is already open' using errcode = 'unique_violation'; end if;
  due := inv.total - coalesce((select sum(amount) from public.frrata_payments where invoice_id = p_invoice and captured_at is not null), 0)
                   - coalesce((select sum(total) from public.frrata_credit_notes where invoice_id = p_invoice), 0);
  if p_amount <> due then raise exception 'pay: the amount due changed; open it again' using errcode = 'check_violation'; end if;
  insert into public.frrata_payments (tenant_id, invoice_id, method, amount, gateway_order_id) values (t, p_invoice, 'paylink', p_amount, p_order);
end $$;
--> statement-breakpoint
-- One attempt: its payment row and its outbox row, together. Refused while another attempt is unsettled or a Pay-now
-- order is open (2 hours).
create or replace function app_billing_begin_attempt(p_invoice uuid, p_attempt int) returns uuid
  language plpgsql security definer set search_path = '' as $$
declare inv record; b record; due bigint; pid uuid;
begin
  select id, tenant_id, total from public.frrata_invoices where id = p_invoice and number is not null for update into inv;
  if inv.id is null then return null; end if;
  if exists (select 1 from public.frrata_payments where invoice_id = p_invoice and captured_at is null and failed_at is null
               and (attempt > 0 or (method = 'paylink' and created_at > now() - interval '2 hours'))) then return null; end if;
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
-- The sender's view of ONE unsettled attempt, with what is due NOW (a credit note or payment since makes it stale).
drop function if exists app_billing_attempt_context(uuid);
--> statement-breakpoint
create function app_billing_attempt_context(p_payment uuid) returns table (tenant_id uuid, amount bigint, receipt text, gateway_order_id text, customer text, token text, test_mode boolean, due bigint, claimed boolean)
  language sql stable security definer set search_path = '' as $$
  select p.tenant_id, p.amount, i.number || ':' || p.attempt, p.gateway_order_id, b.gateway_customer_id, b.mandate_token_id, i.test_mode,
         i.total - coalesce((select sum(q.amount) from public.frrata_payments q where q.invoice_id = i.id and q.captured_at is not null), 0)
                 - coalesce((select sum(c.total) from public.frrata_credit_notes c where c.invoice_id = i.id), 0),
         p.sending_at is not null
    from public.frrata_payments p join public.frrata_invoices i on i.id = p.invoice_id left join public.billing_accounts b on b.tenant_id = p.tenant_id
   where p.id = p_payment and p.attempt > 0 and p.captured_at is null and p.failed_at is null and p.gateway_payment_id is null
$$;
--> statement-breakpoint
-- Takes the attempt for one sender, once. False: another sender has it, or an earlier try did (the 2-hour sweep settles it).
create or replace function app_billing_attempt_claim(p_payment uuid) returns boolean
  language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.frrata_payments set sending_at = now()
   where id = p_payment and attempt > 0 and sending_at is null and captured_at is null and failed_at is null and gateway_payment_id is null;
  get diagnostics n = row_count;
  return n = 1;
end $$;
--> statement-breakpoint
-- Closes an attempt that charged nothing: stale (the amount due changed) or never reached the gateway. No 'failed'
-- notice: nothing was declined. The next run sends a fresh notice for what is due then.
create or replace function app_billing_attempt_close(p_payment uuid, p_reason text) returns boolean
  language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.frrata_payments set failed_at = now(), failure_reason = left(coalesce(p_reason, 'not sent'), 120)
   where id = p_payment and attempt > 0 and captured_at is null and failed_at is null and gateway_payment_id is null;
  get diagnostics n = row_count;
  return n = 1;
end $$;
--> statement-breakpoint
-- The outcome: forward only, once. A capture beyond what was due is kept in over_paid for Frrata to refund.
create or replace function app_billing_attempt_result(p_order text, p_payment_id text, p_captured boolean, p_reason text) returns boolean
  language plpgsql security definer set search_path = '' as $$
declare p record; n int; inv record; due bigint;
begin
  select id, invoice_id, tenant_id, amount, captured_at, failed_at, gateway_payment_id from public.frrata_payments where gateway_order_id = p_order for update into p;
  if p.id is null then return false; end if;
  if p.captured_at is not null then return false; end if;
  if p.failed_at is not null and not p_captured then return false; end if;
  if p_captured then
    select id, total from public.frrata_invoices where id = p.invoice_id for update into inv;
    due := inv.total - coalesce((select sum(amount) from public.frrata_payments where invoice_id = p.invoice_id and captured_at is not null), 0)
                     - coalesce((select sum(total) from public.frrata_credit_notes where invoice_id = p.invoice_id), 0);
  end if;
  update public.frrata_payments set gateway_payment_id = coalesce(p_payment_id, gateway_payment_id),
    captured_at = case when p_captured then now() else null end, failed_at = case when p_captured then null else now() end,
    failure_reason = case when p_captured then null else left(coalesce(p_reason, 'declined'), 120) end,
    over_paid = case when p_captured then greatest(p.amount - greatest(due, 0), 0) else 0 end
   where id = p.id;
  get diagnostics n = row_count;
  if not p_captured then perform public.app_billing_notice(p.invoice_id, 'failed', p.amount, null); end if;
  return n = 1;
end $$;
--> statement-breakpoint
-- Attempts still open after `p_older`: those with a gateway order are asked of the gateway; those without one never
-- reached it and are closed.
drop function if exists app_billing_unsettled(interval);
--> statement-breakpoint
create function app_billing_unsettled(p_older interval) returns table (payment_id uuid, gateway_order_id text)
  language sql stable security definer set search_path = '' as $$
  select id, gateway_order_id from public.frrata_payments
   where attempt > 0 and captured_at is null and failed_at is null and created_at < now() - p_older
$$;
--> statement-breakpoint
-- Webhook events stored but never applied (an after() that failed): the daily run applies them.
create or replace function app_billing_unapplied(p_older interval) returns setof uuid
  language sql stable security definer set search_path = '' as $$
  select id from public.billing_events where applied_at is null and received_at < now() - p_older order by received_at limit 500
$$;
--> statement-breakpoint
revoke all on function app_billing_paynow_check(uuid), app_billing_checkout_begin(uuid, text, bigint), app_billing_begin_attempt(uuid, int), app_billing_attempt_context(uuid),
  app_billing_attempt_claim(uuid), app_billing_attempt_close(uuid, text), app_billing_attempt_result(text, text, boolean, text), app_billing_unsettled(interval), app_billing_unapplied(interval)
  from public, anon, authenticated, service_role;
--> statement-breakpoint
grant execute on function app_billing_paynow_check(uuid), app_billing_checkout_begin(uuid, text, bigint), app_billing_begin_attempt(uuid, int), app_billing_attempt_context(uuid),
  app_billing_attempt_claim(uuid), app_billing_attempt_close(uuid, text), app_billing_attempt_result(text, text, boolean, text), app_billing_unsettled(interval), app_billing_unapplied(interval)
  to frata_app;
