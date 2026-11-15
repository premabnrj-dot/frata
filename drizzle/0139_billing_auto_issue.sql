-- Billing rework R2 (spec docs/specs/2026-11-15-billing-rework.md; plan § Review findings H1, H2, B1, M1): bills are
-- issued on the 1st without a person. The issue definer takes p_system: exactly one of a staff member or the system;
-- a system run never issues test invoices, needs a real GSTIN and SAC, and issues only this IST month on its 1st to
-- 3rd; it writes its own audit row (actor_kind 'system', no user, no email: 0137). Everything else is unchanged.
drop function app_issue_frrata_invoices(timestamptz, int, bigint, uuid, text, text, text, text, boolean, text, text);
--> statement-breakpoint
create function app_issue_frrata_invoices(p_period timestamptz, p_expected_count int, p_expected_total bigint, p_staff uuid,
  p_seller_name text, p_seller_gstin text, p_seller_address text, p_sac text, p_test boolean, p_prefix text, p_fy text,
  p_system boolean default false)
  returns table (issued int, closed int) language plpgsql security definer set search_path = '' as $$
declare n_count int; n_total bigint; stale int; nxt int; r record; i int := 0; c int := 0;
  -- The series follows the run: a test-mode run numbers in its own year key ('T26-27'), never the real one.
  v_fy text := case when p_test then 'T' || p_fy else p_fy end;
begin
  -- Exactly one issuer: a staff member (Admin) or the system (the 1st's run, billing rework R2).
  if (p_staff is null) <> coalesce(p_system, false) or p_period is null or coalesce(p_seller_name, '') = '' or coalesce(p_fy, '') = '' or coalesce(p_prefix, '') = '' then
    raise exception 'issue: missing seller, period or series' using errcode = 'invalid_parameter_value'; end if;
  -- A system run (security review 2026-11-15 H1, M1): never test invoices; a real GSTIN and SAC; only this IST month,
  -- and only on its 1st to 3rd.
  if p_system then
    if p_test then raise exception 'issue: a system run never issues test invoices' using errcode = 'check_violation'; end if;
    if coalesce(p_seller_gstin, '') !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' or coalesce(p_sac, '') !~ '^[0-9]{4,8}$' then
      raise exception 'issue: a system run needs Frrata''s GSTIN and SAC' using errcode = 'check_violation'; end if;
    if p_period <> (date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata')
       or extract(day from now() at time zone 'Asia/Kolkata') > 3 then
      raise exception 'issue: a system run issues this month, on the 1st to 3rd only' using errcode = 'check_violation'; end if;
  end if;
  if p_period > now() then raise exception 'issue: that month has not begun' using errcode = 'invalid_parameter_value'; end if;
  -- Every draft of the month, locked, so neither the run nor a page view redrafts one under us.
  perform 1 from public.frrata_invoices where period_start = p_period and issued_at is null for update;
  select count(*) filter (where drafted_at < p_period) into stale from public.frrata_invoices where period_start = p_period and issued_at is null;
  if stale > 0 then raise exception 'issue: % draft(s) were drafted before the 1st; run drafts again', stale using errcode = 'check_violation'; end if;
  select count(*), coalesce(sum(total), 0) into n_count, n_total from public.frrata_invoices
   where period_start = p_period and issued_at is null and not rolled and total > 0;
  if n_count <> p_expected_count or n_total <> p_expected_total then
    raise exception 'issue: expected % invoices totalling %, found % totalling %', p_expected_count, p_expected_total, n_count, n_total using errcode = 'check_violation'; end if;
  for r in select f.id, f.tenant_id, f.rolled, f.total, t.name tname, b.legal_name, b.gstin, b.address baddr, b.state_code, s.legal_name slegal, s.address saddr
             from public.frrata_invoices f join public.tenants t on t.id = f.tenant_id
             left join public.billing_accounts b on b.tenant_id = f.tenant_id left join public.shop_settings s on s.tenant_id = f.tenant_id
            where f.period_start = p_period and f.issued_at is null order by t.name, f.id for update of f loop
    if r.rolled or r.total <= 0 then
      -- A rolled bill or a ₹0 month: closed (issued_at), no number, nothing to collect.
      update public.frrata_invoices set issued_at = now(), issued_by = p_staff, test_mode = p_test where id = r.id;
      c := c + 1;
    else
      insert into public.platform_counters (kind, fy, next) values ('invoice', v_fy, 2)
        on conflict (kind, fy) do update set next = public.platform_counters.next + 1 returning next - 1 into nxt;
      update public.frrata_invoices set number = p_prefix || v_fy || '/' || lpad(nxt::text, 6, '0'), issued_at = now(), issued_by = p_staff,
        buyer_name = coalesce(nullif(r.legal_name, ''), nullif(r.slegal, ''), r.tname), buyer_gstin = r.gstin,
        buyer_address = coalesce(nullif(r.baddr, ''), r.saddr, ''), place_of_supply = coalesce(r.state_code, substr(r.gstin, 1, 2)),
        seller_name = p_seller_name, seller_gstin = nullif(p_seller_gstin, ''), seller_address = p_seller_address, sac = p_sac, test_mode = p_test
       where id = r.id;
      i := i + 1;
    end if;
  end loop;
  -- The rows numbered are exactly the rows reviewed (a draft committed between the count and the loop is refused).
  if i <> p_expected_count then raise exception 'issue: the drafts changed while issuing; review them again' using errcode = 'check_violation'; end if;
  if p_system then
    insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
      values (null, null, null, 'system', 'billing.issue', p_period::text, jsonb_build_object('count', p_expected_count, 'total', p_expected_total, 'issued', i, 'closed', c));
  end if;
  return query select i, c;
end $$;
--> statement-breakpoint
revoke all on function app_issue_frrata_invoices(timestamptz, int, bigint, uuid, text, text, text, text, boolean, text, text, boolean) from public, anon, authenticated, service_role, frata_app;
--> statement-breakpoint
grant execute on function app_issue_frrata_invoices(timestamptz, int, bigint, uuid, text, text, text, text, boolean, text, text, boolean) to frata_admin;
