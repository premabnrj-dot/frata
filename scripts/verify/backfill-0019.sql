-- Fixtures and checks for scripts/verify/backfill-0019.sh. phase=before loads orders as the
-- code before 1D wrote them (the jsonb stock flags); phase=after checks what 0020's backfill made.
\set ON_ERROR_STOP on
\if :{?phase}
\else
  \echo 'run through scripts/verify/backfill-0019.sh' \quit
\endif
select :'phase' = 'before' as before \gset
\if :before
insert into tenants (id, slug, name) values ('aaaaaaaa-0000-0000-0000-00000000000a', 'bf-reg', 'Registered'), ('bbbbbbbb-0000-0000-0000-00000000000b', 'bf-unreg', 'Unregistered');
insert into shop_settings (tenant_id, gstin) values ('aaaaaaaa-0000-0000-0000-00000000000a', '08AAAAA0000A1Z5'), ('bbbbbbbb-0000-0000-0000-00000000000b', null);
-- 1 COD (stock taken), 2 paid online (taken at capture), 3 paid after it sold out (some lines not taken),
-- 4 abandoned online (never taken), 5 placed while the shop's GSTIN was another state's, 6 an unregistered shop.
insert into orders (id, tenant_id, number, payment_method, placed_at, paid_at, shop_state, checkout) values
  ('00000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a', 1, 'cod',     now(), null,  '08', '{"stockTaken": true}'),
  ('00000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-00000000000a', 2, 'prepaid', now(), now(), '08', '{"stockTaken": true}'),
  ('00000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-00000000000a', 3, 'prepaid', now(), now(), '08', '{"stockTaken": true, "outOfStockOnPayment": true}'),
  ('00000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-00000000000a', 4, 'prepaid', now(), null,  '08', '{"stockTaken": false}'),
  ('00000000-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-00000000000a', 5, 'cod',     now(), null,  '27', '{"stockTaken": true}'),
  ('00000000-0000-0000-0000-000000000006', 'bbbbbbbb-0000-0000-0000-00000000000b', 1, 'cod',     now(), null,  null, '{"stockTaken": true}');
insert into order_lines (tenant_id, order_id, title, qty, unit_price, taxable_value, kind)
select o.tenant_id, o.id, 'Kurta', 1, 100000, 95238, k from orders o cross join (values ('in_stock'), ('preorder')) v(k);
\else
do $$ declare r record; begin
  for r in select o.number, o.tenant_id, o.seller_gstin,
      count(*) filter (where l.kind = 'in_stock' and l.stock_taken_at is not null) taken,
      count(*) filter (where l.kind = 'preorder' and l.stock_taken_at is not null) pre_taken
    from orders o join order_lines l on l.order_id = o.id group by o.number, o.tenant_id, o.seller_gstin loop
    if r.pre_taken <> 0 then raise exception 'FAIL: a pre-order line was marked taken (order %)', r.number; end if;
    if r.tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a' then
      if r.number in (1, 2, 5) and r.taken <> 1 then raise exception 'FAIL: order % in-stock line not marked taken', r.number; end if;
      if r.number in (3, 4) and r.taken <> 0 then raise exception 'FAIL: order % marked taken though its stock was not (all) taken', r.number; end if;
      if r.number in (1, 2, 3, 4) and r.seller_gstin is distinct from '08AAAAA0000A1Z5' then raise exception 'FAIL: order % seller GSTIN %', r.number, r.seller_gstin; end if;
      if r.number = 5 and r.seller_gstin is not null then raise exception 'FAIL: order 5 got today''s GSTIN though placed under another state'; end if;
    elsif r.seller_gstin is not null then raise exception 'FAIL: an unregistered shop''s order got a GSTIN';
    end if;
  end loop;
  -- Run again (as after the push): nothing more changes; order 3 is listed for a person.
  if (select lines_stamped + orders_gstin from app_backfill_0019()) <> 0 then raise exception 'FAIL: the backfill is not idempotent'; end if;
  if (select flagged_orders from app_backfill_0019()) <> array['00000000-0000-0000-0000-000000000003'::uuid] then raise exception 'FAIL: the sold-out order is not flagged'; end if;
end $$;
\echo 'backfill 0019 — all checks passed'
\endif
