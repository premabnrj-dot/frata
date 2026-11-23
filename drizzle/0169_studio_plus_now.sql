-- =============================================================================
-- 0169 · C1·B Move to Studio Plus now (owner 2026-11-23, option B; plan docs/plans/2026-11-22-c1-credits.md § Follow-up
-- C1·B with its three reviews; mockup docs/mockups/2026-11-22-c1-undrawn.html § plus-now, approved 2026-11-23).
-- Redefines 0164's definers with their exact signatures (grants kept and re-run below; tenancy H2), and moves mandate
-- cancels onto the queue 0168 made:
--   - buy: Studio → Studio Plus at once; Studio's renewal with the bank makes it wait; one start being paid at a time;
--   - claim: a Studio renewal is never claimed while a start from the last 30 minutes is open (no two months on a day);
--   - apply: a start buys only with a valid token, no newer seat, and no renewal of the old seat claimed after it began;
--     it ends the old seat by partner, closes that seat's unclaimed renewal, queues the old mandate's cancel, and marks the
--     new one revoked if its token was already cancelled; a renewal buys only its own live period; a refunded start's
--     mandate is queued for cancelling; nothing on an ended seat is marked failed or emailed;
--   - close and seat end: likewise; mandate cancels from the queue, with tries and the reason kept.
-- =============================================================================
create or replace function app_partner_credits_overview(p_uid uuid, p_session uuid, p_stepup text, p_real boolean) returns jsonb
  language plpgsql stable security definer set search_path = '' as $$
declare o record; v_month timestamptz := (date_trunc('month', now() at time zone 'Asia/Kolkata')) at time zone 'Asia/Kolkata';
begin
  select * into o from public.app_pc_owner(p_uid, p_session, p_stepup, false, false);
  return (select jsonb_build_object(
    'balance', public.app_pc_balance(o.partner_id, p_real),
    'held', coalesce((select sum(u.reserved - coalesce((select sum(e.credits) from public.partner_credit_entries e where e.use_id = u.id and e.kind in ('release', 'return')), 0)) from public.partner_credit_uses u
                       where u.partner_id = o.partner_id and u.closed_at is null), 0),
    'heldBy', (select count(*) from public.partner_credit_uses u where u.partner_id = o.partner_id and u.closed_at is null),
    'usedSince', v_month,
    'used', coalesce((select sum(u.reserved - coalesce((select sum(e.credits) from public.partner_credit_entries e where e.use_id = u.id and e.kind in ('release', 'return')), 0)) from public.partner_credit_uses u
                       where u.partner_id = o.partner_id and u.closed_at is not null and u.created_at >= v_month), 0),
    'lots', coalesce((select jsonb_agg(jsonb_build_object('kind', x.kind, 'left', x.left_credits, 'credits', x.credits,
                        'expiresAt', x.expires_at, 'createdAt', x.created_at, 'test', x.test) order by x.expires_at, x.created_at)
                      from public.app_pc_lots(o.partner_id, p_real) x where x.left_credits > 0), '[]'::jsonb),
    'seat', (select jsonb_build_object('plan', s.plan, 'nextPlan', s.next_plan, 'method', s.method, 'test', s.test,
                'startedAt', s.started_at, 'periodEnd', s.period_end, 'cancelAt', s.cancel_at, 'failedAt', s.failed_at, 'endedAt', s.ended_at)
             from public.partner_seats s where s.partner_id = o.partner_id and s.ended_at is null),
    'mandate', (select jsonb_build_object('method', b.mandate_method, 'max', b.mandate_max, 'live', b.mandate_revoked_at is null)
                from public.partner_billing b where b.partner_id = o.partner_id and b.token_id is not null),
    'alerts', (select jsonb_build_object('low', b.alert_low, 'budget', b.alert_budget) from public.partner_billing b where b.partner_id = o.partner_id),
    'newSiteBudget', coalesce((select b.new_site_budget from public.partner_billing b where b.partner_id = o.partner_id), 300),
    'hasDetails', exists (select 1 from public.partner_billing b where b.partner_id = o.partner_id
                           and b.legal_name is not null and b.state_code is not null and b.address is not null),
    'hasInvoices', exists (select 1 from public.partner_invoices i where i.partner_id = o.partner_id),
    'waiting', (select jsonb_build_object('id', p.id, 'kind', p.kind, 'total', p.total, 'createdAt', p.created_at)
                from public.partner_credit_purchases p
                where p.partner_id = o.partner_id and p.kind in ('pack','credits','seat_start') and p.gateway_order_id is not null
                  and p.paid_at is null and p.failed_at is null and p.closed_at is null and p.created_at > now() - interval '1 day'
                order by p.created_at desc limit 1),
    'renewalFailed', (select jsonb_build_object('total', p.total, 'forPeriodEnd', p.for_period_end, 'failedAt', s.failed_at)
                      from public.partner_seats s join public.partner_credit_purchases p on p.seat_id = s.id and p.kind = 'seat_renewal'
                      where s.partner_id = o.partner_id and s.ended_at is null and s.failed_at is not null
                      order by p.created_at desc limit 1),
    -- C1·B: the live seat's renewal for this period, if one is open (Move to Studio Plus shows it as stopped, or waits
    -- while it is with the bank), and whether an old mandate is still being cancelled.
    'renewalOpen', (select jsonb_build_object('total', p.total, 'forPeriodEnd', p.for_period_end, 'claimed', p.claimed_at is not null)
                    from public.partner_seats s join public.partner_credit_purchases p
                      on p.partner_id = s.partner_id and p.seat_id = s.id and p.kind = 'seat_renewal' and p.for_period_end = s.period_end
                    where s.partner_id = o.partner_id and s.ended_at is null
                      and p.paid_at is null and p.failed_at is null and p.closed_at is null and p.refund_due_at is null
                    order by p.created_at desc limit 1),
    'cancelling', exists (select 1 from public.partner_mandate_cancels m where m.partner_id = o.partner_id and m.cancelled_at is null)));
end $$;
--> statement-breakpoint

create or replace function app_partner_credits_payments(p_uid uuid, p_session uuid, p_stepup text) returns jsonb
  language plpgsql stable security definer set search_path = '' as $$
declare o record;
begin
  select * into o from public.app_pc_owner(p_uid, p_session, p_stepup, false, false);
  return jsonb_build_object(
    'purchases', coalesce((select jsonb_agg(r order by r.at desc) from (
      select p.id, p.created_at as at, p.kind, p.credits, p.plan, p.total, p.test, p.paid_at, p.failed_at, p.closed_at,
             p.gateway_order_id is not null as sent, p.refund_due_at, p.refunded_at, i.id as invoice_id, i.number as invoice_number
        from public.partner_credit_purchases p left join public.partner_invoices i on i.purchase_id = p.id and i.partner_id = p.partner_id
       where p.partner_id = o.partner_id and p.created_at > now() - interval '24 months'
         and (p.gateway_order_id is not null or p.kind = 'seat_renewal')
       order by p.created_at desc limit 200) r), '[]'::jsonb),
    'details', (select jsonb_build_object('legalName', b.legal_name, 'gstin', b.gstin, 'stateCode', b.state_code, 'address', b.address,
                  'email', b.invoice_email, 'gstinLocked', exists (select 1 from public.partner_invoices i where i.partner_id = o.partner_id
                     and not i.test and i.buyer_gstin is not distinct from b.gstin and b.gstin is not null))
                from public.partner_billing b where b.partner_id = o.partner_id),
    'mandate', (select jsonb_build_object('method', b.mandate_method, 'max', b.mandate_max, 'live', b.mandate_revoked_at is null)
                from public.partner_billing b where b.partner_id = o.partner_id and b.token_id is not null),
    -- C1·B: an old mandate still being cancelled ("Old Studio AutoPay · Cancelling", as drawn).
    'cancelling', exists (select 1 from public.partner_mandate_cancels m where m.partner_id = o.partner_id and m.cancelled_at is null));
end $$;
--> statement-breakpoint

create or replace function app_partner_credit_buy(p_uid uuid, p_session uuid, p_stepup text, p_kind text, p_credits integer,
  p_plan text, p_method text, p_mandate_max bigint, p_taxable bigint, p_cgst bigint, p_sgst bigint, p_igst bigint, p_test boolean,
  p_invoice_test boolean, p_seller_name text, p_seller_gstin text, p_seller_address text, p_sac text, p_prefix text, p_fy text)
  returns table (id uuid, receipt text, total bigint)
  language plpgsql volatile security definer set search_path = '' as $$
declare o record; b record; s record; v_id uuid := gen_random_uuid();
begin
  if p_kind not in ('pack', 'credits', 'seat_start') then raise exception 'bad_input' using errcode = 'P0001'; end if;
  select * into o from public.app_pc_owner(p_uid, p_session, p_stepup, p_kind = 'seat_start', p_kind = 'seat_start');
  select * into b from public.partner_billing pb where pb.partner_id = o.partner_id;
  if b.legal_name is null or b.state_code is null or b.address is null then raise exception 'details_first' using errcode = 'P0001'; end if;
  if p_kind = 'seat_start' then
    if p_plan not in ('studio', 'plus') or p_method not in ('upi', 'card') or p_mandate_max is null then raise exception 'bad_input' using errcode = 'P0001'; end if;
    -- Under the partner's credits lock: the hourly claim takes the same lock, so a renewal is never claimed between this
    -- check and the start's row (C1·B, security H1).
    set local lock_timeout = '2s';
    perform pg_advisory_xact_lock(hashtextextended(o.partner_id::text || ':credits', 0));
    select * into s from public.partner_seats ps where ps.partner_id = o.partner_id and ps.ended_at is null;
    -- One live seat, except Studio → Studio Plus at once (owner 2026-11-23, option B) or paying a seat whose renewal
    -- failed (the banner's Pay). Every other move waits for the renewal (security L1).
    if s.id is not null and s.failed_at is null and not (s.plan = 'studio' and p_plan = 'plus') then
      raise exception 'has_seat' using errcode = 'P0001'; end if;
    -- Studio's renewal for this period already with the bank (a failed seat's retry too): the move or the banner's Pay
    -- waits, so two months are never taken (B2, security M3; 2nd review M2).
    if s.id is not null and exists (select 1 from public.partner_credit_purchases x
        where x.partner_id = o.partner_id and x.seat_id = s.id and x.kind = 'seat_renewal' and x.for_period_end = s.period_end
          and x.claimed_at is not null and x.paid_at is null and x.failed_at is null and x.closed_at is null and x.refund_due_at is null) then
      raise exception 'renewal_paying' using errcode = 'P0001'; end if;
    -- One start being paid at a time: another sent to the gateway in the last 10 minutes waits (security H2).
    if exists (select 1 from public.partner_credit_purchases x where x.partner_id = o.partner_id and x.kind = 'seat_start'
        and x.gateway_order_id is not null and x.paid_at is null and x.failed_at is null and x.closed_at is null
        and x.refund_due_at is null and x.created_at > now() - interval '10 minutes') then
      raise exception 'start_open' using errcode = 'P0001'; end if;
  elsif p_plan is not null or p_method is not null or p_mandate_max is not null then raise exception 'bad_input' using errcode = 'P0001';
  end if;
  -- The heads follow the place of supply, the buyer's state frozen here (architecture review 2026-11-23).
  if (left(coalesce(p_seller_gstin, ''), 2) = b.state_code) <> (p_igst = 0 and p_cgst + p_sgst > 0) then
    raise exception 'bad_input' using errcode = 'P0001'; end if;
  insert into public.partner_credit_purchases (id, partner_id, kind, credits, plan, method, mandate_max, taxable, cgst, sgst, igst, total,
    test, invoice_test, buyer_name, buyer_gstin, buyer_state, buyer_address, seller_name, seller_gstin, seller_address, sac, prefix, fy,
    receipt, created_by)
  values (v_id, o.partner_id, p_kind, p_credits, p_plan, p_method, p_mandate_max, p_taxable, p_cgst, p_sgst, p_igst,
    p_taxable + p_cgst + p_sgst + p_igst, p_test, p_invoice_test or p_test, b.legal_name, b.gstin, b.state_code, b.address,
    p_seller_name, nullif(p_seller_gstin, ''), p_seller_address, p_sac, p_prefix, p_fy, 'pc_' || replace(v_id::text, '-', ''), o.member_id);
  return query select v_id, 'pc_' || replace(v_id::text, '-', ''), p_taxable + p_cgst + p_sgst + p_igst;
end $$;
--> statement-breakpoint

create or replace function app_pc_claim(p_purchase uuid) returns boolean
  language plpgsql volatile security definer set search_path = '' as $$
declare p record; n integer;
begin
  select x.id, x.partner_id, x.kind into p from public.partner_credit_purchases x where x.id = p_purchase;
  if p.id is null then return false; end if;
  if p.kind = 'seat_renewal' then
    -- The partner's lock (buy takes it too), then no claim while a start from the last 30 minutes is open (C1·B, security H1).
    set local lock_timeout = '2s';
    perform pg_advisory_xact_lock(hashtextextended(p.partner_id::text || ':credits', 0));
    if exists (select 1 from public.partner_credit_purchases x where x.partner_id = p.partner_id and x.kind = 'seat_start'
        and x.gateway_order_id is not null and x.paid_at is null and x.failed_at is null and x.closed_at is null and x.refund_due_at is null
        and x.created_at > now() - interval '30 minutes') then return false; end if;
  end if;
  update public.partner_credit_purchases set claimed_at = now()
   where id = p_purchase and claimed_at is null and paid_at is null and failed_at is null and closed_at is null;
  get diagnostics n = row_count;
  return n = 1;
end $$;
--> statement-breakpoint

-- Internal: a mandate no longer used goes on the cancel queue (once a token; never overwriting another; security M1).
create or replace function app_pc_cancel_mandate(p_partner uuid, p_token text) returns void
  language sql volatile security definer set search_path = '' as $$
  insert into public.partner_mandate_cancels (partner_id, token_id)
  select p_partner, p_token where p_token ~ '^token_[A-Za-z0-9]{6,40}$'
  on conflict (partner_id, token_id) do nothing
$$;
--> statement-breakpoint

create or replace function app_pc_apply(p_order text, p_payment text, p_captured boolean, p_amount bigint, p_currency text,
  p_test boolean, p_reason text, p_token text) returns text
  language plpgsql volatile security definer set search_path = '' as $$
declare p record; v_seat uuid; v_old uuid; v_lot text; v_inv uuid; v_old_token text; v_buys boolean; v_token boolean;
begin
  select * into p from public.partner_credit_purchases x where x.gateway_order_id = p_order for update;
  if p.id is null then return 'unknown'; end if;
  if p_payment is null or p_payment !~ '^pay_[A-Za-z0-9]{6,40}$' then raise exception 'bad_input' using errcode = 'P0001'; end if;
  if exists (select 1 from public.partner_credit_purchases x where x.payment_id = p_payment and x.id <> p.id) then return 'duplicate'; end if;
  if p.paid_at is not null and p.payment_id = p_payment then return 'duplicate'; end if;
  v_token := p_token is not null and p_token ~ '^token_[A-Za-z0-9]{6,40}$';
  if not coalesce(p_captured, false) then
    if p.paid_at is not null or p.failed_at is not null or p.closed_at is not null then return 'ignored'; end if;
    update public.partner_credit_purchases set failed_at = now(), failed_reason = left(coalesce(p_reason, 'The bank declined it'), 160),
      payment_id = case when exists (select 1 from public.partner_credit_purchases y where y.payment_id = p_payment) then payment_id else p_payment end
     where id = p.id;
    -- A renewal of a seat that has ended (moved to Studio Plus) is no failure of the plan: no mark, no email (security M4).
    if p.kind = 'seat_renewal' and exists (select 1 from public.partner_seats s where s.id = p.seat_id and s.partner_id = p.partner_id and s.ended_at is null) then
      update public.partner_seats set failed_at = coalesce(failed_at, now()) where id = p.seat_id and partner_id = p.partner_id;
      perform public.app_pc_notice(p.partner_id, 'renewal_failed', 'rfail:' || p.id, null, p.id);
    end if;
    return 'failed';
  end if;
  -- A payment whose refund is booked never buys later (the hourly settle or a confirm asking again; security 2nd review H1).
  -- Another payment on the same attempt still can (a wrong amount refunded, then the right one).
  v_buys := p.paid_at is null and p.refund_payment_id is distinct from p_payment and p_amount = p.total and p_currency = 'INR' and p_test = p.test;
  if v_buys and p.kind = 'seat_start' then
    v_buys := v_token  -- a seat moves only with its mandate (security M2)
      -- a newer seat started after this attempt (another start won)
      and not exists (select 1 from public.partner_seats ns where ns.partner_id = p.partner_id and ns.ended_at is null and ns.started_at > p.created_at)
      -- the old seat's renewal claimed after this attempt began, still at the bank or paid: two months are never taken (B2, H1)
      and not exists (select 1 from public.partner_seats os join public.partner_credit_purchases r
                        on r.partner_id = os.partner_id and r.seat_id = os.id and r.kind = 'seat_renewal'
                       where os.partner_id = p.partner_id and os.ended_at is null
                         and (r.claimed_at >= p.created_at or r.paid_at >= p.created_at)
                         and r.failed_at is null and r.closed_at is null and r.refund_due_at is null);
  elsif v_buys and p.kind = 'seat_renewal' then
    -- A renewal buys only its own live period: the seat is live and still at the period it was noticed for (tenancy M1, L2).
    v_buys := exists (select 1 from public.partner_seats s where s.id = p.seat_id and s.partner_id = p.partner_id
                       and s.ended_at is null and s.period_end = p.for_period_end);
  end if;
  if v_buys then
    update public.partner_credit_purchases set paid_at = now(), failed_at = null, failed_reason = null, closed_at = null, closed_reason = null,
      payment_id = p_payment where id = p.id;
    v_lot := case p.kind when 'pack' then 'pack' when 'credits' then 'credits' else 'seat' end;
    insert into public.partner_credit_entries (partner_id, kind, credits, purchase_id, expires_at, test)
      values (p.partner_id, v_lot, p.credits, p.id, now() + interval '12 months', p.test);
    if p.kind = 'seat_start' then
      -- The old seat, by partner; its renewal not yet claimed stops here, closed, never failed (option B, tenancy H1).
      update public.partner_seats set ended_at = now() where partner_id = p.partner_id and ended_at is null returning id into v_old;
      if v_old is not null then
        update public.partner_credit_purchases set closed_at = now(), closed_reason = 'Moved to Studio Plus'
         where partner_id = p.partner_id and seat_id = v_old and kind = 'seat_renewal' and claimed_at is null
           and paid_at is null and failed_at is null and closed_at is null and refund_due_at is null;
      end if;
      insert into public.partner_seats (partner_id, plan, method, test, started_at, period_end)
        values (p.partner_id, p.plan, p.method, p.test, now(), now() + interval '1 month') returning id into v_seat;
      select b.token_id into v_old_token from public.partner_billing b where b.partner_id = p.partner_id;
      if v_old_token is not null and v_old_token <> p_token then perform public.app_pc_cancel_mandate(p.partner_id, v_old_token); end if;
      update public.partner_billing set token_id = p_token, mandate_method = p.method, mandate_max = p.mandate_max, mandate_at = now(),
        -- a token cancelled, rejected or paused before its capture was applied stays revoked (security L3)
        mandate_revoked_at = case when exists (select 1 from public.billing_events e where e.type in ('token.cancelled', 'token.rejected', 'token.paused')
                                                 and e.payload #>> '{payload,token,entity,id}' = p_token) then now() end,
        updated_at = now()
       where partner_id = p.partner_id;
    elsif p.kind = 'seat_renewal' then
      -- The plan the money was taken for, frozen at notice (impact review: a change after the notice waits a period).
      update public.partner_seats set period_end = p.for_period_end + interval '1 month', plan = p.plan,
        next_plan = case when next_plan = p.plan then null else next_plan end, failed_at = null
       where id = p.seat_id and partner_id = p.partner_id and period_end = p.for_period_end;
    end if;
    v_inv := public.app_pc_issue(p.id);
    perform public.app_pc_notice(p.partner_id, 'paid', 'paid:' || p.id, null, p.id);
    return 'applied';
  end if;
  -- Money taken that buys nothing: a second capture, a wrong amount, currency or mode, a start that lost, a renewal of a
  -- period gone. A refunded start's own mandate goes on the cancel queue (security H2), unless it is the live one.
  if p.kind = 'seat_start' and v_token and not exists (select 1 from public.partner_billing b where b.partner_id = p.partner_id and b.token_id = p_token) then
    perform public.app_pc_cancel_mandate(p.partner_id, p_token);
  end if;
  -- Its own row excluded: a payment that failed first (its id kept) and was then captured wrong is refunded (security L6).
  if p.refund_due_at is null and not exists (select 1 from public.partner_credit_purchases y where y.payment_id = p_payment and y.id <> p.id) then
    update public.partner_credit_purchases set refund_due_at = now(), refund_payment_id = p_payment, refund_amount = p_amount where id = p.id;
    return 'refund_due';
  end if;
  return 'refund_pending';
end $$;
--> statement-breakpoint

create or replace function app_pc_close(p_purchase uuid, p_reason text) returns boolean
  language plpgsql volatile security definer set search_path = '' as $$
declare p record;
begin
  select * into p from public.partner_credit_purchases x where x.id = p_purchase and x.paid_at is null and x.failed_at is null and x.closed_at is null for update;
  if p.id is null then return false; end if;
  -- A renewal of a live seat that never came back is a failed try; of an ended seat, simply closed (security M4).
  if p.kind = 'seat_renewal' and exists (select 1 from public.partner_seats s where s.id = p.seat_id and s.partner_id = p.partner_id and s.ended_at is null) then
    update public.partner_credit_purchases set failed_at = now(), failed_reason = left(p_reason, 160) where id = p.id;
    update public.partner_seats set failed_at = coalesce(failed_at, now()) where id = p.seat_id and partner_id = p.partner_id;
    perform public.app_pc_notice(p.partner_id, 'renewal_failed', 'rfail:' || p.id, null, p.id);
  else
    update public.partner_credit_purchases set closed_at = now(), closed_reason = left(p_reason, 80) where id = p.id;
  end if;
  return true;
end $$;
--> statement-breakpoint

create or replace function app_pc_seat_end(p_seat uuid, p_lapsed boolean) returns boolean
  language plpgsql volatile security definer set search_path = '' as $$
declare s record; v_token text;
begin
  update public.partner_seats set ended_at = now() where id = p_seat and ended_at is null returning * into s;
  if s.id is null then return false; end if;
  update public.partner_credit_purchases set closed_at = now(), closed_reason = 'The seat ended'
   where partner_id = s.partner_id and seat_id = s.id and paid_at is null and failed_at is null and closed_at is null and claimed_at is null;
  select b.token_id into v_token from public.partner_billing b where b.partner_id = s.partner_id;
  if v_token is not null then perform public.app_pc_cancel_mandate(s.partner_id, v_token); end if;
  update public.partner_billing set token_id = null, mandate_method = null, mandate_max = null, updated_at = now()
   where partner_id = s.partner_id and token_id is not null;
  return true;
end $$;
--> statement-breakpoint

-- Mandates to cancel at the gateway, oldest due first (an attempt before the request: the queue row, then cancelled_at).
create or replace function app_pc_token_cancels(p_limit integer) returns table (partner_id uuid, customer_id text, token_id text)
  language sql stable security definer set search_path = '' as $$
  select m.partner_id, b.customer_id, m.token_id from public.partner_mandate_cancels m
    left join public.partner_billing b on b.partner_id = m.partner_id
   where m.cancelled_at is null and m.due_at <= now()
     and m.token_id is distinct from b.token_id  -- never the mandate the live seat pays with (security 2nd review H1)
   order by m.due_at limit least(p_limit, 100)
$$;
--> statement-breakpoint
create or replace function app_pc_token_cancelled(p_partner uuid, p_token text) returns void
  language sql volatile security definer set search_path = '' as $$
  update public.partner_mandate_cancels set cancelled_at = now(), error = null
   where partner_id = p_partner and token_id = p_token and cancelled_at is null
$$;
--> statement-breakpoint
-- A cancel that failed: its tries and reason kept for staff (A1a), tried again next hour (security M1).
create or replace function app_pc_token_cancel_tried(p_partner uuid, p_token text, p_error text) returns void
  language sql volatile security definer set search_path = '' as $$
  update public.partner_mandate_cancels set tries = least(tries + 1, 32000), error = left(p_error, 40), due_at = now() + interval '1 hour'
   where partner_id = p_partner and token_id = p_token and cancelled_at is null
$$;
--> statement-breakpoint

-- A token event by its id (tokens are unique: partner_billing_token). A cancelled one also settles its row on the cancel
-- queue, so "Cancelling" clears even when the gateway answers a second cancel with an error (2nd review L4).
create or replace function app_pc_token_event(p_token text, p_status text) returns boolean
  language plpgsql volatile security definer set search_path = '' as $$
declare n integer; q integer := 0;
begin
  if p_status = 'confirmed' then
    update public.partner_billing set mandate_at = coalesce(mandate_at, now()), updated_at = now() where token_id = p_token and mandate_revoked_at is null;
  elsif p_status in ('cancelled', 'rejected', 'paused') then
    update public.partner_billing set mandate_revoked_at = coalesce(mandate_revoked_at, now()), updated_at = now() where token_id = p_token;
  else return false;
  end if;
  get diagnostics n = row_count;
  if p_status in ('cancelled', 'rejected') then
    update public.partner_mandate_cancels set cancelled_at = now(), error = null where token_id = p_token and cancelled_at is null;
    get diagnostics q = row_count;
  end if;
  return n + q > 0;
end $$;
--> statement-breakpoint

-- ═══ GRANTS: 0164's, re-run for every function redefined here, and the new ones (tenancy H2) ═══
revoke all on function app_partner_credits_overview(uuid, uuid, text, boolean), app_partner_credits_payments(uuid, uuid, text),
  app_partner_credit_buy(uuid, uuid, text, text, integer, text, text, bigint, bigint, bigint, bigint, bigint, boolean, boolean, text, text, text, text, text, text),
  app_pc_claim(uuid), app_pc_apply(text, text, boolean, bigint, text, boolean, text, text), app_pc_close(uuid, text),
  app_pc_seat_end(uuid, boolean), app_pc_token_cancels(integer), app_pc_token_cancelled(uuid, text),
  app_pc_token_cancel_tried(uuid, text, text), app_pc_cancel_mandate(uuid, text), app_pc_token_event(text, text)
  from public, anon, authenticated, service_role, frata_builder, frata_app, frata_admin;
--> statement-breakpoint
grant execute on function app_partner_credits_overview(uuid, uuid, text, boolean), app_partner_credits_payments(uuid, uuid, text),
  app_partner_credit_buy(uuid, uuid, text, text, integer, text, text, bigint, bigint, bigint, bigint, bigint, boolean, boolean, text, text, text, text, text, text),
  app_pc_claim(uuid), app_pc_apply(text, text, boolean, bigint, text, boolean, text, text), app_pc_close(uuid, text),
  app_pc_seat_end(uuid, boolean), app_pc_token_cancels(integer), app_pc_token_cancelled(uuid, text),
  app_pc_token_cancel_tried(uuid, text, text), app_pc_token_event(text, text)
  to frata_app;
