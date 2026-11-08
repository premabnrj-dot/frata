-- 10× FESTIVE SEED (Analytics A·1 speed check; speed-reviewer, 2026-11-08): one shop with 150k orders packed into 180 days
-- (peak day ~7.5k), attribution of every kind, creator codes, shipments; a second small shop. Throwaway database only:
--   createdb frata_speed; ADMIN_URL=postgres://postgres@localhost:54330/frata_speed bash scripts/verify/apply-migrations.sh
--   psql .../frata_speed -f scripts/verify/seed-10x.sql; SPEED=1 INT_DB_HOST=localhost:54330 npx vitest run analytics-speed
\set ON_ERROR_STOP 1
select setseed(0.42);
insert into tenants (id, slug, name) values ('aaaaaaaa-0000-0000-0000-000000000001','big','Big festive shop'), ('bbbbbbbb-0000-0000-0000-000000000002','small','Small shop');
-- discounts: 3 offers on A, one with 40 creator codes
insert into discounts (id, tenant_id, title, style, percent_bps, starts_at, started_at, started_by, created_by)
select ('dddddddd-0000-0000-0000-00000000000'||g)::uuid, 'aaaaaaaa-0000-0000-0000-000000000001', 'Offer '||g, case when g=3 then 'pay_online' else 'order_off' end, 1000, now()-interval '200 days', now()-interval '200 days', gen_random_uuid(), gen_random_uuid()
from generate_series(1,3) g;
insert into discount_codes (id, tenant_id, discount_id, code, label)
select gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 'CREATOR'||g, 'Creator '||g from generate_series(1,40) g;
insert into discount_codes (id, tenant_id, discount_id, code, label)
values (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002', 'DIWALI10', null);

create temp table src as
select g n, r, random() s, random() p, random() q, random() a, power(random(),2) age from (select g, random() r from generate_series(1,150000) g) x;

insert into orders (tenant_id, number, payment_method, subtotal, discount, cod_charge, total, merchandise_net, cogs, forward_shipping, rto_shipping, courier_cod_fee, gateway_fee,
  customer_name, phone, address_line, pincode, city, state, checkout, pay_by, placed_at, confirmed_at, paid_at, packed_at, invoice_number, shipped_at, delivered_at, rto_initiated_at, rto_delivered_at, lost_at, cancelled_at, gst_total)
select 'aaaaaaaa-0000-0000-0000-000000000001', n, m, sub, 0, cc, sub + cc, sub*100/105, sub*40/100, case when s < .3 then 7000 end, case when s < .3 and st='rto' then 7000 end, case when s<.3 and m='cod' then 2500 end,
  case when m='prepaid' then sub*2/100 end,
  'Shopper '||n, (6000000000 + (n*7919 % 3999999999))::text, 'House '||n||', Some Street', (110001 + (floor(power(q,3)*3000))::int*7)::text, 'City', 'State',
  jsonb_build_object('shown', jsonb_build_object('prepaid', sub, 'cod', sub+cc, 'codCharge', 4900), 'firstMethod', m, 'onlineTotal', sub,
    'attribution', case
      when a < .30 then jsonb_build_object('utm_source','instagram','utm_medium', (array['bio','story','reel','dm'])[1+floor(a*13)::int % 4], 'utm_campaign', 'diwali-drop-'||(n%12), 'fbclid', md5(n::text)||md5((n+1)::text), 'ref_host','l.instagram.com', 'landing','/products/kurta-'||(n%600))
      when a < .45 then jsonb_build_object('utm_source','whatsapp','utm_medium','broadcast','utm_campaign','festive-'||(n%5), 'landing','/')
      when a < .55 then jsonb_build_object('gclid', md5(n::text), 'ref_host','www.google.com', 'landing','/collections/sarees')
      when a < .65 then jsonb_build_object('ref_host', (array['www.google.com','m.facebook.com','l.instagram.com','com.instagram.android','www.youtube.com'])[1+(n%5)], 'landing','/')
      when a < .70 then jsonb_build_object('utm_source','Insta gram '||(n%300),'utm_medium','typo','utm_campaign','x'||n)
      else '{}'::jsonb end),
  case when st='abandoned' then pl + interval '20 minutes' end, pl, case when st<>'abandoned' then pl + interval '1 hour' end,
  case when m='prepaid' and st <> 'abandoned' then pl + interval '2 minutes' end,
  case when st in ('packed','shipped','delivered','rto','lost') then pl + interval '1 day' end,
  case when st in ('packed','shipped','delivered','rto','lost') then 'INV'||n end,
  case when st in ('shipped','delivered','rto','lost') then pl + interval '2 days' end,
  case when st='delivered' then pl + interval '6 days' end,
  case when st='rto' then pl + interval '8 days' end,
  case when st='rto' and r > .5 then pl + interval '14 days' end,
  case when st='lost' then pl + interval '9 days' end,
  case when st='cancelled' then pl + interval '3 hours' end, 0
from (select *, now() - (age * interval '180 days') pl, case when p < .7 then 'cod' else 'prepaid' end m, case when p < .7 then 4900 else 0 end cc, (49900 + floor(s*400000))::bigint sub,
   case when m_abandoned then 'abandoned'
        when age*180 < 2 and r < .7 then 'confirmed'
        when age*180 < 4 and r < .6 then 'packed'
        when age*180 < 9 and r < .5 then 'shipped'
        when r < .55 then 'delivered' when r < .77 then 'rto' when r < .78 then 'lost' when r < .80 then 'cancelled' when r < .83 then 'shipped' else 'delivered' end st
   from (select *, (p >= .7 and n % 97 = 0) m_abandoned from src) y) z;

-- one line per order
insert into order_lines (tenant_id, order_id, title, qty, unit_price, taxable_value, unit_cost, stock_taken_at)
select tenant_id, id, 'Kurta', 1, subtotal, subtotal*100/105, subtotal*40/100, placed_at from orders where tenant_id='aaaaaaaa-0000-0000-0000-000000000001';
-- half a percent of paid lines never taken (refund_due path)
update order_lines set stock_taken_at = null where tenant_id='aaaaaaaa-0000-0000-0000-000000000001' and taxable_value % 200 = 0;

-- shipments: every shipped order, 30% shiprocket; 5% also have an ended earlier shipment
insert into shipments (tenant_id, order_id, provider, opened_at)
select tenant_id, id, case when number % 10 < 3 then 'shiprocket' else 'self' end, shipped_at from orders where tenant_id='aaaaaaaa-0000-0000-0000-000000000001' and shipped_at is not null;
insert into shipments (tenant_id, order_id, provider, opened_at, ended_at, ended_reason)
select tenant_id, id, 'self', shipped_at - interval '1 hour', shipped_at - interval '30 minutes', 'undone' from orders where tenant_id='aaaaaaaa-0000-0000-0000-000000000001' and shipped_at is not null and number % 20 = 0;

-- order_discounts: 25% of orders use offer 2 (public code / auto), 8% use a creator code on offer 1, 10% the pay-online offer
insert into order_discounts (tenant_id, order_id, discount_id, code_id, class, amount, title, style, percent_bps, min_subtotal, via)
select o.tenant_id, o.id, 'dddddddd-0000-0000-0000-000000000002', null, 'order', 5000, 'Offer 2', 'order_off', 1000, 0, 'auto' from orders o where o.tenant_id='aaaaaaaa-0000-0000-0000-000000000001' and o.number % 4 = 0;
insert into order_discounts (tenant_id, order_id, discount_id, code_id, class, amount, title, style, percent_bps, min_subtotal, via)
select o.tenant_id, o.id, 'dddddddd-0000-0000-0000-000000000001', (select id from discount_codes c where c.tenant_id=o.tenant_id and c.code = 'CREATOR'||(1 + o.number % 40)), 'order', 5000, 'Offer 1', 'order_off', 1000, 0, case when o.number % 3 = 0 then 'typed' else 'link' end
  from orders o where o.tenant_id='aaaaaaaa-0000-0000-0000-000000000001' and o.number % 25 in (1,2) and o.number % 4 <> 0;
insert into order_discounts (tenant_id, order_id, discount_id, class, amount, title, style, percent_bps, min_subtotal)
select o.tenant_id, o.id, 'dddddddd-0000-0000-0000-000000000003', 'payment', 3000, 'Pay online', 'pay_online', 500, 0 from orders o where o.tenant_id='aaaaaaaa-0000-0000-0000-000000000001' and o.payment_method='prepaid' and o.number % 3 = 0;

-- tenant B: 5k orders
insert into orders (tenant_id, number, payment_method, subtotal, total, pincode, phone, checkout, placed_at, gst_total)
select 'bbbbbbbb-0000-0000-0000-000000000002', g, 'cod', 100000, 100000, '560001', '9876543210', '{"attribution":{"utm_source":"x"}}', now() - (random()*interval '180 days'), 0 from generate_series(1,5000) g;

vacuum analyze orders; vacuum analyze order_lines; vacuum analyze shipments; vacuum analyze order_discounts; vacuum analyze discount_codes;
