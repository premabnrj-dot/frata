-- =============================================================================
-- FIXTURE: ux-stress — the data the UX net (e2e/flows/90-ux.mjs) runs on.
-- From the stress test of 2026-11-07 (spec U § Stress test). Applied by the
-- flow as superuser to the THROWAWAY database only, removed by the flow after.
-- Kesar Studio (the seed shop) gets a 46-character name, 300 orders across every
-- state with long and Indic names and crore totals, 60 products with long and
-- Hindi titles and no photos. 60 more merchants; two of them have orders waiting
-- to be confirmed, each a different number, so a count that leaks across shops
-- shows. Meera is Frata staff (Admin) and a member of Kesar.
-- =============================================================================
do $$ begin
  if current_database() <> 'frata_e2e' then raise exception 'ux-stress.sql runs only on the throwaway e2e database, not %', current_database(); end if;
end $$;

update tenants set name = 'Kesar Studio Handwoven Heritage Couture Jaipur' where id = 'd7342b03-4f9e-45db-b5e0-3760967cb3c7';

insert into orders (tenant_id, number, payment_method, placed_at, confirmed_at, cancelled_at, cancel_reason, shipped_at, ndr_at, delivered_at, rto_initiated_at,
  paid_at, subtotal, shipping, cod_charge, gst_total, total, cogs, forward_shipping, customer_name, phone, city, pincode, state, address_line, area)
select 'd7342b03-4f9e-45db-b5e0-3760967cb3c7'::uuid, 5000 + i,
  case when i % 6 = 1 or i % 11 = 0 then 'prepaid' else 'cod' end,
  now() - (i * interval '41 minutes'),
  case when i % 6 in (3,4,5) or i % 13 = 0 then now() - (i * interval '41 minutes') + interval '20 minutes' end,
  case when i % 6 = 2 then now() - (i * interval '41 minutes') + interval '30 minutes' end,
  case when i % 6 = 2 then (array['fake','customer_cancelled','unreachable','out_of_stock'])[1 + (i % 4)] end,
  case when i % 6 in (3,4) or i % 13 = 0 then now() - (i * interval '41 minutes') + interval '3 hours' end,
  case when i % 13 = 0 then now() - (i * interval '41 minutes') + interval '1 day' end,
  case when i % 6 = 4 then now() - (i * interval '41 minutes') + interval '2 days' end,
  case when i % 17 = 0 and i % 6 = 3 then now() end,
  case when i % 6 = 1 or i % 11 = 0 then now() - (i * interval '41 minutes') + interval '1 minute' end,
  s.sub, s.ship, s.codc, 0, s.sub + s.ship + s.codc,
  (s.sub * 0.42)::bigint, case when i % 6 in (3,4) then 7900 else 0 end,
  (array['Venkatanarasimharajuvaripeta Subrahmanyam Lakshminarayana', 'प्रियंका शर्मा', 'முத்துலட்சுமி', 'Ananya Sharma', 'Mohammed Irfan Qureshi', 'ਹਰਪ੍ਰੀਤ ਕੌਰ', 'Sneha', 'Rajalakshmi Venkataraman Iyer', 'অনন্যা বন্দ্যোপাধ্যায়', 'Kavya R'])[1 + (i % 10)],
  '98290' || lpad((43210 + i)::text, 5, '0'),
  (array['Thiruvananthapuram', 'Jaipur', 'Chennai', 'Visakhapatnam', 'Mumbai', 'Bhubaneswar'])[1 + (i % 6)],
  '302001', 'Rajasthan', 'B-14 Tilak Marg', 'C-Scheme'
from generate_series(1, 300) i
cross join lateral (select
  case when i = 1 then 1234567800 when i = 2 then 0 when i = 3 then 999999900 else 89900 + (i * 7919 % 600000) end as sub,
  case when i in (1, 2, 3) then 0 else 8500 end as ship,
  case when i in (1, 2, 3) then 0 when i % 6 in (0, 3, 4, 5) then 4900 else 0 end as codc) s;

insert into order_lines (tenant_id, order_id, variant_id, product_id, title, option_values, sku, qty, unit_price, taxable_value, gst_bps, gst, unit_cost, position, stock_taken_at)
select o.tenant_id, o.id, 'd1c24d3d-d66f-48f2-acae-40c8220ddd43', '5ef1e555-0ebc-4eda-bfe8-9f22ce6e6738', 'Chanderi kurta set', '{S,Indigo}', 'KS-LINKUR-S-IND',
  1 + (o.number % 3), o.subtotal / (1 + (o.number % 3)), o.subtotal, 500, 0, 4242421, 0, o.placed_at
from orders o where o.tenant_id = 'd7342b03-4f9e-45db-b5e0-3760967cb3c7' and o.number between 5001 and 5300;

insert into products (tenant_id, handle, title, description, options, option_values, status, published_at, created_at, updated_at, seo_title, seo_description, tags)
select 'd7342b03-4f9e-45db-b5e0-3760967cb3c7'::uuid, 'stress-product-' || i,
  case when i % 3 = 0 then left('Hand-block-printed Bagru indigo mulmul cotton anarkali kurta with gota-patti border, palazzo and chiffon dupatta set ' || i || ' — limited festive edition', 140)
       when i % 3 = 1 then 'साड़ी बनारसी रेशम ' || i
       else 'Kurta ' || i end,
  '', '{Size}', '[["S","M","L"]]',
  (array['active','draft','unlisted','archived'])[1 + (i % 4)],
  case when i % 4 = 0 then now() end, now() - (i * interval '3 hours'), now() - (i * interval '3 hours'), '', '', '{}'
from generate_series(1, 60) i;

insert into variants (tenant_id, product_id, option_values, sku, price, compare_at, unit_cost, stock, position, when_out)
select p.tenant_id, p.id, array[sz], 'SKU-' || p.handle || '-' || sz, 129900 + (length(p.title) * 1000), null, 52000, (length(p.handle) * 7) % 40, ord - 1, 'stop'
from products p cross join unnest(array['S','M','L']) with ordinality as u(sz, ord)
where p.handle like 'stress-product-%';

-- Meera: Frata staff (admin) and a member of Kesar.
insert into auth.users (id, email, email_confirmed_at, last_sign_in_at) values ('cccccccc-0000-0000-0000-000000000009', 'meera@frata.test', now(), now());
insert into platform_staff (user_id, email, role) values ('cccccccc-0000-0000-0000-000000000009', 'meera@frata.test', 'admin');
insert into members (tenant_id, user_id, role) values ('d7342b03-4f9e-45db-b5e0-3760967cb3c7', 'cccccccc-0000-0000-0000-000000000009', 'admin');

-- 60 more merchants (ids eeeeeeee-0000-4000-8000-0000000000NN, owners dddddddd-…-0000000000NN).
insert into tenants (id, slug, name, created_at, is_internal)
select ('eeeeeeee-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'merchant-' || i,
  case when i % 5 = 0 then 'Shree Lakshmi Venkateswara Handloom Silk Sarees & Fabrics Private Limited ' || i
       when i % 5 = 1 then 'कला वस्त्र ' || i
       when i % 7 = 0 then 'Zz'
       else 'Brand ' || i end,
  now() - (i * interval '2 days'), i % 19 = 0
from generate_series(1, 60) i;
insert into auth.users (id, email, email_confirmed_at, last_sign_in_at)
select ('dddddddd-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
  case when i % 4 = 0 then 'founder.and.creative.director.' || i || '@verylongbrandnamehandloomsandsarees.co.in' else 'owner' || i || '@brand.in' end,
  now(), case when i % 3 = 0 then null else now() - (i * interval '5 hours') end
from generate_series(1, 60) i;
insert into members (tenant_id, user_id, role)
select ('eeeeeeee-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, ('dddddddd-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'owner'
from generate_series(1, 60) i;
insert into tenant_plans (tenant_id, plan_version_id, starts_at, trial_ends_at, created_by)
select ('eeeeeeee-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  (select v.id from plan_versions v join plans p on p.id = v.plan_id where p.code = (array['launch','growth','scale'])[1 + (i % 3)] order by v.version desc limit 1),
  now() - (i * interval '2 days'), case when i % 2 = 0 then now() + interval '10 days' end, 'cccccccc-0000-0000-0000-000000000009'
from generate_series(1, 60) i;

-- Two other shops with COD orders waiting to be confirmed: merchant-1 has 7, merchant-2 has 3 (Kesar has its own).
insert into orders (tenant_id, number, payment_method, placed_at, subtotal, total, customer_name, city)
select ('eeeeeeee-0000-4000-8000-' || lpad(m::text, 12, '0'))::uuid, 1000 + i, 'cod', now() - i * interval '1 hour', 149900, 149900, 'Other shop ' || m || '·' || i, 'Pune'
from (values (1, 7), (2, 3)) as t(m, n) cross join lateral generate_series(1, t.n) i;
