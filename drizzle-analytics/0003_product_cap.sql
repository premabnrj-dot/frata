-- =============================================================================
-- A·2 security review (2026-11-11) MED-7: forged product ids can't grow product_daily or vitals_daily without bound.
-- analytics_rollup(day), which the fold runs for each day it touches, now also keeps each shop-day's top 1,000 products
-- (and product pages per Web Vital). The rest of its body is 0002's, unchanged. Proved in analytics-tenancy.sql.
-- =============================================================================
create or replace function analytics_rollup(p_day date) returns void
  language plpgsql security definer set search_path = '' as $$
begin
  delete from public.traffic_daily where day = p_day;
  insert into public.traffic_daily (tenant_id, day, visitors, views, product_visitors, bag_visitors, checkout_visitors, ordered_visitors, phone, computer, tablet)
  select v.tenant_id, p_day, count(*), sum(v.views),
         count(*) filter (where v.steps & 2 > 0), count(*) filter (where v.steps & 4 > 0),
         count(*) filter (where v.steps & 8 > 0), count(*) filter (where v.steps & 16 > 0),
         count(*) filter (where v.device = 'phone'), count(*) filter (where v.device = 'computer'), count(*) filter (where v.device = 'tablet')
  from public.visitor_days v where v.day = p_day group by v.tenant_id;

  delete from public.source_daily where day = p_day;
  insert into public.source_daily (tenant_id, day, us, um, uc, rh, cc, gads, srs, fb, visitors, ordered_visitors)
  with g as (
    select v.tenant_id, coalesce(v.us, '') us, coalesce(v.um, '') um, coalesce(v.uc, '') uc, coalesce(v.rh, '') rh, coalesce(v.cc, '') cc,
           v.gads, v.srs, v.fb, count(*) n, count(*) filter (where v.steps & 16 > 0) o
    from public.visitor_days v where v.day = p_day
    group by v.tenant_id, 2, 3, 4, 5, 6, v.gads, v.srs, v.fb
  ), r as (
    select g.*, row_number() over (partition by g.tenant_id order by g.n desc, g.us, g.um, g.uc, g.rh, g.cc, g.gads, g.srs, g.fb) <= 200 keep from g
  )
  select r.tenant_id, p_day,
         case when r.keep then r.us else '' end, case when r.keep then r.um else '' end, case when r.keep then r.uc else '' end,
         case when r.keep then r.rh else '*' end, case when r.keep then r.cc else '' end,
         r.keep and r.gads, r.keep and r.srs, r.keep and r.fb, sum(r.n), sum(r.o)
  from r group by 1, 3, 4, 5, 6, 7, 8, 9, 10;

  delete from public.browser_daily where day = p_day;
  insert into public.browser_daily (tenant_id, day, device, browser, in_app, visitors, ordered_visitors)
  select v.tenant_id, p_day, v.device, v.browser, v.in_app, count(*), count(*) filter (where v.steps & 16 > 0)
  from public.visitor_days v where v.day = p_day group by v.tenant_id, v.device, v.browser, v.in_app;

  delete from public.city_daily where day = p_day;
  insert into public.city_daily (tenant_id, day, city, visitors, ordered_visitors)
  with g as (
    select v.tenant_id, v.city, count(*) n, count(*) filter (where v.steps & 16 > 0) o
    from public.visitor_days v where v.day = p_day group by v.tenant_id, v.city
  ), r as (
    select g.*, g.city <> '' and row_number() over (partition by g.tenant_id order by (g.city = ''), g.n desc, g.city) <= 50 keep from g
  )
  select r.tenant_id, p_day, case when r.keep then r.city else '' end, sum(r.n), sum(r.o) from r group by 1, 3;

  -- Forged product ids (security review 2026-11-11 MED-7): a beacon may carry any uuid, so a shop-day keeps its 1,000
  -- most viewed products and its 1,000 most measured product pages per metric. Real ids are joined on read.
  delete from public.product_daily x
  using (select p.tenant_id, p.product_id, row_number() over (partition by p.tenant_id order by p.views desc, p.adds desc, p.product_id) rn
         from public.product_daily p where p.day = p_day) r
  where x.day = p_day and x.tenant_id = r.tenant_id and x.product_id = r.product_id and r.rn > 1000;
  delete from public.vitals_daily x
  using (select v.tenant_id, v.metric, v.product_id, row_number() over (partition by v.tenant_id, v.metric order by v.n desc, v.product_id) rn
         from public.vitals_daily v where v.day = p_day and v.product_id <> '00000000-0000-0000-0000-000000000000'::uuid) r
  where x.day = p_day and x.tenant_id = r.tenant_id and x.metric = r.metric and x.product_id = r.product_id and r.rn > 1000;
end $$;
--> statement-breakpoint
revoke all on function analytics_rollup(date) from public, anon, authenticated, service_role;
