-- =============================================================================
-- 0164 · C1 Studio credits: the only door to 0163's tables (plan docs/plans/2026-11-22-c1-credits.md with its five reviews
-- of 2026-11-22; proof scripts/verify/tenancy.sql § 89).
-- Four families of definers (architecture B2):
--   PERSON  (p_uid, p_session, p_stepup): the partner from the caller's live membership (app_pm_live), the passkey check
--           re-run (app_partner_need; the real check, fresh, for billing details and seat changes: security M4); every id
--           matched on the caller's partner ('not_found' otherwise). Writes are the partner owner's (owner call 3); a
--           Lead reads its assigned clients' budgets; a Builder reads only a client's used and budget in Studio's panel.
--   SYSTEM  (ids only): the purchase, renewal, refund, notice and ledger work the server does with no person — applying
--           a payment the server fetched or a verified webhook stored, the hourly run. Callers pinned by check:actions.
--   TURN- and SITE-KEYED: V3a and V2a add theirs (a turn's or a site's own row names the partner); none in C1.
--   ADMIN   one aggregate: the partner invoices' GST rows for Frrata's export (architecture B1). Nothing else.
-- A credit balance is a sum over the ledger, never stored. No definer updates or deletes a ledger row.
-- Every function: search_path '', revoked from public, anon, authenticated, service_role, frata_builder, frata_admin,
-- then one grant each.
-- =============================================================================

-- ── Internal: the owner behind a person call (no grant). ──
create or replace function app_pc_owner(p_uid uuid, p_session uuid, p_stepup text, p_fresh boolean, p_real boolean,
  out member_id uuid, out partner_id uuid)
  language plpgsql stable security definer set search_path = '' as $$
begin
  select x.member_id, x.partner_id into member_id, partner_id from public.app_pm_live(p_uid) x where x.role = 'owner';
  if member_id is null then raise exception 'not_owner' using errcode = 'P0001'; end if;
  if p_real then perform public.app_partner_need_real(p_uid, p_session, p_stepup, p_fresh);
  else perform public.app_partner_need(p_uid, p_session, p_stepup, p_fresh); end if;
end $$;
--> statement-breakpoint

-- ── Internal: a partner's live lots, soonest use-by first, with what is left on each (no grant). Test lots only where
--    money is not real (security H1: on Production a test lot never pays for anything). ──
create or replace function app_pc_lots(p_partner uuid, p_real boolean) returns table (
  lot_id uuid, kind text, credits integer, left_credits integer, expires_at timestamptz, created_at timestamptz, test boolean)
  language sql stable security definer set search_path = '' as $$
  select l.id, l.kind, l.credits,
    (l.credits + coalesce((select sum(d.credits) from public.partner_credit_entries d where d.lot_id = l.id), 0))::integer,
    l.expires_at, l.created_at, l.test
  from public.partner_credit_entries l
  where l.partner_id = p_partner and l.kind in ('grant','pack','credits','seat','return') and l.expires_at > now()
    and (not p_real or not l.test)
  order by l.expires_at, l.created_at, l.id
$$;
--> statement-breakpoint

create or replace function app_pc_balance(p_partner uuid, p_real boolean) returns integer
  language sql stable security definer set search_path = '' as $$
  select coalesce(sum(greatest(x.left_credits, 0)), 0)::integer from public.app_pc_lots(p_partner, p_real) x
$$;
--> statement-breakpoint

-- What a use was charged: its reserve less what came back (releases and return lots). An open use counts whole.
create or replace function app_pc_charged(p_use uuid) returns integer
  language sql stable security definer set search_path = '' as $$
  select (u.reserved - coalesce((select sum(e.credits) from public.partner_credit_entries e
                                  where e.use_id = u.id and e.kind in ('release','return')), 0))::integer
  from public.partner_credit_uses u where u.id = p_use
$$;
--> statement-breakpoint

-- ── Internal: a client's budget window. Before handover "For the build" (since the link was made); once the store has
--    an owner "Each month" (since the 1st, IST). Derived, never stored (architecture minor 12). ──
create or replace function app_pc_window(p_link uuid, out kind text, out starts_at timestamptz)
  language sql stable security definer set search_path = '' as $$
  select case when o.owner then 'month' else 'build' end,
         case when o.owner then (date_trunc('month', now() at time zone 'Asia/Kolkata')) at time zone 'Asia/Kolkata' else l.created_at end
  from public.partner_links l
  cross join lateral (select exists (select 1 from public.members m where m.tenant_id = l.tenant_id and m.role = 'owner') as owner) o
  where l.id = p_link
$$;
--> statement-breakpoint

create or replace function app_pc_link_used(p_partner uuid, p_link uuid) returns integer
  language sql stable security definer set search_path = '' as $$
  select coalesce(sum(public.app_pc_charged(u.id)), 0)::integer
  from public.partner_credit_uses u, public.app_pc_window(p_link) w
  where u.partner_id = p_partner and u.link_id = p_link and u.created_at >= w.starts_at
$$;
--> statement-breakpoint

-- ── Internal: queue an email (ids only, words at send). A dedupe key makes each one once. ──
create or replace function app_pc_notice(p_partner uuid, p_kind text, p_dedupe text, p_link uuid default null, p_purchase uuid default null) returns void
  language sql volatile security definer set search_path = '' as $$
  insert into public.partner_credit_notices (partner_id, kind, link_id, purchase_id, dedupe)
  values (p_partner, p_kind, p_link, p_purchase, p_dedupe) on conflict (dedupe) do nothing
$$;
--> statement-breakpoint

-- ── The free 20 (decision 20; owner 2026-11-22: at Admin approval, 90 days, once per partner here and once per PAN when
--    billing details name one). Approval is a plain update in src/lib/admin/partners.ts, so a trigger grants: frata_admin
--    gets no credit definer (architecture minor 14). The billing row is made with it, so a reserve always has a row. ──
create or replace function app_pc_on_partner_approved() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if new.approved_at is not null and (tg_op = 'INSERT' or old.approved_at is null) and new.declined_at is null then
    insert into public.partner_billing (partner_id) values (new.id) on conflict (partner_id) do nothing;
    insert into public.partner_credit_entries (partner_id, kind, credits, expires_at)
      values (new.id, 'grant', 20, now() + interval '90 days') on conflict do nothing;
  end if;
  return new;
end $$;
--> statement-breakpoint
create trigger partners_credit_grant after insert or update of approved_at on partners
  for each row execute function app_pc_on_partner_approved();
--> statement-breakpoint
-- Partners approved before C1: their billing row and the free 20 once, from the day this runs (owner 2026-11-22, b).
insert into partner_billing (partner_id) select p.id from partners p where p.approved_at is not null and p.declined_at is null
  on conflict (partner_id) do nothing;
--> statement-breakpoint
insert into partner_credit_entries (partner_id, kind, credits, expires_at)
  select p.id, 'grant', 20, now() + interval '90 days' from partners p where p.approved_at is not null and p.declined_at is null
  on conflict do nothing;
--> statement-breakpoint

-- ── Person writes are counted first, in their own statement (security L1; a refused write still counts), failing
--    closed. Reserve and settle are not counted (speed L3). ──
create or replace function app_partner_credit_try(p_uid uuid, p_session uuid, p_stepup text, p_kind text) returns void
  language plpgsql volatile security definer set search_path = '' as $$
declare v_max integer := case p_kind when 'buy' then 10 when 'seat' then 10 when 'confirm' then 60 when 'budget' then 60
  when 'details' then 20 when 'alerts' then 30 when 'pdf' then 120 when 'csv' then 30 end;
begin
  if v_max is null then raise exception 'bad_input' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.app_pm_live(p_uid)) then raise exception 'not_owner' using errcode = 'P0001'; end if;
  perform public.app_partner_need(p_uid, p_session, p_stepup, false);
  perform pg_advisory_xact_lock(hashtextextended(p_uid::text || ':credit-try', 0));
  delete from public.partner_credit_tries where at < now() - interval '1 hour';
  if (select count(*) from public.partner_credit_tries t where t.user_id = p_uid and t.kind = p_kind and t.at > now() - interval '1 hour') >= v_max then
    raise exception 'too_many' using errcode = 'P0001';
  end if;
  insert into public.partner_credit_tries (user_id, kind) values (p_uid, p_kind);
end $$;
--> statement-breakpoint

-- ═══ PERSON READS ═══════════════════════════════════════════════════════════════════════════════════════════════════

-- ── Overview (owner): the balance and what holds it, credits by use-by date, the seat, alerts, the billing details'
--    presence, and the last open or failed purchase for the banners. One call, one snapshot. No mandate ids (tenancy M2). ──
create or replace function app_partner_credits_overview(p_uid uuid, p_session uuid, p_stepup text, p_real boolean) returns jsonb
  language plpgsql stable security definer set search_path = '' as $$
declare o record; v_month timestamptz := (date_trunc('month', now() at time zone 'Asia/Kolkata')) at time zone 'Asia/Kolkata';
begin
  select * into o from public.app_pc_owner(p_uid, p_session, p_stepup, false, false);
  return (select jsonb_build_object(
    'balance', public.app_pc_balance(o.partner_id, p_real),
    'held', coalesce((select sum(public.app_pc_charged(u.id)) from public.partner_credit_uses u
                       where u.partner_id = o.partner_id and u.closed_at is null), 0),
    'heldBy', (select count(*) from public.partner_credit_uses u where u.partner_id = o.partner_id and u.closed_at is null),
    'usedSince', v_month,
    'used', coalesce((select sum(public.app_pc_charged(u.id)) from public.partner_credit_uses u
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
                      order by p.created_at desc limit 1)));
end $$;
--> statement-breakpoint

-- ── Usage (owner): one month (IST) of uses, newest first, keyset by (created_at, id); the lots added and the lots that
--    ended in it. Who is the partner person's email (the team page shows emails); a client is the store's name. ──
create or replace function app_partner_credits_usage(p_uid uuid, p_session uuid, p_stepup text, p_month date, p_link uuid,
  p_limit integer, p_before timestamptz) returns jsonb
  language plpgsql stable security definer set search_path = '' as $$
declare o record; v_from timestamptz; v_to timestamptz;
begin
  select * into o from public.app_pc_owner(p_uid, p_session, p_stepup, false, false);
  if p_month is null or p_month < date '2026-01-01' or p_month > date '2100-01-01' or p_limit is null or p_limit not between 1 and 5000 then
    raise exception 'bad_input' using errcode = 'P0001'; end if;
  if p_link is not null and not exists (select 1 from public.partner_links l where l.id = p_link and l.partner_id = o.partner_id) then
    raise exception 'not_found' using errcode = 'P0001'; end if;
  v_from := (date_trunc('month', p_month::timestamp)) at time zone 'Asia/Kolkata';
  v_to := (date_trunc('month', p_month::timestamp) + interval '1 month') at time zone 'Asia/Kolkata';
  return jsonb_build_object(
    'uses', coalesce((select jsonb_agg(r order by r.at desc, r.id desc) from (
      select u.id, u.created_at as at, u.kind, u.what, t.name as client, pm.email as who, u.estimate, u.reserved,
             public.app_pc_charged(u.id) as charged, u.closed_at is not null as closed, u.returned_at is not null as returned
        from public.partner_credit_uses u
        join public.partner_links l on l.id = u.link_id and l.partner_id = u.partner_id
        join public.tenants t on t.id = l.tenant_id
        left join public.partner_members pm on pm.id = u.member_id and pm.partner_id = u.partner_id
       where u.partner_id = o.partner_id and u.created_at >= v_from and u.created_at < v_to
         and (p_link is null or u.link_id = p_link) and (p_before is null or u.created_at < p_before)
       order by u.created_at desc, u.id desc limit p_limit) r), '[]'::jsonb),
    'added', case when p_link is null then coalesce((select jsonb_agg(jsonb_build_object('at', l.created_at, 'kind', l.kind, 'credits', l.credits) order by l.created_at desc)
              from public.partner_credit_entries l where l.partner_id = o.partner_id and l.kind in ('grant','pack','credits','seat')
               and l.created_at >= v_from and l.created_at < v_to), '[]'::jsonb) else '[]'::jsonb end,
    'ended', case when p_link is null then coalesce((select jsonb_agg(jsonb_build_object('at', l.expires_at, 'kind', l.kind, 'credits', l.left_credits) order by l.expires_at desc)
              from (select x.id, x.kind, x.expires_at,
                           (x.credits + coalesce((select sum(d.credits) from public.partner_credit_entries d where d.lot_id = x.id), 0))::integer as left_credits
                      from public.partner_credit_entries x where x.partner_id = o.partner_id and x.kind in ('grant','pack','credits','seat','return')
                       and x.expires_at >= v_from and x.expires_at < least(v_to, now())) l where l.left_credits > 0), '[]'::jsonb) else '[]'::jsonb end);
end $$;
--> statement-breakpoint

-- ── Client budgets: the owner sees every live client; a Lead its assigned live clients (owner call 3); a Builder none.
--    Keyed by link. "For the build" or "Each month" from the window. ──
create or replace function app_partner_credits_budgets(p_uid uuid, p_session uuid, p_stepup text) returns table (
  link_id uuid, client text, kind text, budget integer, used integer, warned boolean, new_site_budget integer)
  language plpgsql stable security definer set search_path = '' as $$
declare me record;
begin
  select x.* into me from public.app_pm_live(p_uid) x where x.role in ('owner', 'lead');
  if me.member_id is null then raise exception 'not_owner' using errcode = 'P0001'; end if;
  perform public.app_partner_need(p_uid, p_session, p_stepup, false);
  return query
  select l.id, t.name, w.kind, b.credits, public.app_pc_link_used(me.partner_id, l.id), b.warned_at is not null,
         case when me.role = 'owner' then (select pb.new_site_budget from public.partner_billing pb where pb.partner_id = me.partner_id) end
  from public.partner_links l
  join public.tenants t on t.id = l.tenant_id
  cross join lateral public.app_pc_window(l.id) w
  left join public.partner_client_budgets b on b.partner_id = me.partner_id and b.link_id = l.id
  where l.partner_id = me.partner_id and l.removed_at is null
    and (me.role = 'owner' or exists (select 1 from public.partner_assignments a where a.partner_member_id = me.member_id and a.tenant_id = l.tenant_id))
  order by t.name;
end $$;
--> statement-breakpoint

-- ── Payments and invoices (owner): purchases of the last 24 months (at most 200), each with its invoice number; the
--    invoice details; how the seat pays (method and limit, never the token or customer id). ──
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
                from public.partner_billing b where b.partner_id = o.partner_id and b.token_id is not null));
end $$;
--> statement-breakpoint

-- ── One invoice for its PDF (owner): matched on the caller's partner, 'not_found' otherwise (security L3). ──
create or replace function app_partner_invoice(p_uid uuid, p_session uuid, p_stepup text, p_invoice uuid) returns setof partner_invoices
  language plpgsql stable security definer set search_path = '' as $$
declare o record;
begin
  select * into o from public.app_pc_owner(p_uid, p_session, p_stepup, false, false);
  if not exists (select 1 from public.partner_invoices i where i.id = p_invoice and i.partner_id = o.partner_id) then
    raise exception 'not_found' using errcode = 'P0001'; end if;
  return query select i.* from public.partner_invoices i where i.id = p_invoice and i.partner_id = o.partner_id;
end $$;
--> statement-breakpoint

-- ── Studio's credits panel for one client (owner 2026-11-22, 5): the owner gets the balance and the client's budget; a
--    Lead or a Builder assigned to the store gets the client's used and budget only, never the balance (security M5). ──
create or replace function app_partner_credits_panel(p_uid uuid, p_session uuid, p_stepup text, p_link uuid, p_real boolean) returns table (
  role text, balance integer, kind text, budget integer, used integer)
  language plpgsql stable security definer set search_path = '' as $$
declare me record; v_tenant uuid;
begin
  select x.* into me from public.app_pm_live(p_uid) x;
  if me.member_id is null then raise exception 'not_owner' using errcode = 'P0001'; end if;
  perform public.app_partner_need(p_uid, p_session, p_stepup, false);
  select l.tenant_id into v_tenant from public.partner_links l where l.id = p_link and l.partner_id = me.partner_id and l.removed_at is null;
  if v_tenant is null or (me.role <> 'owner' and not exists (select 1 from public.partner_assignments a
      where a.partner_member_id = me.member_id and a.tenant_id = v_tenant)) then
    raise exception 'not_found' using errcode = 'P0001'; end if;
  return query
  select me.role, case when me.role = 'owner' then public.app_pc_balance(me.partner_id, p_real) end, w.kind,
         (select b.credits from public.partner_client_budgets b where b.partner_id = me.partner_id and b.link_id = p_link),
         public.app_pc_link_used(me.partner_id, p_link)
  from public.app_pc_window(p_link) w;
end $$;
--> statement-breakpoint

-- ═══ PERSON WRITES (the partner owner's; counted first by app_partner_credit_try) ═════════════════════════════════

-- ── A client's budget. Never below what it has used (the 13 Nov rule); a raise needs a check in the last 5 minutes
--    (security M4); raising clears the 80% mark so the next crossing emails again. ──
create or replace function app_partner_set_budget(p_uid uuid, p_session uuid, p_stepup text, p_link uuid, p_credits integer) returns void
  language plpgsql volatile security definer set search_path = '' as $$
declare o record; v_old integer; v_used integer;
begin
  select x.member_id, x.partner_id into o from public.app_pm_live(p_uid) x where x.role = 'owner';
  if o.member_id is null then raise exception 'not_owner' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.partner_links l where l.id = p_link and l.partner_id = o.partner_id and l.removed_at is null) then
    raise exception 'not_found' using errcode = 'P0001'; end if;
  select b.credits into v_old from public.partner_client_budgets b where b.partner_id = o.partner_id and b.link_id = p_link;
  perform public.app_partner_need(p_uid, p_session, p_stepup, v_old is null or p_credits > v_old);
  perform pg_advisory_xact_lock(hashtextextended(o.partner_id::text || ':credits', 0));
  v_used := public.app_pc_link_used(o.partner_id, p_link);
  if p_credits is null or p_credits < 1 or p_credits > 100000 then raise exception 'bad_input' using errcode = 'P0001'; end if;
  if p_credits < v_used then raise exception 'below_used' using errcode = 'P0001'; end if;
  insert into public.partner_client_budgets (partner_id, link_id, credits, set_by, set_at)
    values (o.partner_id, p_link, p_credits, o.member_id, now())
  on conflict (partner_id, link_id) do update
    set credits = excluded.credits, set_by = excluded.set_by, set_at = now(),
        warned_at = case when excluded.credits > public.partner_client_budgets.credits then null else public.partner_client_budgets.warned_at end;
end $$;
--> statement-breakpoint

create or replace function app_partner_set_site_budget(p_uid uuid, p_session uuid, p_stepup text, p_credits integer) returns void
  language plpgsql volatile security definer set search_path = '' as $$
declare o record;
begin
  select * into o from public.app_pc_owner(p_uid, p_session, p_stepup, false, false);
  if p_credits is null or p_credits < 1 or p_credits > 100000 then raise exception 'bad_input' using errcode = 'P0001'; end if;
  insert into public.partner_billing (partner_id, new_site_budget) values (o.partner_id, p_credits)
  on conflict (partner_id) do update set new_site_budget = excluded.new_site_budget, updated_at = now();
end $$;
--> statement-breakpoint

create or replace function app_partner_set_alerts(p_uid uuid, p_session uuid, p_stepup text, p_low boolean, p_budget boolean) returns void
  language plpgsql volatile security definer set search_path = '' as $$
declare o record;
begin
  select * into o from public.app_pc_owner(p_uid, p_session, p_stepup, false, false);
  if p_low is null or p_budget is null then raise exception 'bad_input' using errcode = 'P0001'; end if;
  insert into public.partner_billing (partner_id, alert_low, alert_budget) values (o.partner_id, p_low, p_budget)
  on conflict (partner_id) do update set alert_low = excluded.alert_low, alert_budget = excluded.alert_budget, updated_at = now();
end $$;
--> statement-breakpoint

-- ── Invoices go to. The real passkey check, fresh (security M4: billing details move tax documents). The GSTIN is
--    locked once a real invoice carries it (security L2). The state comes from the GSTIN when there is one (place of
--    supply). A second partner whose GSTIN shares a PAN with a partner that had the free 20 loses what it has left of
--    its own (owner 2026-11-22: once per PAN). A change of details tells the owner by email. ──
create or replace function app_partner_set_billing(p_uid uuid, p_session uuid, p_stepup text, p_name text, p_gstin text,
  p_state text, p_address text, p_email text) returns void
  language plpgsql volatile security definer set search_path = '' as $$
declare o record; b record; v_name text := nullif(btrim(coalesce(p_name, '')), ''); v_gstin text := nullif(upper(btrim(coalesce(p_gstin, ''))), '');
  v_addr text := nullif(btrim(coalesce(p_address, '')), ''); v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_state text := nullif(btrim(coalesce(p_state, '')), ''); v_pan text; v_left integer; v_grant uuid;
begin
  select * into o from public.app_pc_owner(p_uid, p_session, p_stepup, true, true);
  if v_gstin is not null then
    if v_gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' then raise exception 'bad_gstin' using errcode = 'P0001'; end if;
    v_state := substr(v_gstin, 1, 2); v_pan := substr(v_gstin, 3, 10);
  end if;
  if v_name is null or length(v_name) > 120 or v_addr is null or length(v_addr) > 300 or v_state is null or v_state !~ '^[0-9]{2}$'
     or (v_email is not null and (length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+$')) then
    raise exception 'bad_input' using errcode = 'P0001'; end if;
  insert into public.partner_billing (partner_id) values (o.partner_id) on conflict (partner_id) do nothing;
  -- The partner's credits lock first: the free-credit void below reads what is left under it (impact review).
  perform pg_advisory_xact_lock(hashtextextended(o.partner_id::text || ':credits', 0));
  select * into b from public.partner_billing pb where pb.partner_id = o.partner_id for update;
  if b.gstin is not null and v_gstin is distinct from b.gstin and exists (select 1 from public.partner_invoices i
      where i.partner_id = o.partner_id and not i.test and i.buyer_gstin = b.gstin) then
    raise exception 'gstin_locked' using errcode = 'P0001'; end if;
  update public.partner_billing set legal_name = v_name, gstin = v_gstin, pan = v_pan, state_code = v_state, address = v_addr,
    invoice_email = v_email, details_at = now(), updated_at = now() where partner_id = o.partner_id;
  if b.details_at is not null then
    perform public.app_pc_notice(o.partner_id, 'details_changed', 'details:' || o.partner_id || ':' || extract(epoch from now())::bigint);
  end if;
  if v_pan is not null and exists (select 1 from public.partner_billing pb join public.partner_credit_entries g on g.partner_id = pb.partner_id and g.kind = 'grant'
      where pb.pan = v_pan and pb.partner_id <> o.partner_id) then
    select x.lot_id, x.left_credits into v_grant, v_left from public.app_pc_lots(o.partner_id, false) x where x.kind = 'grant';
    if v_left > 0 then
      insert into public.partner_credit_entries (partner_id, kind, credits, lot_id) values (o.partner_id, 'void', -v_left, v_grant);
    end if;
  end if;
end $$;
--> statement-breakpoint

-- ── A purchase's attempt row, committed before Razorpay hears of it (ADR-0008). The amounts come from the server's
--    price table (src/domains/studio/prices.ts quote), the seller from frrataSeller(); the buyer is frozen here from the
--    billing details, which must exist (architecture M10). A seat needs the real check, fresh; one live seat, unless
--    this one starts the plan the live seat is moving to (the upgrade at renewal, when the old mandate is too small) or
--    pays a seat whose renewal failed (a fresh seat and mandate; the failed one ends when this is paid). ──
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
    select * into s from public.partner_seats ps where ps.partner_id = o.partner_id and ps.ended_at is null;
    -- One live seat, unless this starts the plan it is moving to, or pays a seat whose renewal failed (the banner's Pay).
    if s.id is not null and s.next_plan is distinct from p_plan and s.failed_at is null then raise exception 'has_seat' using errcode = 'P0001'; end if;
  elsif p_plan is not null or p_method is not null or p_mandate_max is not null then raise exception 'bad_input' using errcode = 'P0001';
  end if;
  insert into public.partner_credit_purchases (id, partner_id, kind, credits, plan, method, mandate_max, taxable, cgst, sgst, igst, total,
    test, invoice_test, buyer_name, buyer_gstin, buyer_state, buyer_address, seller_name, seller_gstin, seller_address, sac, prefix, fy,
    receipt, created_by)
  values (v_id, o.partner_id, p_kind, p_credits, p_plan, p_method, p_mandate_max, p_taxable, p_cgst, p_sgst, p_igst,
    p_taxable + p_cgst + p_sgst + p_igst, p_test, p_invoice_test or p_test, b.legal_name, b.gstin, b.state_code, b.address,
    p_seller_name, nullif(p_seller_gstin, ''), p_seller_address, p_sac, p_prefix, p_fy, 'pc_' || replace(v_id::text, '-', ''), o.member_id);
  return query select v_id, 'pc_' || replace(v_id::text, '-', ''), p_taxable + p_cgst + p_sgst + p_igst;
end $$;
--> statement-breakpoint

-- ── The seat: cancel at the period's end, keep it, or change the plan at the next renewal (owner 2026-11-22, d). The real
--    check, fresh (security M4). Cancelling marks the mandate for cancelling once the period ends. ──
create or replace function app_partner_seat_change(p_uid uuid, p_session uuid, p_stepup text, p_action text, p_plan text) returns void
  language plpgsql volatile security definer set search_path = '' as $$
declare o record; s record;
begin
  select * into o from public.app_pc_owner(p_uid, p_session, p_stepup, true, true);
  select * into s from public.partner_seats ps where ps.partner_id = o.partner_id and ps.ended_at is null for update;
  if s.id is null then raise exception 'no_seat' using errcode = 'P0001'; end if;
  if p_action = 'cancel' then update public.partner_seats set cancel_at = s.period_end, next_plan = null where id = s.id;
  elsif p_action = 'keep' then
    if s.cancel_at is null or s.cancel_at <= now() then raise exception 'bad_input' using errcode = 'P0001'; end if;
    update public.partner_seats set cancel_at = null where id = s.id;
  elsif p_action = 'plan' and p_plan in ('studio', 'plus') then
    if s.cancel_at is not null then raise exception 'bad_input' using errcode = 'P0001'; end if;
    update public.partner_seats set next_plan = nullif(p_plan, s.plan) where id = s.id;
  else raise exception 'bad_input' using errcode = 'P0001';
  end if;
end $$;
--> statement-breakpoint

-- ═══ SYSTEM (ids only; the server's own fetches and the stored, verified webhook) ═════════════════════════════════

-- ── Internal: issue the tax invoice for a paid purchase, on the shared series (FRR/26-27/NNNNNN; a test one in its own
--    'T' year key, as 0139). The counter is taken last and waits at most 2 s (speed L1): a timeout leaves the payment
--    unapplied for the next pass. ──
create or replace function app_pc_issue(p_purchase uuid) returns uuid
  language plpgsql volatile security definer set search_path = '' as $$
declare p record; v_fy text; nxt bigint; v_id uuid;
begin
  select * into p from public.partner_credit_purchases x where x.id = p_purchase;
  v_fy := case when p.invoice_test then 'T' || p.fy else p.fy end;
  set local lock_timeout = '2s';
  insert into public.platform_counters (kind, fy, next) values ('invoice', v_fy, 2)
    on conflict (kind, fy) do update set next = public.platform_counters.next + 1 returning next - 1 into nxt;
  insert into public.partner_invoices (partner_id, purchase_id, number, test, buyer_name, buyer_gstin, buyer_state, buyer_address,
    place_of_supply, seller_name, seller_gstin, seller_address, sac, kind, plan, credits, taxable, cgst, sgst, igst, total)
  values (p.partner_id, p.id, p.prefix || v_fy || '/' || lpad(nxt::text, 6, '0'), p.invoice_test, p.buyer_name, p.buyer_gstin,
    p.buyer_state, p.buyer_address, p.buyer_state, p.seller_name, p.seller_gstin, p.seller_address, p.sac, p.kind, p.plan, p.credits,
    p.taxable, p.cgst, p.sgst, p.igst, p.total)
  returning id into v_id;
  return v_id;
end $$;
--> statement-breakpoint

-- What the server needs to talk to the gateway about one attempt.
create or replace function app_pc_purchase_ctx(p_purchase uuid) returns table (
  id uuid, partner_id uuid, kind text, total bigint, receipt text, gateway_order_id text, test boolean, plan text, method text,
  mandate_max bigint, customer_id text, token_id text, debit_after timestamptz, claimed boolean, open boolean, partner_live boolean)
  language sql stable security definer set search_path = '' as $$
  select p.id, p.partner_id, p.kind, p.total, p.receipt, p.gateway_order_id, p.test, p.plan, p.method, p.mandate_max, b.customer_id,
         case when b.mandate_revoked_at is null then b.token_id end, p.debit_after, p.claimed_at is not null,
         p.paid_at is null and p.failed_at is null and p.closed_at is null,
         exists (select 1 from public.partners pa where pa.id = p.partner_id and pa.approved_at is not null and pa.suspended_at is null and pa.declined_at is null)
  from public.partner_credit_purchases p left join public.partner_billing b on b.partner_id = p.partner_id
  where p.id = p_purchase
$$;
--> statement-breakpoint

-- The gateway's customer for a partner, kept once (a retry reuses it).
create or replace function app_pc_set_customer(p_purchase uuid, p_customer text) returns text
  language sql volatile security definer set search_path = '' as $$
  update public.partner_billing b set customer_id = coalesce(b.customer_id, p_customer), updated_at = now()
   from public.partner_credit_purchases p where p.id = p_purchase and b.partner_id = p.partner_id
  returning b.customer_id
$$;
--> statement-breakpoint

-- The gateway's order, written once. p_notified: a renewal's order carries Razorpay's pre-debit notification, and our own
-- email has gone, so the notice's clock starts now (security H2: a debit counts from a notice SENT, never queued).
create or replace function app_pc_purchase_order(p_purchase uuid, p_order text, p_notified boolean) returns boolean
  language plpgsql volatile security definer set search_path = '' as $$
declare n integer;
begin
  if p_order is null or p_order !~ '^order_[A-Za-z0-9]{6,40}$' then raise exception 'bad_input' using errcode = 'P0001'; end if;
  update public.partner_credit_purchases set gateway_order_id = p_order,
    notice_sent_at = case when p_notified then now() else notice_sent_at end
   where id = p_purchase and gateway_order_id is null and paid_at is null and failed_at is null and closed_at is null;
  get diagnostics n = row_count;
  return n = 1;
end $$;
--> statement-breakpoint

-- A recurring debit is claimed once, ever (the claimBillingAttempt pattern): a second run never charges again.
create or replace function app_pc_claim(p_purchase uuid) returns boolean
  language plpgsql volatile security definer set search_path = '' as $$
declare n integer;
begin
  update public.partner_credit_purchases set claimed_at = now()
   where id = p_purchase and claimed_at is null and paid_at is null and failed_at is null and closed_at is null;
  get diagnostics n = row_count;
  return n = 1;
end $$;
--> statement-breakpoint

-- ── Apply what the gateway says about a payment (architecture M7, security M3, tenancy H1). Matched to OUR attempt by
--    the gateway order id alone; a payment id is recorded once across all attempts. Only 'captured' with the attempt's
--    exact amount, INR and the server's own test mode buys credits — and a late capture still does, even after the
--    attempt was marked failed or closed. Captured money that buys nothing becomes refund_due (refunded by the hourly
--    run, the attempt marked before the request). Returns what happened. ──
create or replace function app_pc_apply(p_order text, p_payment text, p_captured boolean, p_amount bigint, p_currency text,
  p_test boolean, p_reason text, p_token text) returns text
  language plpgsql volatile security definer set search_path = '' as $$
declare p record; v_seat uuid; v_lot text; v_inv uuid; v_old_token text;
begin
  select * into p from public.partner_credit_purchases x where x.gateway_order_id = p_order for update;
  if p.id is null then return 'unknown'; end if;
  if p_payment is null or p_payment !~ '^pay_[A-Za-z0-9]{6,40}$' then raise exception 'bad_input' using errcode = 'P0001'; end if;
  if exists (select 1 from public.partner_credit_purchases x where x.payment_id = p_payment and x.id <> p.id) then return 'duplicate'; end if;
  if p.paid_at is not null and p.payment_id = p_payment then return 'duplicate'; end if;
  if not coalesce(p_captured, false) then
    if p.paid_at is not null or p.failed_at is not null or p.closed_at is not null then return 'ignored'; end if;
    update public.partner_credit_purchases set failed_at = now(), failed_reason = left(coalesce(p_reason, 'The bank declined it'), 160),
      payment_id = case when exists (select 1 from public.partner_credit_purchases y where y.payment_id = p_payment) then payment_id else p_payment end
     where id = p.id;
    if p.kind = 'seat_renewal' then
      update public.partner_seats set failed_at = coalesce(failed_at, now()) where id = p.seat_id;
      perform public.app_pc_notice(p.partner_id, 'renewal_failed', 'rfail:' || p.id, null, p.id);
    end if;
    return 'failed';
  end if;
  if p.paid_at is null and p_amount = p.total and p_currency = 'INR' and p_test = p.test
     and not (p.kind = 'seat_start' and exists (select 1 from public.partner_seats ns where ns.partner_id = p.partner_id
              and ns.ended_at is null and ns.started_at > p.created_at)) then
    update public.partner_credit_purchases set paid_at = now(), failed_at = null, failed_reason = null, closed_at = null, closed_reason = null,
      payment_id = p_payment where id = p.id;
    v_lot := case p.kind when 'pack' then 'pack' when 'credits' then 'credits' else 'seat' end;
    insert into public.partner_credit_entries (partner_id, kind, credits, purchase_id, expires_at, test)
      values (p.partner_id, v_lot, p.credits, p.id, now() + interval '12 months', p.test);
    if p.kind = 'seat_start' then
      update public.partner_seats set ended_at = now() where partner_id = p.partner_id and ended_at is null;
      insert into public.partner_seats (partner_id, plan, method, test, started_at, period_end)
        values (p.partner_id, p.plan, p.method, p.test, now(), now() + interval '1 month') returning id into v_seat;
      if p_token is not null and p_token ~ '^token_[A-Za-z0-9]{6,40}$' then
        select b.token_id into v_old_token from public.partner_billing b where b.partner_id = p.partner_id;
        update public.partner_billing set token_id = p_token, mandate_method = p.method, mandate_max = p.mandate_max, mandate_at = now(),
          mandate_revoked_at = null, cancel_token_id = case when v_old_token is not null and v_old_token <> p_token then v_old_token else cancel_token_id end,
          token_cancel_due_at = case when v_old_token is not null and v_old_token <> p_token then now() else token_cancel_due_at end,
          token_cancelled_at = null, updated_at = now()
         where partner_id = p.partner_id;
      end if;
    elsif p.kind = 'seat_renewal' then
      -- The plan the money was taken for, frozen at notice (impact review: a change after the notice waits a period).
      update public.partner_seats set period_end = p.for_period_end + interval '1 month', plan = p.plan,
        next_plan = case when next_plan = p.plan then null else next_plan end, failed_at = null
       where id = p.seat_id and period_end = p.for_period_end;
    end if;
    v_inv := public.app_pc_issue(p.id);
    perform public.app_pc_notice(p.partner_id, 'paid', 'paid:' || p.id, null, p.id);
    return 'applied';
  end if;
  -- Money taken that buys nothing: a second capture, a wrong amount, currency or mode.
  if p.refund_due_at is null and not exists (select 1 from public.partner_credit_purchases y where y.payment_id = p_payment) then
    update public.partner_credit_purchases set refund_due_at = now(), refund_payment_id = p_payment, refund_amount = p_amount where id = p.id;
    return 'refund_due';
  end if;
  return 'refund_pending';
end $$;
--> statement-breakpoint

-- Attempts that never came back: the hourly run asks the gateway about them (orderByReceipt / orderPayments).
create or replace function app_pc_unsettled(p_older interval, p_limit integer) returns table (id uuid, receipt text, gateway_order_id text, kind text, claimed boolean, created_at timestamptz)
  language sql stable security definer set search_path = '' as $$
  select p.id, p.receipt, p.gateway_order_id, p.kind, p.claimed_at is not null, p.created_at from public.partner_credit_purchases p
   where p.paid_at is null and p.failed_at is null and p.closed_at is null and p.created_at < now() - p_older
     and (p.kind <> 'seat_renewal' or p.claimed_at is not null)
   order by p.created_at limit least(p_limit, 200)
$$;
--> statement-breakpoint

-- Nothing was taken: a checkout left unpaid, or a debit that never started. A renewal's counts as a failed try (it needs
-- a fresh notice before the next).
create or replace function app_pc_close(p_purchase uuid, p_reason text) returns boolean
  language plpgsql volatile security definer set search_path = '' as $$
declare p record;
begin
  select * into p from public.partner_credit_purchases x where x.id = p_purchase and x.paid_at is null and x.failed_at is null and x.closed_at is null for update;
  if p.id is null then return false; end if;
  if p.kind = 'seat_renewal' then
    update public.partner_credit_purchases set failed_at = now(), failed_reason = left(p_reason, 160) where id = p.id;
    update public.partner_seats set failed_at = coalesce(failed_at, now()) where id = p.seat_id;
    perform public.app_pc_notice(p.partner_id, 'renewal_failed', 'rfail:' || p.id, null, p.id);
  else
    update public.partner_credit_purchases set closed_at = now(), closed_reason = left(p_reason, 80) where id = p.id;
  end if;
  return true;
end $$;
--> statement-breakpoint

-- ── Renewals: every live seat within 3 days of its period's end, with the facts renewalStep needs (attempts for this
--    period, the latest attempt's notice, the last failure, the mandate, the partner live). Oldest due first. ──
create or replace function app_pc_renewals(p_limit integer) returns table (
  seat_id uuid, partner_id uuid, plan text, next_plan text, method text, test boolean, period_end timestamptz, cancel_at timestamptz,
  failed_at timestamptz, attempts integer, pending integer, purchase_id uuid, purchase_open boolean, has_order boolean, notice_queued_at timestamptz,
  notice_sent_at timestamptz, last_failed_at timestamptz, mandate boolean, mandate_max bigint, partner_live boolean)
  language sql stable security definer set search_path = '' as $$
  select s.id, s.partner_id, s.plan, s.next_plan, s.method, s.test, s.period_end, s.cancel_at, s.failed_at,
    (select count(*)::integer from public.partner_credit_purchases p where p.seat_id = s.id and p.for_period_end = s.period_end and p.claimed_at is not null),
    (select count(*)::integer from public.partner_credit_purchases p where p.seat_id = s.id and p.for_period_end = s.period_end
        and p.claimed_at is not null and p.paid_at is null and p.failed_at is null and p.closed_at is null),
    l.id, l.id is not null and l.paid_at is null and l.failed_at is null and l.closed_at is null, l.gateway_order_id is not null,
    l.notice_queued_at, l.notice_sent_at,
    (select max(p.failed_at) from public.partner_credit_purchases p where p.seat_id = s.id and p.for_period_end = s.period_end),
    b.token_id is not null and b.mandate_revoked_at is null, b.mandate_max,
    exists (select 1 from public.partners pa where pa.id = s.partner_id and pa.approved_at is not null and pa.suspended_at is null and pa.declined_at is null)
  from public.partner_seats s
  left join public.partner_billing b on b.partner_id = s.partner_id
  left join lateral (select p.* from public.partner_credit_purchases p where p.seat_id = s.id and p.for_period_end = s.period_end
                      order by p.created_at desc limit 1) l on true
  where s.ended_at is null and (s.period_end < now() + interval '3 days' or s.failed_at is not null)
  order by s.period_end limit least(p_limit, 500)
$$;
--> statement-breakpoint

-- A renewal's attempt and its pre-debit email, both now: the amount and plan frozen at notice (security H2). The buyer from
-- today's details; the amounts and seller from the server (price table, frrataSeller()).
create or replace function app_pc_renewal_begin(p_seat uuid, p_period_end timestamptz, p_attempt integer, p_debit_after timestamptz,
  p_plan text, p_credits integer, p_taxable bigint, p_cgst bigint, p_sgst bigint, p_igst bigint, p_invoice_test boolean,
  p_seller_name text, p_seller_gstin text, p_seller_address text, p_sac text, p_prefix text, p_fy text) returns uuid
  language plpgsql volatile security definer set search_path = '' as $$
declare s record; b record; v_id uuid := gen_random_uuid();
begin
  select * into s from public.partner_seats x where x.id = p_seat and x.ended_at is null and x.period_end = p_period_end for update;
  if s.id is null then return null; end if;
  if exists (select 1 from public.partner_credit_purchases p where p.seat_id = s.id and p.paid_at is null and p.failed_at is null and p.closed_at is null) then return null; end if;
  select * into b from public.partner_billing x where x.partner_id = s.partner_id;
  if b.token_id is null or b.mandate_revoked_at is not null or p_taxable + p_cgst + p_sgst + p_igst > b.mandate_max then return null; end if;
  insert into public.partner_credit_purchases (id, partner_id, kind, credits, plan, seat_id, for_period_end, attempt, method, mandate_max,
    taxable, cgst, sgst, igst, total, test, invoice_test, buyer_name, buyer_gstin, buyer_state, buyer_address, seller_name, seller_gstin,
    seller_address, sac, prefix, fy, receipt, notice_queued_at, debit_after)
  values (v_id, s.partner_id, 'seat_renewal', p_credits, p_plan, s.id, s.period_end, p_attempt, s.method, b.mandate_max,
    p_taxable, p_cgst, p_sgst, p_igst, p_taxable + p_cgst + p_sgst + p_igst, s.test, p_invoice_test or s.test,
    coalesce(b.legal_name, ''), b.gstin, coalesce(b.state_code, ''), coalesce(b.address, ''), p_seller_name, nullif(p_seller_gstin, ''),
    p_seller_address, p_sac, p_prefix, p_fy, 'pc_' || replace(v_id::text, '-', ''), now(), p_debit_after);
  perform public.app_pc_notice(s.partner_id, 'predebit', 'predebit:' || v_id, null, v_id);
  return v_id;
end $$;
--> statement-breakpoint

-- A renewal attempt whose pre-debit email went: ready for its order (with Razorpay's notification) — the ids the hourly run
-- needs. Its notice clock starts only when the order is made (app_pc_purchase_order with p_notified).
create or replace function app_pc_renewals_notified(p_limit integer) returns table (id uuid, receipt text, total bigint, customer_id text, token_id text, debit_after timestamptz)
  language sql stable security definer set search_path = '' as $$
  select p.id, p.receipt, p.total, b.customer_id, b.token_id, p.debit_after
  from public.partner_credit_purchases p
  join public.partner_credit_notices n on n.purchase_id = p.id and n.partner_id = p.partner_id and n.kind = 'predebit' and n.sent_at is not null
  join public.partner_billing b on b.partner_id = p.partner_id and b.token_id is not null and b.mandate_revoked_at is null
  where p.kind = 'seat_renewal' and p.gateway_order_id is null and p.paid_at is null and p.failed_at is null and p.closed_at is null
  order by p.created_at limit least(p_limit, 200)
$$;
--> statement-breakpoint

-- The seat ends (cancelled, no mandate, a suspended partner) or lapses to Partner on day 7; its mandate is then cancelled.
create or replace function app_pc_seat_end(p_seat uuid, p_lapsed boolean) returns boolean
  language plpgsql volatile security definer set search_path = '' as $$
declare s record;
begin
  update public.partner_seats set ended_at = now() where id = p_seat and ended_at is null returning * into s;
  if s.id is null then return false; end if;
  update public.partner_credit_purchases set closed_at = now(), closed_reason = 'The seat ended'
   where seat_id = s.id and paid_at is null and failed_at is null and closed_at is null and claimed_at is null;
  update public.partner_billing set cancel_token_id = token_id, token_cancel_due_at = now(), token_cancelled_at = null,
    token_id = null, mandate_method = null, mandate_max = null, updated_at = now()
   where partner_id = s.partner_id and token_id is not null;
  return true;
end $$;
--> statement-breakpoint

-- Mandates to cancel at the gateway, then marked done (an attempt before the request: due_at, then cancelled_at).
create or replace function app_pc_token_cancels(p_limit integer) returns table (partner_id uuid, customer_id text, token_id text)
  language sql stable security definer set search_path = '' as $$
  select b.partner_id, b.customer_id, b.cancel_token_id from public.partner_billing b
   where b.cancel_token_id is not null and b.token_cancel_due_at is not null and b.token_cancelled_at is null
   order by b.token_cancel_due_at limit least(p_limit, 100)
$$;
--> statement-breakpoint
create or replace function app_pc_token_cancelled(p_partner uuid, p_token text) returns void
  language sql volatile security definer set search_path = '' as $$
  update public.partner_billing set token_cancelled_at = now(), cancel_token_id = null, updated_at = now()
   where partner_id = p_partner and cancel_token_id = p_token
$$;
--> statement-breakpoint

-- A token's own events, routed here by token id (the payload of token.* carries no order: tenancy M1).
create or replace function app_pc_token_event(p_token text, p_status text) returns boolean
  language plpgsql volatile security definer set search_path = '' as $$
declare n integer;
begin
  if p_status = 'confirmed' then
    update public.partner_billing set mandate_at = coalesce(mandate_at, now()), updated_at = now() where token_id = p_token and mandate_revoked_at is null;
  elsif p_status in ('cancelled', 'rejected', 'paused') then
    update public.partner_billing set mandate_revoked_at = coalesce(mandate_revoked_at, now()), updated_at = now() where token_id = p_token;
  else return false;
  end if;
  get diagnostics n = row_count;
  return n > 0;
end $$;
--> statement-breakpoint

-- ── Refunds of money that bought nothing (architecture M7): listed, claimed once before the request, then recorded. ──
create or replace function app_pc_refunds_due(p_limit integer) returns table (id uuid, payment_id text, amount bigint, test boolean, claimed boolean)
  language sql stable security definer set search_path = '' as $$
  -- Unclaimed ones, and ones claimed over an hour ago that never finished (the run looks for the refund first).
  select p.id, p.refund_payment_id, p.refund_amount, p.test, p.refund_claimed_at is not null from public.partner_credit_purchases p
   where p.refund_due_at is not null and p.refunded_at is null and (p.refund_claimed_at is null or p.refund_claimed_at < now() - interval '1 hour')
   order by p.refund_due_at limit least(p_limit, 100)
$$;
--> statement-breakpoint
create or replace function app_pc_refund_claim(p_purchase uuid) returns boolean
  language plpgsql volatile security definer set search_path = '' as $$
declare n integer;
begin
  update public.partner_credit_purchases set refund_claimed_at = now()
   where id = p_purchase and refund_due_at is not null and refund_claimed_at is null and refunded_at is null;
  get diagnostics n = row_count;
  return n = 1;
end $$;
--> statement-breakpoint
create or replace function app_pc_refund_done(p_purchase uuid, p_refund text) returns void
  language sql volatile security definer set search_path = '' as $$
  update public.partner_credit_purchases set refunded_at = now(), refund_gateway_id = left(p_refund, 60)
   where id = p_purchase and refund_claimed_at is not null and refunded_at is null
$$;
--> statement-breakpoint

-- ── A dispute or a refund we didn't make (security M3): the purchase's lot gives back what is left (a clawback draw). ──
create or replace function app_pc_dispute(p_payment text) returns boolean
  language plpgsql volatile security definer set search_path = '' as $$
declare p record; l record;
begin
  select * into p from public.partner_credit_purchases x where x.payment_id = p_payment and x.paid_at is not null for update;
  if p.id is null or p.disputed_at is not null then return false; end if;
  update public.partner_credit_purchases set disputed_at = now() where id = p.id;
  perform pg_advisory_xact_lock(hashtextextended(p.partner_id::text || ':credits', 0));
  select x.lot_id, x.left_credits into l from public.app_pc_lots(p.partner_id, false) x
   join public.partner_credit_entries e on e.id = x.lot_id where e.purchase_id = p.id;
  if l.left_credits > 0 then
    insert into public.partner_credit_entries (partner_id, kind, credits, lot_id, purchase_id) values (p.partner_id, 'clawback', -l.left_credits, l.lot_id, p.id);
  end if;
  return true;
end $$;
--> statement-breakpoint

-- ── Emails (C1·6; tenancy H4): claimed by the hourly run with the recipients and the figures resolved NOW (the owner;
--    for a client's 80% also the Leads assigned to it today), so an unassigned Lead never gets one. Never read by
--    frata_admin. Five tries, then failed. ──
create or replace function app_pc_notices_claim(p_limit integer) returns table (id uuid, kind text, partner_id uuid, owners text[], leads text[], owner_name text, data jsonb)
  language plpgsql volatile security definer set search_path = '' as $$
begin
  return query
  with due as (
    select n.* from public.partner_credit_notices n where n.sent_at is null and n.failed_at is null
     order by n.created_at limit least(p_limit, 100) for update skip locked),
  bumped as (update public.partner_credit_notices n set tries = n.tries + 1 from due where n.id = due.id returning n.*)
  select d.id, d.kind, d.partner_id,
    array(select distinct e from (
            select u.email::text as e from public.partner_members pm join auth.users u on u.id = pm.user_id
             where pm.partner_id = d.partner_id and pm.role = 'owner' and pm.removed_at is null and pm.accepted_at is not null
            union all
            select b.invoice_email from public.partner_billing b where d.kind = 'paid' and b.partner_id = d.partner_id and b.invoice_email is not null) r
          where e is not null),
    array(select distinct u.email::text from public.partner_links l
            join public.partner_assignments a on a.tenant_id = l.tenant_id
            join public.partner_members pm on pm.id = a.partner_member_id and pm.partner_id = d.partner_id and pm.role = 'lead'
              and pm.removed_at is null and pm.accepted_at is not null
            join auth.users u on u.id = pm.user_id
           where d.kind = 'budget_80' and l.id = d.link_id and l.partner_id = d.partner_id and l.removed_at is null),
    (select pa.name from public.partners pa where pa.id = d.partner_id),
    case d.kind
      when 'low' then jsonb_build_object('balance', public.app_pc_balance(d.partner_id, true))
      when 'budget_80' then (select jsonb_build_object('client', t.name, 'used', public.app_pc_link_used(d.partner_id, l.id),
                               'budget', (select b.credits from public.partner_client_budgets b where b.partner_id = d.partner_id and b.link_id = l.id))
                             from public.partner_links l join public.tenants t on t.id = l.tenant_id where l.id = d.link_id and l.partner_id = d.partner_id)
      when 'predebit' then (select jsonb_build_object('total', p.total, 'debitAfter', p.debit_after, 'plan', p.plan, 'method', p.method,
                               'mandateRef', right(b.token_id, 4), 'forPeriodEnd', p.for_period_end)
                             from public.partner_credit_purchases p left join public.partner_billing b on b.partner_id = p.partner_id
                             where p.id = d.purchase_id and p.partner_id = d.partner_id)
      when 'renewal_failed' then (select jsonb_build_object('total', p.total, 'forPeriodEnd', p.for_period_end, 'failedAt', s.failed_at)
                                   from public.partner_credit_purchases p join public.partner_seats s on s.id = p.seat_id
                                   where p.id = d.purchase_id and p.partner_id = d.partner_id)
      when 'paid' then (select jsonb_build_object('total', p.total, 'credits', p.credits, 'kind', p.kind, 'plan', p.plan, 'invoiceId', i.id,
                           'invoiceNumber', i.number, 'test', i.test)
                         from public.partner_credit_purchases p left join public.partner_invoices i on i.purchase_id = p.id
                         where p.id = d.purchase_id and p.partner_id = d.partner_id)
      when 'details_changed' then (select jsonb_build_object('name', b.legal_name) from public.partner_billing b where b.partner_id = d.partner_id)
      else '{}'::jsonb end
  from bumped d;
end $$;
--> statement-breakpoint
create or replace function app_pc_notice_done(p_notice uuid, p_ok boolean, p_error text) returns void
  language sql volatile security definer set search_path = '' as $$
  update public.partner_credit_notices set sent_at = case when p_ok then now() end,
    failed_at = case when not p_ok and tries >= 5 then now() end, error = case when p_ok then null else left(p_error, 40) end
   where id = p_notice and sent_at is null
$$;
--> statement-breakpoint

-- ── The day's USD/INR rate (owner 2026-11-22, 6; orchestrator 2026-11-22: FBIL's rate is licence- and fee-bound for
--    pricing, so for now the ONLY source is a row Frrata staff type in Admin, audited by the caller in the same
--    transaction). One writer, frata_admin only; one reader for the door. ──
create or replace function app_fx_rate_set(p_day date, p_rate integer) returns void
  language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_day is null or p_day > (now() at time zone 'Asia/Kolkata')::date or p_rate is null or p_rate not between 500000 and 2000000 then
    raise exception 'bad_input' using errcode = 'P0001'; end if;
  insert into public.fx_rates (day, rate_e4, source, fetched_at) values (p_day, p_rate, 'manual', now())
  on conflict (day) do update set rate_e4 = excluded.rate_e4, source = 'manual', fetched_at = now();
end $$;
--> statement-breakpoint
create or replace function app_fx_rate_latest() returns table (day date, rate_e4 integer)
  language sql stable security definer set search_path = '' as $$
  select r.day, r.rate_e4 from public.fx_rates r order by r.day desc limit 1
$$;
--> statement-breakpoint

-- ═══ THE DOOR (C1·5): one reserve, one settle, one return, for V2a's previews and V3's turns ════════════════════════

-- ── Reserve (PERSON: a preview or a turn a person starts). The partner from the caller's live membership; the store a
--    live link of that partner; a Lead or Builder assigned to it (tenancy H3). The refusals in refuseReserve's order,
--    the cheap ones before the partner's lock (speed H2: an advisory lock, 2 s at most). The rate is stored on the use
--    (spec § 8). Crossing the low line or a client's 80% queues one email. ──
create or replace function app_pc_reserve(p_uid uuid, p_session uuid, p_stepup text, p_link uuid, p_kind text, p_what text,
  p_estimate integer, p_real boolean) returns table (use_id uuid, reserved integer)
  language plpgsql volatile security definer set search_path = '' as $$
declare me record; v_tenant uuid; v_rate integer; v_n integer; v_day timestamptz := (date_trunc('day', now() at time zone 'Asia/Kolkata')) at time zone 'Asia/Kolkata';
  v_budget integer; v_used integer; v_bal integer; v_need integer; v_use uuid := gen_random_uuid(); l record; b record;
begin
  select x.* into me from public.app_pm_live(p_uid) x;
  if me.member_id is null then raise exception 'not_owner' using errcode = 'P0001'; end if;
  perform public.app_partner_need(p_uid, p_session, p_stepup, false);
  select k.tenant_id into v_tenant from public.partner_links k where k.id = p_link and k.partner_id = me.partner_id and k.removed_at is null;
  if v_tenant is null or (me.role <> 'owner' and not exists (select 1 from public.partner_assignments a
      where a.partner_member_id = me.member_id and a.tenant_id = v_tenant)) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if p_kind not in ('preview', 'turn') or p_what is null
     or p_what not in ('start', 'looks', 'home', 'collection', 'product', 'page', 'edit', 'fix', 'preview', 'logo') then
    raise exception 'bad_input' using errcode = 'P0001'; end if;
  v_n := least(120, greatest(1, coalesce(p_estimate, 40)));
  select r.rate_e4 into v_rate from public.fx_rates r where r.day >= (now() at time zone 'Asia/Kolkata')::date - 4 order by r.day desc limit 1;
  if v_rate is null then raise exception 'rate' using errcode = 'P0001'; end if;
  if (select coalesce(sum(u.list_micro * u.rate_e4), 0) / 100000000 from public.partner_credit_uses u where u.created_at >= v_day) >= 2500000 then
    raise exception 'platform_day' using errcode = 'P0001'; end if;
  set local lock_timeout = '2s';
  perform pg_advisory_xact_lock(hashtextextended(me.partner_id::text || ':credits', 0));
  if (select coalesce(sum(public.app_pc_charged(u.id)), 0) from public.partner_credit_uses u
       where u.member_id = me.member_id and u.created_at >= v_day) + v_n > 300 then raise exception 'person_day' using errcode = 'P0001'; end if;
  select bb.credits into v_budget from public.partner_client_budgets bb where bb.partner_id = me.partner_id and bb.link_id = p_link;
  v_used := public.app_pc_link_used(me.partner_id, p_link);
  if v_budget is not null and v_used + v_n > v_budget then raise exception 'budget' using errcode = 'P0001'; end if;
  v_bal := public.app_pc_balance(me.partner_id, p_real);
  if v_bal < v_n then raise exception 'balance' using errcode = 'P0001'; end if;
  insert into public.partner_credit_uses (id, partner_id, link_id, member_id, kind, what, reserved, estimate, real_money, rate_e4)
    values (v_use, me.partner_id, p_link, me.member_id, p_kind, p_what, v_n, p_estimate, p_real, v_rate);
  v_need := v_n;
  for l in select x.lot_id, x.left_credits from public.app_pc_lots(me.partner_id, p_real) x where x.left_credits > 0 loop
    insert into public.partner_credit_entries (partner_id, kind, credits, lot_id, use_id) values (me.partner_id, 'reserve', -least(l.left_credits, v_need), l.lot_id, v_use);
    v_need := v_need - least(l.left_credits, v_need);
    exit when v_need = 0;
  end loop;
  select * into b from public.partner_billing pb where pb.partner_id = me.partner_id;
  if v_bal >= 50 and v_bal - v_n < 50 and coalesce(b.alert_low, true) and b.low_alerted_at is null then
    update public.partner_billing set low_alerted_at = now() where partner_id = me.partner_id;
    perform public.app_pc_notice(me.partner_id, 'low', 'low:' || me.partner_id || ':' || extract(epoch from now())::bigint);
  elsif v_bal - v_n >= 50 and b.low_alerted_at is not null then
    update public.partner_billing set low_alerted_at = null where partner_id = me.partner_id;
  end if;
  if v_budget is not null and v_used * 100 < v_budget * 80 and (v_used + v_n) * 100 >= v_budget * 80 and coalesce(b.alert_budget, true) then
    update public.partner_client_budgets set warned_at = now() where partner_id = me.partner_id and link_id = p_link and warned_at is null;
    if found then perform public.app_pc_notice(me.partner_id, 'budget_80', 'b80:' || p_link || ':' || extract(epoch from now())::bigint, p_link); end if;
  end if;
  return query select v_use, v_n;
end $$;
--> statement-breakpoint

-- ── Internal: give a use's credits back, last drawn first (the reverse of the draw's lot order); a lot that has ended gets them as a new 'return' lot for 12
--    months (unit-economics 8). ──
create or replace function app_pc_give_back(p_use uuid, p_credits integer) returns void
  language plpgsql volatile security definer set search_path = '' as $$
declare u record; r record; v_left integer := p_credits; v_late integer := 0; v_take integer;
begin
  select * into u from public.partner_credit_uses x where x.id = p_use;
  for r in select e.lot_id, -e.credits as taken, l.expires_at from public.partner_credit_entries e join public.partner_credit_entries l on l.id = e.lot_id
            where e.use_id = p_use and e.kind = 'reserve' order by l.expires_at desc, l.created_at desc, l.id desc loop
    exit when v_left = 0;
    v_take := least(v_left, r.taken);
    if r.expires_at > now() then
      insert into public.partner_credit_entries (partner_id, kind, credits, lot_id, use_id) values (u.partner_id, 'release', v_take, r.lot_id, p_use);
    else v_late := v_late + v_take; end if;
    v_left := v_left - v_take;
  end loop;
  if v_late > 0 then
    insert into public.partner_credit_entries (partner_id, kind, credits, use_id, expires_at) values (u.partner_id, 'return', v_late, p_use, now() + interval '12 months');
  end if;
end $$;
--> statement-breakpoint

-- ── Settle (SYSTEM: the server's measured list cost, never a figure from a request; security M5): charged at the rate
--    stored at reserve, never above the reserve; the rest given back. Once per use. Returns what was charged. ──
create or replace function app_pc_settle(p_use uuid, p_list_micro bigint) returns integer
  language plpgsql volatile security definer set search_path = '' as $$
declare u record; v_paise numeric; v_charged integer;
begin
  if p_list_micro is null or p_list_micro < 0 then raise exception 'bad_input' using errcode = 'P0001'; end if;
  select * into u from public.partner_credit_uses x where x.id = p_use and x.closed_at is null for update;
  if u.id is null then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended(u.partner_id::text || ':credits', 0));
  v_paise := ceil((p_list_micro::numeric * u.rate_e4 * u.loading_bp) / (100000000::numeric * 10000));
  v_charged := least(u.reserved, ceil(v_paise / 633)::integer);
  if u.reserved - v_charged > 0 then perform public.app_pc_give_back(u.id, u.reserved - v_charged); end if;
  update public.partner_credit_uses set list_micro = p_list_micro, closed_at = now() where id = u.id;
  return v_charged;
end $$;
--> statement-breakpoint

-- ── Return (SYSTEM: a Frrata-side failure, a timeout, a cancel): every credit back. Once per use. ──
create or replace function app_pc_return(p_use uuid, p_reason text) returns boolean
  language plpgsql volatile security definer set search_path = '' as $$
declare u record;
begin
  if p_reason not in ('frrata', 'timeout', 'cancelled') then raise exception 'bad_input' using errcode = 'P0001'; end if;
  select * into u from public.partner_credit_uses x where x.id = p_use and x.closed_at is null for update;
  if u.id is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(u.partner_id::text || ':credits', 0));
  perform public.app_pc_give_back(u.id, u.reserved);
  update public.partner_credit_uses set closed_at = now(), returned_at = now(), return_reason = p_reason where id = u.id;
  return true;
end $$;
--> statement-breakpoint

-- ═══ ADMIN (architecture B1): partner invoices in Frrata's GST export. Only GstRow's fields; never a test invoice. ═══
create or replace function admin_partner_gst_rows(p_from timestamptz, p_to timestamptz) returns table (
  number text, issued_at timestamptz, buyer_name text, buyer_gstin text, place_of_supply text, taxable bigint, cgst bigint, sgst bigint, igst bigint, total bigint)
  language sql stable security definer set search_path = '' as $$
  select i.number, i.issued_at, i.buyer_name, i.buyer_gstin, i.place_of_supply, i.taxable, i.cgst, i.sgst, i.igst, i.total
    from public.partner_invoices i where not i.test and i.issued_at >= p_from and i.issued_at < p_to order by i.number
$$;
--> statement-breakpoint

-- ═══ GRANTS ═══════════════════════════════════════════════════════════════════════════════════════════════════════
revoke all on function app_pc_owner(uuid, uuid, text, boolean, boolean), app_pc_lots(uuid, boolean), app_pc_balance(uuid, boolean),
  app_pc_charged(uuid), app_pc_window(uuid), app_pc_link_used(uuid, uuid), app_pc_notice(uuid, text, text, uuid, uuid),
  app_pc_on_partner_approved(), app_partner_credit_try(uuid, uuid, text, text),
  app_partner_credits_overview(uuid, uuid, text, boolean), app_partner_credits_usage(uuid, uuid, text, date, uuid, integer, timestamptz),
  app_partner_credits_budgets(uuid, uuid, text), app_partner_credits_payments(uuid, uuid, text), app_partner_invoice(uuid, uuid, text, uuid),
  app_partner_credits_panel(uuid, uuid, text, uuid, boolean), app_partner_set_budget(uuid, uuid, text, uuid, integer),
  app_partner_set_site_budget(uuid, uuid, text, integer), app_partner_set_alerts(uuid, uuid, text, boolean, boolean),
  app_partner_set_billing(uuid, uuid, text, text, text, text, text, text),
  app_partner_credit_buy(uuid, uuid, text, text, integer, text, text, bigint, bigint, bigint, bigint, bigint, boolean, boolean, text, text, text, text, text, text),
  app_partner_seat_change(uuid, uuid, text, text, text),
  app_pc_issue(uuid), app_pc_purchase_ctx(uuid), app_pc_set_customer(uuid, text), app_pc_purchase_order(uuid, text, boolean), app_pc_claim(uuid),
  app_pc_apply(text, text, boolean, bigint, text, boolean, text, text), app_pc_unsettled(interval, integer), app_pc_close(uuid, text),
  app_pc_renewals(integer), app_pc_renewal_begin(uuid, timestamptz, integer, timestamptz, text, integer, bigint, bigint, bigint, bigint, boolean, text, text, text, text, text, text),
  app_pc_renewals_notified(integer), app_pc_seat_end(uuid, boolean), app_pc_token_cancels(integer), app_pc_token_cancelled(uuid, text),
  app_pc_token_event(text, text), app_pc_refunds_due(integer), app_pc_refund_claim(uuid), app_pc_refund_done(uuid, text), app_pc_dispute(text),
  app_pc_notices_claim(integer), app_pc_notice_done(uuid, boolean, text), app_fx_rate_set(date, integer), app_fx_rate_latest(),
  app_pc_reserve(uuid, uuid, text, uuid, text, text, integer, boolean), app_pc_give_back(uuid, integer), app_pc_settle(uuid, bigint),
  app_pc_return(uuid, text), admin_partner_gst_rows(timestamptz, timestamptz)
  from public, anon, authenticated, service_role, frata_builder, frata_app, frata_admin;
--> statement-breakpoint
grant execute on function app_partner_credit_try(uuid, uuid, text, text),
  app_partner_credits_overview(uuid, uuid, text, boolean), app_partner_credits_usage(uuid, uuid, text, date, uuid, integer, timestamptz),
  app_partner_credits_budgets(uuid, uuid, text), app_partner_credits_payments(uuid, uuid, text), app_partner_invoice(uuid, uuid, text, uuid),
  app_partner_credits_panel(uuid, uuid, text, uuid, boolean), app_partner_set_budget(uuid, uuid, text, uuid, integer),
  app_partner_set_site_budget(uuid, uuid, text, integer), app_partner_set_alerts(uuid, uuid, text, boolean, boolean),
  app_partner_set_billing(uuid, uuid, text, text, text, text, text, text),
  app_partner_credit_buy(uuid, uuid, text, text, integer, text, text, bigint, bigint, bigint, bigint, bigint, boolean, boolean, text, text, text, text, text, text),
  app_partner_seat_change(uuid, uuid, text, text, text),
  app_pc_purchase_ctx(uuid), app_pc_set_customer(uuid, text), app_pc_purchase_order(uuid, text, boolean), app_pc_claim(uuid),
  app_pc_apply(text, text, boolean, bigint, text, boolean, text, text), app_pc_unsettled(interval, integer), app_pc_close(uuid, text),
  app_pc_renewals(integer), app_pc_renewal_begin(uuid, timestamptz, integer, timestamptz, text, integer, bigint, bigint, bigint, bigint, boolean, text, text, text, text, text, text),
  app_pc_renewals_notified(integer), app_pc_seat_end(uuid, boolean), app_pc_token_cancels(integer), app_pc_token_cancelled(uuid, text),
  app_pc_token_event(text, text), app_pc_refunds_due(integer), app_pc_refund_claim(uuid), app_pc_refund_done(uuid, text), app_pc_dispute(text),
  app_pc_notices_claim(integer), app_pc_notice_done(uuid, boolean, text), app_fx_rate_latest(),
  app_pc_reserve(uuid, uuid, text, uuid, text, text, integer, boolean), app_pc_settle(uuid, bigint), app_pc_return(uuid, text)
  to frata_app;
--> statement-breakpoint
grant execute on function admin_partner_gst_rows(timestamptz, timestamptz), app_fx_rate_set(date, integer) to frata_admin;
