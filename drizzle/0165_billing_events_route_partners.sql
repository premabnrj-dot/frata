-- =============================================================================
-- 0165 · Frrata's billing webhook routes Studio credit payments (C1, orchestrator ruling 2026-11-22 option (a);
-- architecture M6, security M1/M3, tenancy M1). ONE inbox: billing_events stays the only store for Frrata's Razorpay
-- account. app_apply_billing_event now looks at each stored event once:
--   - a payment whose order is a partner's attempt → app_pc_apply (amount, INR and the SERVER's test mode, which the
--     route writes into the stored payload as `_test`; never a partner id or amount the payload claims as ours);
--   - a token.* event whose token is a partner's mandate → app_pc_token_event (token events carry no order);
--   - a dispute, or a refund Frrata didn't make, on a partner's payment → app_pc_dispute (credits clawed back);
--   - anything else → exactly what 0140 did for merchant billing, unchanged.
-- A partner event that fails (the invoice counter busy) raises, so the event stays unapplied for the next sweep.
-- =============================================================================
create or replace function app_apply_billing_event(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare e record; ord text; pay text; tok text; amt bigint; cur text; ptok text; rfd text; v_test boolean;
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
  v_test := coalesce((e.payload ->> '_test')::boolean, false);
  -- Studio credits: a partner's attempt, matched by OUR stored order id.
  if ord is not null and pay is not null and e.type in ('payment.captured', 'payment.failed')
     and exists (select 1 from public.partner_credit_purchases p where p.gateway_order_id = ord) then
    perform public.app_pc_apply(ord, pay, e.type = 'payment.captured', amt, cur, v_test,
      e.payload #>> '{payload,payment,entity,error_description}', ptok);
  elsif tok is not null and e.type like 'token.%' and exists (select 1 from public.partner_billing b where b.token_id = tok) then
    perform public.app_pc_token_event(tok, substr(e.type, 7));
  elsif pay is not null and (e.type like 'payment.dispute.%' or (e.type = 'refund.processed'
          and not exists (select 1 from public.partner_credit_purchases p where p.refund_gateway_id = rfd)))
     and exists (select 1 from public.partner_credit_purchases p where p.payment_id = coalesce(e.payload #>> '{payload,refund,entity,payment_id}', pay)) then
    perform public.app_pc_dispute(coalesce(e.payload #>> '{payload,refund,entity,payment_id}', pay));
  -- Merchant billing, as 0140.
  elsif e.type = 'payment.captured' and ord is not null and amt > 0 then perform public.app_billing_attempt_result(ord, pay, true, null, amt, cur);
  elsif e.type = 'payment.failed' and ord is not null then perform public.app_billing_attempt_result(ord, pay, false, e.payload #>> '{payload,payment,entity,error_description}');
  elsif e.type = 'token.confirmed' and tok is not null then
    update public.billing_accounts set mandate_at = now(), updated_at = now() where mandate_token_id = tok and mandate_at is null and mandate_revoked_at is null;
  elsif e.type in ('token.cancelled', 'token.rejected', 'token.paused') and tok is not null then
    update public.billing_accounts set mandate_revoked_at = now(), updated_at = now() where mandate_token_id = tok and mandate_revoked_at is null;
  end if;
  update public.billing_events set applied_at = now() where id = e.id;
end $$;
--> statement-breakpoint
revoke all on function app_apply_billing_event(uuid) from public, anon, authenticated, service_role, frata_builder, frata_admin;
--> statement-breakpoint
grant execute on function app_apply_billing_event(uuid) to frata_app;
