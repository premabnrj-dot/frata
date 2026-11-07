-- =============================================================================
-- ORDERS WORK ACCESS (1D, docs/specs/2026-11-07-orders.md). Hand-written.
-- order_events and order_notes: frata_app reads and appends its own shop's
-- rows, never changes or removes one; frata_admin and the API roles: nothing.
-- Every new orders column is nullable or defaulted: the code before 1D keeps
-- placing orders between this migration and the push (deploy order, plan 1D·7).
-- =============================================================================
-- service_role too: Supabase grants it every new object by default; Frata never uses that key (tenancy audit 2026-11-07).
revoke all on order_events, order_notes from anon, authenticated, service_role;
--> statement-breakpoint
alter table order_events enable row level security;
--> statement-breakpoint
alter table order_notes enable row level security;
--> statement-breakpoint
grant select, insert on order_events, order_notes to frata_app;
--> statement-breakpoint
create policy tenant_rows on order_events for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint
create policy tenant_rows on order_notes for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint
-- An undo points at the event it reverses, on the same order of the same shop.
alter table order_events add constraint order_events_undoes_fk foreign key (tenant_id, order_id, undoes) references order_events (tenant_id, order_id, id);
--> statement-breakpoint
-- An order is never deleted by the app: it would take its history, notes and an issued invoice number with it.
-- Abandoned orders are erased (personal fields blanked), not deleted. Nothing in src/ deletes an order.
revoke delete on orders from frata_app;
--> statement-breakpoint
-- Lines stay as sold; only when their stock was taken and their share of the charges may be written later.
grant update (stock_taken_at, charge_taxable, charge_gst) on order_lines to frata_app;
--> statement-breakpoint
-- An invoice number, once issued, never changes or goes away (a reprint shows the same one).
create or replace function app_invoice_number_fixed() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.invoice_number is not null and new.invoice_number is distinct from old.invoice_number then
    raise exception 'invoice number % is issued and cannot change', old.invoice_number using errcode = 'check_violation';
  end if;
  return new;
end $$;
--> statement-breakpoint
revoke all on function app_invoice_number_fixed() from public, anon, authenticated, service_role;
--> statement-breakpoint
create trigger orders_invoice_number_fixed before update of invoice_number on orders for each row execute function app_invoice_number_fixed();
--> statement-breakpoint
-- The backfill for orders placed before 1D, idempotent (only rows still null). Run here, and again
-- after the push for orders the old code placed in between: `select app_backfill_0019()` as postgres.
-- Owned by the migrating role; nobody else may call it. Dropped when 1D closes.
create or replace function app_backfill_0019() returns table (lines_stamped bigint, orders_gstin bigint, flagged_orders uuid[])
  language plpgsql set search_path = '' as $$
declare n_lines bigint; n_gstin bigint; flagged uuid[];
begin
  -- Stock: the old per-order flag, stamped on in-stock lines only where every line was taken.
  with s as (
    update public.order_lines l set stock_taken_at = coalesce(o.switched_to_cod_at, o.paid_at, o.placed_at)
      from public.orders o
     where o.tenant_id = l.tenant_id and o.id = l.order_id and l.kind = 'in_stock' and l.stock_taken_at is null
       and coalesce(o.checkout->>'stockTaken', 'false') = 'true' and coalesce(o.checkout->>'outOfStockOnPayment', 'false') <> 'true'
    returning 1)
  select count(*) into n_lines from s;
  -- Orders where some lines were taken and some not cannot be told apart: a person looks at each.
  select coalesce(array_agg(o.id), '{}') into flagged from public.orders o where coalesce(o.checkout->>'outOfStockOnPayment', 'false') = 'true';
  -- The seller's GSTIN, only where the order was placed under the same registration (its state matches).
  with g as (
    update public.orders o set seller_gstin = s.gstin from public.shop_settings s
     where s.tenant_id = o.tenant_id and o.seller_gstin is null and s.gstin is not null and o.shop_state is not null and o.shop_state = left(s.gstin, 2)
    returning 1)
  select count(*) into n_gstin from g;
  return query select n_lines, n_gstin, flagged;
end $$;
--> statement-breakpoint
revoke all on function app_backfill_0019() from public, anon, authenticated, service_role, frata_app, frata_admin;
--> statement-breakpoint
select * from app_backfill_0019();
