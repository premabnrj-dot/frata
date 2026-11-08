-- =============================================================================
-- OFFERS O·4 ACCESS (docs/plans/2026-11-08-offers-o3-o4.md § O·4, plan review 1 and 6). Hand-written.
--
-- Admin's kill switch: frata_admin (NOBYPASSRLS) reads a shop's offers by the columns that say what an offer is and
-- where it stands, and sets only stopped_*. It reads no terms, limits, budget or codes, and nothing on order_discounts,
-- codes, targets or tiers. The shop cannot clear a stop: stopped_* is outside frata_app's column update grant.
-- Platform totals: app_admin_offer_totals returns, per shop, orders using an offer and the ₹ given since p_since —
-- aggregates only, never an order or a shopper. KNOWN COPY: its use rule restates discountUseSql/useOfRowSql
-- (src/lib/db/order-predicates.ts, discount-predicates.ts) where that module cannot reach; change both together
-- (an int test holds it to discountUses).
-- =============================================================================
grant select (id, tenant_id, title, style, starts_at, ends_at, started_at, paused_at, ended_at, stopped_at, stop_reason) on discounts to frata_admin;
--> statement-breakpoint
grant update (stopped_at, stopped_by, stop_reason) on discounts to frata_admin;
--> statement-breakpoint
create policy admin_read on discounts for select to frata_admin using (true);
--> statement-breakpoint
create policy admin_stop on discounts for update to frata_admin using (true) with check (true);
--> statement-breakpoint
create or replace function app_admin_offer_totals(p_since timestamptz) returns table (tenant_id uuid, orders bigint, given bigint)
  language sql stable security definer set search_path = '' as $$
  select od.tenant_id, count(distinct od.order_id), coalesce(sum(od.amount), 0)::bigint
    from public.order_discounts od join public.orders o on o.tenant_id = od.tenant_id and o.id = od.order_id
   where od.created_at >= p_since
     and case when od.class = 'payment'
              then (o.paid_at is not null and o.cancelled_at is null)
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
