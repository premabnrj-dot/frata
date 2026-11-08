-- =============================================================================
-- BILLING B0 ACCESS (docs/specs/2026-11-08-billing.md; plan docs/plans/2026-11-08-billing.md § Review findings 6, 8–11).
-- Hand-written.
--
-- frata_app, inside the shop (withTenant): reads its own billing rows; the billing run drafts this month's invoice —
--   inserts and updates it only while issued_at is null, and only the draft columns (never number, issued_at, the
--   buyer snapshot); replaces a draft's lines, fees and credits. It never deletes an invoice.
-- billing_accounts: frata_app sees and edits the detail columns only (legal name, GSTIN, address, state, email);
--   the gateway and mandate columns are written by definers (B3) and never reach frata_app.
-- platform_counters: no grant to anyone; the issue definer (B2) owns it.
-- frata_admin: reads invoices, lines, fees, credits and the billing details (not the gateway token) across shops.
-- An issued invoice is final: triggers refuse any UPDATE or DELETE of it, and any change to its lines, fees or
--   credits, whoever runs it (a correction is a credit note).
-- =============================================================================
revoke all on billing_accounts, frrata_invoices, frrata_invoice_lines, frrata_invoice_fees, frrata_fee_credits, platform_counters from anon, authenticated, service_role;
--> statement-breakpoint
alter table billing_accounts enable row level security;
--> statement-breakpoint
alter table frrata_invoices enable row level security;
--> statement-breakpoint
alter table frrata_invoice_lines enable row level security;
--> statement-breakpoint
alter table frrata_invoice_fees enable row level security;
--> statement-breakpoint
alter table frrata_fee_credits enable row level security;
--> statement-breakpoint
alter table platform_counters enable row level security;
--> statement-breakpoint
-- No role reads or writes it; the issue definer (B2) runs as the owner, which row security does not bind.
create policy definer_only on platform_counters as restrictive for all to public using (false) with check (false);
--> statement-breakpoint
grant select (tenant_id, legal_name, gstin, address, state_code, email, updated_at) on billing_accounts to frata_app;
--> statement-breakpoint
grant insert (tenant_id, legal_name, gstin, address, state_code, email, updated_at) on billing_accounts to frata_app;
--> statement-breakpoint
grant update (legal_name, gstin, address, state_code, email, updated_at) on billing_accounts to frata_app;
--> statement-breakpoint
create policy tenant_rows on billing_accounts for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint
grant select on frrata_invoices to frata_app;
--> statement-breakpoint
grant insert (tenant_id, period_start, period_end, drafted_at, taxable, cgst, sgst, igst, total, carry_in, carry_out, rolled, orders_billed, included_orders) on frrata_invoices to frata_app;
--> statement-breakpoint
grant update (drafted_at, taxable, cgst, sgst, igst, total, carry_in, carry_out, rolled, orders_billed, included_orders) on frrata_invoices to frata_app;
--> statement-breakpoint
create policy tenant_read on frrata_invoices for select to frata_app using (tenant_id = app_current_tenant());
--> statement-breakpoint
create policy tenant_draft on frrata_invoices for insert to frata_app with check (tenant_id = app_current_tenant() and issued_at is null);
--> statement-breakpoint
create policy tenant_redraft on frrata_invoices for update to frata_app using (tenant_id = app_current_tenant() and issued_at is null) with check (tenant_id = app_current_tenant() and issued_at is null);
--> statement-breakpoint
grant select, insert, delete on frrata_invoice_lines, frrata_invoice_fees, frrata_fee_credits to frata_app;
--> statement-breakpoint
create policy tenant_rows on frrata_invoice_lines for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint
create policy tenant_rows on frrata_invoice_fees for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint
create policy tenant_rows on frrata_fee_credits for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint
grant select (tenant_id, legal_name, gstin, address, state_code, email, mandate_method, mandate_at, mandate_revoked_at, updated_at) on billing_accounts to frata_admin;
--> statement-breakpoint
create policy admin_read on billing_accounts for select to frata_admin using (true);
--> statement-breakpoint
grant select on frrata_invoices, frrata_invoice_lines, frrata_invoice_fees, frrata_fee_credits to frata_admin;
--> statement-breakpoint
create policy admin_read on frrata_invoices for select to frata_admin using (true);
--> statement-breakpoint
create policy admin_read on frrata_invoice_lines for select to frata_admin using (true);
--> statement-breakpoint
create policy admin_read on frrata_invoice_fees for select to frata_admin using (true);
--> statement-breakpoint
create policy admin_read on frrata_fee_credits for select to frata_admin using (true);
--> statement-breakpoint
-- An issued invoice is final, for every role (a definer included). Plain (invoker) functions with an empty search
-- path: a child row's shop is the caller's own, so the caller already sees its invoice (tenancy audit 2026-11-08).
create or replace function frrata_invoice_frozen() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'TRUNCATE' then raise exception 'frrata invoices are never truncated' using errcode = 'check_violation'; end if;
  if old.issued_at is not null then raise exception 'frrata invoice % is issued and final', old.id using errcode = 'check_violation'; end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
--> statement-breakpoint
create trigger frrata_invoices_frozen before update or delete on frrata_invoices for each row execute function frrata_invoice_frozen();
--> statement-breakpoint
create trigger frrata_invoices_no_truncate before truncate on frrata_invoices for each statement execute function frrata_invoice_frozen();
--> statement-breakpoint
-- A line, fee or credit of an issued invoice never changes, and never moves off one.
create or replace function frrata_invoice_child_frozen() returns trigger language plpgsql set search_path = '' as $$
declare inv uuid := case when tg_op = 'DELETE' then old.invoice_id else new.invoice_id end;
begin
  if tg_op = 'UPDATE' and old.invoice_id is distinct from new.invoice_id and exists (select 1 from public.frrata_invoices where id = old.invoice_id and issued_at is not null)
    then raise exception 'a row of issued frrata invoice % is final', old.invoice_id using errcode = 'check_violation'; end if;
  if exists (select 1 from public.frrata_invoices where id = inv and issued_at is not null)
    then raise exception 'a row of issued frrata invoice % is final', inv using errcode = 'check_violation'; end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
--> statement-breakpoint
revoke all on function frrata_invoice_frozen(), frrata_invoice_child_frozen() from public, anon, authenticated, service_role;
--> statement-breakpoint
create trigger frrata_invoice_lines_frozen before insert or update or delete on frrata_invoice_lines for each row execute function frrata_invoice_child_frozen();
--> statement-breakpoint
create trigger frrata_invoice_fees_frozen before insert or update or delete on frrata_invoice_fees for each row execute function frrata_invoice_child_frozen();
--> statement-breakpoint
create trigger frrata_fee_credits_frozen before insert or update or delete on frrata_fee_credits for each row execute function frrata_invoice_child_frozen();
--> statement-breakpoint
-- The billing run's list: shops whose plan began before the month ends. Ids only; each draft is then written inside
-- that shop's own transaction (src/lib/billing/draft.ts, withTenant), never under a no-tenant policy.
create or replace function app_shops_to_bill(p_before timestamptz) returns setof uuid
  language sql stable security definer set search_path = '' as $$
  select distinct tp.tenant_id from public.tenant_plans tp where tp.starts_at < p_before
$$;
--> statement-breakpoint
revoke all on function app_shops_to_bill(timestamptz) from public, anon, authenticated, service_role;
--> statement-breakpoint
grant execute on function app_shops_to_bill(timestamptz) to frata_app;
