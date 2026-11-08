-- =============================================================================
-- OFFERS ACCESS, O·0 (docs/specs/2026-11-08-coupons.md; plan and its tenancy review: docs/plans/2026-11-08-offers.md).
-- Hand-written.
--
-- discounts: the shop reads, adds and changes its OWN offers, column by column (never id, tenant_id or created_*);
--   nothing deletes (orders point at them). discount_codes: read and add only — a code never changes and is never
--   handed to another offer. order_discounts and price_history: read and add only. frata_admin: nothing on any of
--   the four (Admin's kill switch and platform totals come in O·4 through a column grant and a definer). API roles:
--   nothing (Supabase grants service_role every new object by default; Frrata never uses that key).
-- Repricing a placed order (switch to COD, a capture after a switch: src/lib/orders/reprice.ts) rewrites a line's
--   discount and tax, so those columns join order_lines' update grant.
-- price_history is written by a trigger on variants that runs as the caller (no definer): under frata_app the
--   policy holds, and the row takes the variant's own tenant_id.
-- =============================================================================
revoke all on discounts, discount_codes, order_discounts, price_history from anon, authenticated, service_role;
--> statement-breakpoint
alter table discounts enable row level security;
--> statement-breakpoint
alter table discount_codes enable row level security;
--> statement-breakpoint
alter table order_discounts enable row level security;
--> statement-breakpoint
alter table price_history enable row level security;
--> statement-breakpoint
grant select, insert on discounts, discount_codes, order_discounts, price_history to frata_app;
--> statement-breakpoint
grant update (title, style, percent_bps, amount_off, cap, min_subtotal, limit_total, limit_per_phone, budget, starts_at, ends_at,
  started_at, started_by, paused_at, ended_at, listed, combines_with_payment, announce) on discounts to frata_app;
--> statement-breakpoint
grant update (line_discount, taxable_value, gst_bps, gst) on order_lines to frata_app;
--> statement-breakpoint
create policy tenant_rows on discounts for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint
create policy tenant_rows on discount_codes for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint
create policy tenant_rows on order_discounts for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint
create policy tenant_rows on price_history for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint
create or replace function app_record_price() returns trigger
  language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.price_history (tenant_id, variant_id, price) values (new.tenant_id, new.id, new.price);
  return null;
end $$;
--> statement-breakpoint
revoke all on function app_record_price() from public, anon, authenticated, service_role;
--> statement-breakpoint
grant execute on function app_record_price() to frata_app;
--> statement-breakpoint
create trigger variants_price_history_insert after insert on variants for each row execute function app_record_price();
--> statement-breakpoint
create trigger variants_price_history_update after update of price on variants for each row when (old.price is distinct from new.price) execute function app_record_price();
--> statement-breakpoint
-- Today's prices, so the 30-day lowest exists from the first day (run here as the migration's owner, never from the app).
insert into price_history (tenant_id, variant_id, price, from_at) select tenant_id, id, price, now() from variants;
