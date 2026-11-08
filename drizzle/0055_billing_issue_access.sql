-- =============================================================================
-- BILLING B2 ACCESS (docs/plans/2026-11-08-billing.md § Review findings 5, 6, 8, 11, 17). Hand-written.
--
-- frrata_payments and frrata_credit_notes: a shop reads its own (frata_app under RLS); frata_admin reads all; NOBODY
-- writes them directly — only the three definers below, executed by frata_admin from src/lib/admin/billing.ts (ADMIN_ONLY,
-- audited in the same transaction). A credit note is final once written (trigger, every role).
-- app_issue_frrata_invoices numbers, freezes and closes a month in ONE transaction: it refuses unless the count and
-- total to issue are exactly what Admin reviewed, and every draft was redrafted on or after the 1st. Numbers come from
-- platform_counters, at issue only, never at draft; a test-mode run uses its own series (fy 'test-…').
-- =============================================================================
revoke all on frrata_payments, frrata_credit_notes from anon, authenticated, service_role;
--> statement-breakpoint
alter table frrata_payments enable row level security;
--> statement-breakpoint
alter table frrata_credit_notes enable row level security;
--> statement-breakpoint
grant select on frrata_payments, frrata_credit_notes to frata_app;
--> statement-breakpoint
create policy tenant_read on frrata_payments for select to frata_app using (tenant_id = app_current_tenant());
--> statement-breakpoint
create policy tenant_read on frrata_credit_notes for select to frata_app using (tenant_id = app_current_tenant());
--> statement-breakpoint
grant select on frrata_payments, frrata_credit_notes to frata_admin;
--> statement-breakpoint
create policy admin_read on frrata_payments for select to frata_admin using (true);
--> statement-breakpoint
create policy admin_read on frrata_credit_notes for select to frata_admin using (true);
--> statement-breakpoint
create or replace function frrata_credit_note_final() returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'a Frrata credit note is final once issued' using errcode = 'check_violation';
end $$;
--> statement-breakpoint
revoke all on function frrata_credit_note_final() from public, anon, authenticated, service_role;
--> statement-breakpoint
create trigger frrata_credit_notes_final before update or delete on frrata_credit_notes for each row execute function frrata_credit_note_final();
--> statement-breakpoint
create trigger frrata_credit_notes_no_truncate before truncate on frrata_credit_notes for each statement execute function frrata_credit_note_final();
--> statement-breakpoint
create or replace function app_issue_frrata_invoices(p_period timestamptz, p_expected_count int, p_expected_total bigint, p_staff uuid,
  p_seller_name text, p_seller_gstin text, p_seller_address text, p_sac text, p_test boolean, p_prefix text, p_fy text)
  returns table (issued int, closed int) language plpgsql security definer set search_path = '' as $$
declare n_count int; n_total bigint; stale int; nxt int; r record; i int := 0; c int := 0;
begin
  if p_staff is null or p_period is null or coalesce(p_seller_name, '') = '' or coalesce(p_fy, '') = '' or coalesce(p_prefix, '') = '' then
    raise exception 'issue: missing seller, period or series' using errcode = 'invalid_parameter_value'; end if;
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
            where f.period_start = p_period and f.issued_at is null order by t.name, f.id loop
    if r.rolled or r.total <= 0 then
      -- A rolled bill or a ₹0 month: closed (issued_at), no number, nothing to collect.
      update public.frrata_invoices set issued_at = now(), issued_by = p_staff, test_mode = p_test where id = r.id;
      c := c + 1;
    else
      insert into public.platform_counters (kind, fy, next) values ('invoice', p_fy, 2)
        on conflict (kind, fy) do update set next = public.platform_counters.next + 1 returning next - 1 into nxt;
      update public.frrata_invoices set number = p_prefix || p_fy || '/' || lpad(nxt::text, 6, '0'), issued_at = now(), issued_by = p_staff,
        buyer_name = coalesce(nullif(r.legal_name, ''), nullif(r.slegal, ''), r.tname), buyer_gstin = r.gstin,
        buyer_address = coalesce(nullif(r.baddr, ''), r.saddr, ''), place_of_supply = coalesce(r.state_code, substr(r.gstin, 1, 2)),
        seller_name = p_seller_name, seller_gstin = nullif(p_seller_gstin, ''), seller_address = p_seller_address, sac = p_sac, test_mode = p_test
       where id = r.id;
      i := i + 1;
    end if;
  end loop;
  return query select i, c;
end $$;
--> statement-breakpoint
create or replace function app_record_frrata_payment(p_invoice uuid, p_amount bigint, p_method text, p_utr text, p_staff uuid) returns uuid
  language plpgsql security definer set search_path = '' as $$
declare inv record; paid bigint; credited bigint; pid uuid;
begin
  select id, tenant_id, total, number from public.frrata_invoices where id = p_invoice and number is not null for update into inv;
  if inv.id is null then raise exception 'payment: no issued invoice' using errcode = 'invalid_parameter_value'; end if;
  if p_amount is null or p_amount <= 0 or coalesce(btrim(p_utr), '') = '' or p_method not in ('bank_transfer', 'upi', 'card', 'paylink') then
    raise exception 'payment: amount, method and reference are needed' using errcode = 'invalid_parameter_value'; end if;
  select coalesce(sum(amount), 0) into paid from public.frrata_payments where invoice_id = p_invoice and captured_at is not null;
  select coalesce(sum(total), 0) into credited from public.frrata_credit_notes where invoice_id = p_invoice;
  if p_amount > inv.total - paid - credited then raise exception 'payment: more than is due' using errcode = 'check_violation'; end if;
  insert into public.frrata_payments (tenant_id, invoice_id, method, amount, utr, captured_at, recorded_by)
    values (inv.tenant_id, p_invoice, p_method, p_amount, upper(btrim(p_utr)), now(), p_staff) returning id into pid;
  return pid;
end $$;
--> statement-breakpoint
create or replace function app_issue_frrata_credit_note(p_invoice uuid, p_taxable bigint, p_reason text, p_staff uuid, p_prefix text, p_fy text)
  returns text language plpgsql security definer set search_path = '' as $$
declare inv record; done bigint; nxt int; num text; intra boolean; h1 bigint; h2 bigint; hi bigint;
begin
  select id, tenant_id, taxable, cgst, sgst, total, number, test_mode from public.frrata_invoices where id = p_invoice and number is not null for update into inv;
  if inv.id is null then raise exception 'credit: no issued invoice' using errcode = 'invalid_parameter_value'; end if;
  if p_taxable is null or p_taxable <= 0 or length(coalesce(btrim(p_reason), '')) < 3 then
    raise exception 'credit: an amount and a reason are needed' using errcode = 'invalid_parameter_value'; end if;
  -- Capped at what the invoice still holds (finding 17): its taxable value less what was already credited.
  select coalesce(sum(taxable), 0) into done from public.frrata_credit_notes where invoice_id = p_invoice;
  if p_taxable > inv.taxable - done then raise exception 'credit: more than the invoice holds' using errcode = 'check_violation'; end if;
  intra := inv.cgst > 0 or inv.sgst > 0;
  -- Each head on the taxable value (finding 20), half up, as applyBps.
  h1 := case when intra then round(p_taxable * 900 / 10000.0) else 0 end;
  h2 := h1;
  hi := case when intra then 0 else round(p_taxable * 1800 / 10000.0) end;
  insert into public.platform_counters (kind, fy, next) values ('credit', p_fy, 2)
    on conflict (kind, fy) do update set next = public.platform_counters.next + 1 returning next - 1 into nxt;
  num := p_prefix || p_fy || '/C' || lpad(nxt::text, 5, '0');
  insert into public.frrata_credit_notes (tenant_id, invoice_id, number, taxable, cgst, sgst, igst, total, reason, test_mode, issued_by)
    values (inv.tenant_id, p_invoice, num, p_taxable, h1, h2, hi, p_taxable + h1 + h2 + hi, btrim(p_reason), inv.test_mode, p_staff);
  return num;
end $$;
--> statement-breakpoint
revoke all on function app_issue_frrata_invoices(timestamptz, int, bigint, uuid, text, text, text, text, boolean, text, text), app_record_frrata_payment(uuid, bigint, text, text, uuid),
  app_issue_frrata_credit_note(uuid, bigint, text, uuid, text, text) from public, anon, authenticated, service_role;
--> statement-breakpoint
grant execute on function app_issue_frrata_invoices(timestamptz, int, bigint, uuid, text, text, text, text, boolean, text, text), app_record_frrata_payment(uuid, bigint, text, text, uuid),
  app_issue_frrata_credit_note(uuid, bigint, text, uuid, text, text) to frata_admin;
