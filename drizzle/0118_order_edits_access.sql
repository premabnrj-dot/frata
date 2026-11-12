-- =============================================================================
-- ORDER EDIT OE·1 — ACCESS (docs/plans/2026-11-12-order-edit.md § Tasks 3; tenancy review 2026-11-12). Hand-written.
--
-- order_edits, order_edit_lines: the shop reads and appends its OWN rows; nobody changes or deletes one (an undone edit
--   is its event's undo, in order_events). frata_admin: none. anon, authenticated, service_role: none (Supabase grants
--   every new object by default; Frrata never uses that key).
-- order_lines stays "as sold": an edit takes a line out (removed_at) and names what it became (replaced_by), and an
--   edit's re-plan rewrites the product offers' part of a kept line's discount with the rest of its money (product_discount
--   joins writeReprice's columns). Nothing else on a line is ever updated (proof check 72).
-- order_discounts: an offer an edit takes off gets removed_at; its amount and terms never change (a new row carries a
--   new amount). One live use per order and offer (0117's partial unique index).
-- app_admin_offer_totals restates the use rule (KNOWN COPY of useOfRowSql): a removed use is no use.
-- order_edit_lines.variant_id is this shop's variant (composite FK), set null when it is deleted, as order_lines' (0017).
-- order_lines_product (0101) becomes order_lines_product_live: every reader by product reads live lines only (traffic,
--   best sellers), so the partial index carries the filter and keeps its index-only scan (speed review 2026-11-12).
--   The new one is built before the old one is dropped.
-- =============================================================================
alter table order_edit_lines add constraint order_edit_lines_variant_fk foreign key (tenant_id, variant_id) references variants (tenant_id, id) on delete set null (variant_id);
--> statement-breakpoint
create index if not exists order_lines_product_live on order_lines (tenant_id, product_id) include (order_id) where product_id is not null and removed_at is null;
--> statement-breakpoint
drop index if exists order_lines_product;
--> statement-breakpoint
revoke all on order_edits, order_edit_lines from anon, authenticated, service_role;
--> statement-breakpoint
alter table order_edits enable row level security;
--> statement-breakpoint
alter table order_edit_lines enable row level security;
--> statement-breakpoint
grant select, insert on order_edits, order_edit_lines to frata_app;
--> statement-breakpoint
create policy tenant_rows on order_edits for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint
create policy tenant_rows on order_edit_lines for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint
grant update (removed_at, replaced_by, product_discount) on order_lines to frata_app;
--> statement-breakpoint
grant update (removed_at) on order_discounts to frata_app;
--> statement-breakpoint
create or replace function app_admin_offer_totals(p_since timestamptz) returns table (tenant_id uuid, orders bigint, given bigint)
  language sql stable security definer set search_path = '' as $$
  select od.tenant_id, count(distinct od.order_id), coalesce(sum(od.amount), 0)::bigint
    from public.order_discounts od join public.orders o on o.tenant_id = od.tenant_id and o.id = od.order_id
   where od.created_at >= p_since and od.removed_at is null
     and case when od.class = 'payment' or od.method = 'prepaid'
              then (o.paid_at is not null and o.cancelled_at is null)
                or (o.payment_method = 'prepaid' and o.paid_at is null and o.switched_to_cod_at is null and o.cancelled_at is null and o.pay_by > now())
              when od.method = 'cod'
              then (o.cancelled_at is null and o.paid_at is null and not (o.payment_method = 'prepaid' and o.switched_to_cod_at is null))
                or (o.payment_method = 'prepaid' and o.paid_at is null and o.switched_to_cod_at is null and o.cancelled_at is null and o.pay_by > now())
              else (o.cancelled_at is null and not (o.payment_method = 'prepaid' and o.paid_at is null and o.switched_to_cod_at is null))
                or (o.payment_method = 'prepaid' and o.paid_at is null and o.switched_to_cod_at is null and o.cancelled_at is null and o.pay_by > now())
         end
   group by od.tenant_id
$$;
--> statement-breakpoint
revoke all on function app_admin_offer_totals(timestamptz) from public, anon, authenticated, service_role, frata_app;
--> statement-breakpoint
grant execute on function app_admin_offer_totals(timestamptz) to frata_admin;
