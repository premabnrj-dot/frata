-- Razorpay before real money (billing rework R5; billing plan 2026-11-08 "Open before real money"):
-- 1. Every billing capture carries the amount and currency the gateway reports: INR only, and the amount recorded is the
--    money that moved (a short capture leaves the rest due; more than due is kept in over_paid for a refund).
-- 2. A bank mandate (eNACH) counts only once the bank confirms it (token.confirmed): until then it is pending, never
--    debited, and never reopens a paused shop. UPI and card mandates are confirmed at set-up (their first payment).
drop function app_billing_attempt_result(text, text, boolean, text);
--> statement-breakpoint
create function app_billing_attempt_result(p_order text, p_payment_id text, p_captured boolean, p_reason text, p_amount bigint default null, p_currency text default null) returns boolean
  language plpgsql security definer set search_path = '' as $$
declare p record; n int; inv record; due bigint;
begin
  select id, invoice_id, tenant_id, amount, captured_at, failed_at, gateway_payment_id from public.frrata_payments where gateway_order_id = p_order for update into p;
  if p.id is null then return false; end if;
  if p.captured_at is not null then return false; end if;
  if p.failed_at is not null and not p_captured then return false; end if;
  -- Razorpay before real money (billing rework R5, security): a capture names what the gateway took. In INR only, and
  -- the money that moved is what is recorded (never the amount we asked for), so a short capture leaves the rest due.
  if p_captured and (p_amount is null or p_amount <= 0) then raise exception 'result: a capture needs its amount' using errcode = 'invalid_parameter_value'; end if;
  if p_captured and coalesce(p_currency, 'INR') <> 'INR' then
    p_captured := false; p_reason := 'Paid in ' || left(p_currency, 3) || ', not INR. Frrata will refund it';
  end if;
  if p_captured then
    select id, total from public.frrata_invoices where id = p.invoice_id for update into inv;
    due := inv.total - coalesce((select sum(amount) from public.frrata_payments where invoice_id = p.invoice_id and captured_at is not null), 0)
                     - coalesce((select sum(total) from public.frrata_credit_notes where invoice_id = p.invoice_id), 0);
  end if;
  update public.frrata_payments set gateway_payment_id = coalesce(p_payment_id, gateway_payment_id),
    amount = case when p_captured then p_amount else amount end,
    captured_at = case when p_captured then now() else null end, failed_at = case when p_captured then null else now() end,
    failure_reason = case when p_captured then null else left(coalesce(p_reason, 'declined'), 120) end,
    over_paid = case when p_captured then greatest(p_amount - greatest(due, 0), 0) else 0 end
   where id = p.id;
  get diagnostics n = row_count;
  if not p_captured then perform public.app_billing_notice(p.invoice_id, 'failed', p.amount, null); end if;
  return n = 1;
end $$;
--> statement-breakpoint
drop function app_complete_mandate(text, text);
--> statement-breakpoint
create function app_complete_mandate(p_order text, p_token text, p_confirmed boolean default true) returns boolean
  language plpgsql security definer set search_path = '' as $$
declare t uuid := public.app_current_tenant(); s record;
begin
  if t is null or coalesce(p_token, '') = '' then return false; end if;
  select * from public.billing_mandate_setups where gateway_order_id = p_order and tenant_id = t and completed_at is null for update into s;
  if s.id is null then return false; end if;
  -- eNACH is never confirmed at set-up: the bank takes a day or two (token.confirmed sets mandate_at).
  if s.method = 'emandate' then p_confirmed := false; end if;
  update public.billing_mandate_setups set completed_at = now() where id = s.id;
  insert into public.billing_accounts (tenant_id, gateway_customer_id, mandate_token_id, mandate_method, mandate_max, mandate_at, mandate_revoked_at)
    values (t, s.gateway_customer_id, p_token, s.method, s.max_amount, case when p_confirmed then now() end, null)
    on conflict (tenant_id) do update set gateway_customer_id = excluded.gateway_customer_id, mandate_token_id = excluded.mandate_token_id, mandate_method = excluded.mandate_method,
      mandate_max = excluded.mandate_max, mandate_at = excluded.mandate_at, mandate_revoked_at = null, updated_at = now();
  return true;
end $$;
--> statement-breakpoint
create or replace function app_apply_billing_event(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare e record; ord text; pay text; tok text; amt bigint; cur text;
begin
  select * from public.billing_events where id = p_id and applied_at is null for update into e;
  if e.id is null then return; end if;
  ord := e.payload #>> '{payload,payment,entity,order_id}';
  pay := e.payload #>> '{payload,payment,entity,id}';
  amt := nullif(e.payload #>> '{payload,payment,entity,amount}', '')::bigint;
  cur := e.payload #>> '{payload,payment,entity,currency}';
  tok := e.payload #>> '{payload,token,entity,id}';
  if e.type = 'payment.captured' and ord is not null and amt > 0 then perform public.app_billing_attempt_result(ord, pay, true, null, amt, cur);
  elsif e.type = 'payment.failed' and ord is not null then perform public.app_billing_attempt_result(ord, pay, false, e.payload #>> '{payload,payment,entity,error_description}');
  elsif e.type = 'token.confirmed' and tok is not null then
    update public.billing_accounts set mandate_at = now(), updated_at = now() where mandate_token_id = tok and mandate_at is null and mandate_revoked_at is null;
  elsif e.type in ('token.cancelled', 'token.rejected', 'token.paused') and tok is not null then
    update public.billing_accounts set mandate_revoked_at = now(), updated_at = now() where mandate_token_id = tok and mandate_revoked_at is null;
  end if;
  update public.billing_events set applied_at = now() where id = e.id;
end $$;
--> statement-breakpoint
revoke all on function app_billing_attempt_result(text, text, boolean, text, bigint, text), app_complete_mandate(text, text, boolean) from public, anon, authenticated, service_role;
--> statement-breakpoint
grant execute on function app_billing_attempt_result(text, text, boolean, text, bigint, text), app_complete_mandate(text, text, boolean) to frata_app;
