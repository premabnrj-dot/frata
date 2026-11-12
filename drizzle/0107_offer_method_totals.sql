-- =============================================================================
-- OFFER USES BY WAY OF PAYING (shop stress test 2026-11-11). Hand-written.
--
-- order_discounts.method (0106) marks an order offer kept for one way of paying only: 'prepaid' (it went with the
-- pay-online saving) or 'cod' (the better one paying on delivery, kept for a switch). app_admin_offer_totals restates
-- the use rule (KNOWN COPY of discountUseSql/useOfRowSql, 0042), so it reads the row's way too: online only — paid
-- online, or holding; on delivery only — standing and not paid online, or holding; both — standing or holding. The
-- grants are unchanged (create or replace keeps them); restated so the function's access reads in one place.
-- =============================================================================
create or replace function app_admin_offer_totals(p_since timestamptz) returns table (tenant_id uuid, orders bigint, given bigint)
  language sql stable security definer set search_path = '' as $$
  select od.tenant_id, count(distinct od.order_id), coalesce(sum(od.amount), 0)::bigint
    from public.order_discounts od join public.orders o on o.tenant_id = od.tenant_id and o.id = od.order_id
   where od.created_at >= p_since
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
