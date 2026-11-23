-- =============================================================================
-- 0165 · Frrata's billing webhook routes Studio credit payments (C1, orchestrator ruling 2026-11-22 option (a);
-- architecture M6, security M1/M3, tenancy M1). ONE inbox: billing_events stays the only store for Frrata's Razorpay
-- account. app_apply_billing_event now looks at each stored event once:
--   - a payment whose order is a partner's attempt → app_pc_apply (amount, INR and the SERVER's test mode, which the
--     route writes into the stored payload as `_test`; never a partner id or amount the payload claims as ours);
--   - a token.* event → the merchant's mandate as before AND a partner's by its token (token events carry no order);
--   - a dispute, or a refund Frrata didn't make, on a partner's payment → app_pc_dispute (credits clawed back);
--   - anything else → exactly what 0140 did for merchant billing, unchanged.
-- A partner event that fails (the invoice counter busy) raises, so the event stays unapplied for the next sweep; a refund
-- or dispute that arrives before its capture is applied waits the same way, up to 3 days (security review 2026-11-23).
-- =============================================================================
create or replace function app_apply_billing_event(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare e record; ord text; pay text; tok text; amt bigint; cur text; ptok text; rfd text; rpay text; v_test boolean;
begin
  select * from public.billing_events where id = p_id and applied_at is null for update into e;
  if e.id is null then return; end if;
  ord := e.payload #>> '{payload,payment,entity,order_id}';
  pay := e.payload #>> '{payload,payment,entity,id}';
  amt := nullif(e.payload #>> '{payload,payment,entity,amount}', '')::bigint;
  cur := e.payload #>> '{payload,payment,entity,currency}';
  ptok := e.payload #>> '{payload,payment,entity,token_id}';
  tok := e.payload #>> '{payload,token,entity,id}';
  rfd := e.payload #>> '{payload,refund,entity,id}';
  rpay := coalesce(e.payload #>> '{payload,refund,entity,payment_id}', pay);
  v_test := coalesce((e.payload ->> '_test')::boolean, false);
  -- Studio credits: a partner's attempt, matched by OUR stored order id.
  if ord is not null and pay is not null and e.type in ('payment.captured', 'payment.failed')
     and exists (select 1 from public.partner_credit_purchases p where p.gateway_order_id = ord) then
    perform public.app_pc_apply(ord, pay, e.type = 'payment.captured', amt, cur, v_test,
      e.payload #>> '{payload,payment,entity,error_description}', ptok);
  -- A refund or dispute on a partner's attempt whose capture isn't applied yet waits (security M1): it stays unapplied
  -- for the next sweep, up to 3 days, so credits are never left behind money that went back.
  elsif ord is not null and rpay is not null and (e.type like 'payment.dispute.%' or e.type = 'refund.processed')
     and e.received_at > now() - interval '3 days'
     and exists (select 1 from public.partner_credit_purchases p where p.gateway_order_id = ord and p.paid_at is null)
     and not exists (select 1 from public.partner_credit_purchases p where p.payment_id = rpay and p.paid_at is not null)
     and not exists (select 1 from public.partner_credit_purchases p where p.refund_payment_id = rpay or (rfd is not null and p.refund_gateway_id = rfd)) then
    raise exception 'not_yet' using errcode = 'P0001';
  elsif rpay is not null and (e.type like 'payment.dispute.%' or (e.type = 'refund.processed' and rfd is not null
          and not exists (select 1 from public.partner_credit_purchases p where p.refund_payment_id = rpay)
          and not exists (select 1 from public.partner_credit_purchases p where p.refund_gateway_id = rfd)))
     and exists (select 1 from public.partner_credit_purchases p where p.payment_id = rpay) then
    perform public.app_pc_dispute(rpay);
  -- Merchant billing, as 0140 (a token event below runs for both families: one token is never decided by one alone).
  elsif e.type = 'payment.captured' and ord is not null and amt > 0 then perform public.app_billing_attempt_result(ord, pay, true, null, amt, cur);
  elsif e.type = 'payment.failed' and ord is not null then perform public.app_billing_attempt_result(ord, pay, false, e.payload #>> '{payload,payment,entity,error_description}');
  elsif e.type = 'token.confirmed' and tok is not null then
    update public.billing_accounts set mandate_at = now(), updated_at = now() where mandate_token_id = tok and mandate_at is null and mandate_revoked_at is null;
  elsif e.type in ('token.cancelled', 'token.rejected', 'token.paused') and tok is not null then
    update public.billing_accounts set mandate_revoked_at = now(), updated_at = now() where mandate_token_id = tok and mandate_revoked_at is null;
  end if;
  -- A partner's mandate by its token (token events carry no order; tenancy audit 2026-11-23: never only one family).
  if tok is not null and e.type like 'token.%' then perform public.app_pc_token_event(tok, substr(e.type, 7)); end if;
  update public.billing_events set applied_at = now() where id = e.id;
end $$;
--> statement-breakpoint
revoke all on function app_apply_billing_event(uuid) from public, anon, authenticated, service_role, frata_builder, frata_admin;
--> statement-breakpoint
grant execute on function app_apply_billing_event(uuid) to frata_app;
