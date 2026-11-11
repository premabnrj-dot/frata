-- =============================================================================
-- A·2 security review (2026-11-11) MED-7: forged product ids can't grow product_daily or vitals_daily without bound.
-- analytics_fold() (0002's body, but for its product and Web Vitals inserts) names at most 1,000 products a shop-day;
-- views of products past that add to one row under the product id ffffffff-ffff-ffff-ffff-ffffffffffff ("other
-- products"), and per-product vitals are kept only for named products. Nothing counted is ever deleted (impact review
-- 2026-11-11 HIGH: a cap that deleted rows lost a re-added product's earlier views). Proved in analytics-tenancy.sql.
-- =============================================================================
create or replace function analytics_fold() returns integer
  language plpgsql security definer set search_path = '' as $$
declare
  t timestamptz;
  upto timestamptz := now() - interval '1 minute';
  d0 date;
  d1 date;
  days date[];
  d date;
  others constant uuid := 'ffffffff-ffff-ffff-ffff-ffffffffffff';
begin
  if not pg_try_advisory_xact_lock(hashtext('frata.analytics_fold')) then return 0; end if;
  select f.through into t from public.fold_state f where f.id = 1 for update;
  if upto <= t then return 0; end if;
  d0 := (t at time zone 'Asia/Kolkata')::date;
  d1 := (upto at time zone 'Asia/Kolkata')::date;

  with s as (
    select e.tenant_id, e.day, e.visitor, min(e.at) first_at, max(e.at) last_at,
           bit_or(case e.kind when 'page_view' then 1 when 'view_item' then 2 when 'add_to_cart' then 4 when 'begin_checkout' then 8 when 'purchase' then 16 else 0 end) steps,
           count(*) filter (where e.kind = 'page_view') views,
           (array_agg(e.device order by e.at))[1] device, (array_agg(e.browser order by e.at))[1] browser,
           (array_agg(e.in_app order by e.at))[1] in_app, (array_agg(e.city order by e.at))[1] city,
           bool_or(e.landing) landed,
           (array_agg(e.us order by e.at) filter (where e.landing))[1] us, (array_agg(e.um order by e.at) filter (where e.landing))[1] um,
           (array_agg(e.uc order by e.at) filter (where e.landing))[1] uc, (array_agg(e.rh order by e.at) filter (where e.landing))[1] rh,
           (array_agg(e.cc order by e.at) filter (where e.landing))[1] cc,
           coalesce((array_agg(e.gads order by e.at) filter (where e.landing))[1], false) gads,
           coalesce((array_agg(e.srs order by e.at) filter (where e.landing))[1], false) srs,
           coalesce((array_agg(e.fb order by e.at) filter (where e.landing))[1], false) fb
    from public.events e
    where e.day between d0 and d1 and e.at > t and e.at <= upto
    group by e.tenant_id, e.day, e.visitor
  ), ins as (
    insert into public.visitor_days as x (tenant_id, day, visitor, first_at, last_at, steps, views, device, browser, in_app, city, landed, us, um, uc, rh, cc, gads, srs, fb)
    select * from s
    on conflict (tenant_id, day, visitor) do update set
      first_at = least(x.first_at, excluded.first_at), last_at = greatest(x.last_at, excluded.last_at),
      steps = x.steps | excluded.steps, views = x.views + excluded.views,
      -- The day's first landing decides the source; a later one never replaces it.
      landed = x.landed or excluded.landed,
      us = case when x.landed then x.us else excluded.us end, um = case when x.landed then x.um else excluded.um end,
      uc = case when x.landed then x.uc else excluded.uc end, rh = case when x.landed then x.rh else excluded.rh end,
      cc = case when x.landed then x.cc else excluded.cc end, gads = case when x.landed then x.gads else excluded.gads end,
      srs = case when x.landed then x.srs else excluded.srs end, fb = case when x.landed then x.fb else excluded.fb end
    returning x.day
  )
  select array_agg(distinct ins.day) into days from ins;

  -- A shop-day holds at most 1,000 products by name (security review MED-7: a beacon may carry any uuid). A product
  -- already there always adds; a new one gets a name only while there is room, ranked by this slice's views, and the
  -- rest add to one row under OTHERS. A counted view is never deleted (impact review 2026-11-11 HIGH).
  insert into public.product_daily as x (tenant_id, day, product_id, views, adds)
  with s as (
    select e.tenant_id, e.day, e.product_id, count(*) filter (where e.kind = 'view_item') views, count(*) filter (where e.kind = 'add_to_cart') adds
    from public.events e
    where e.day between d0 and d1 and e.at > t and e.at <= upto and e.product_id is not null and e.kind in ('view_item', 'add_to_cart')
    group by e.tenant_id, e.day, e.product_id
  ), held as (
    select p.tenant_id, p.day, count(*) filter (where p.product_id <> others) n from public.product_daily p
    where (p.tenant_id, p.day) in (select distinct s.tenant_id, s.day from s) group by p.tenant_id, p.day
  ), r as (
    select s.*, exists (select 1 from public.product_daily p where p.tenant_id = s.tenant_id and p.day = s.day and p.product_id = s.product_id) known,
           row_number() over (partition by s.tenant_id, s.day, (exists (select 1 from public.product_daily p where p.tenant_id = s.tenant_id and p.day = s.day and p.product_id = s.product_id))
                              order by s.views desc, s.adds desc, s.product_id) rn
    from s
  )
  select r.tenant_id, r.day,
         case when r.known or r.rn + coalesce(h.n, 0) <= 1000 then r.product_id else others end,
         sum(r.views), sum(r.adds)
  from r left join held h on h.tenant_id = r.tenant_id and h.day = r.day
  group by 1, 2, 3
  on conflict (tenant_id, day, product_id) do update set views = x.views + excluded.views, adds = x.adds + excluded.adds;

  insert into public.vitals_daily as x (tenant_id, day, metric, product_id, n, buckets)
  with v as (
    select e.tenant_id, e.day, e.metric, coalesce(e.product_id, '00000000-0000-0000-0000-000000000000'::uuid) pid,
           least(63, floor(ln(e.value + 1) / ln(1.2)))::integer b
    from public.events e where e.day between d0 and d1 and e.at > t and e.at <= upto and e.kind = 'web_vital'
  ), all_pages as (
    -- Per product page only for a product the shop-day names in product_daily (so bounded the same way); every vital
    -- counts in the all-pages row.
    select v.tenant_id, v.day, v.metric, v.pid, v.b from v
    where v.pid <> '00000000-0000-0000-0000-000000000000'::uuid
      and exists (select 1 from public.product_daily p where p.tenant_id = v.tenant_id and p.day = v.day and p.product_id = v.pid)
    union all
    select v.tenant_id, v.day, v.metric, '00000000-0000-0000-0000-000000000000'::uuid, v.b from v
  ), c as (
    select a.tenant_id, a.day, a.metric, a.pid, a.b, count(*)::integer k from all_pages a group by 1, 2, 3, 4, 5
  ), h as (
    select c.tenant_id, c.day, c.metric, c.pid, sum(c.k)::integer n, jsonb_object_agg(c.b::text, c.k) m from c group by 1, 2, 3, 4
  )
  select h.tenant_id, h.day, h.metric, h.pid, h.n, array(select coalesce((h.m ->> g::text)::integer, 0) from generate_series(0, 63) g order by g)
  from h
  on conflict (tenant_id, day, metric, product_id) do update set n = x.n + excluded.n, buckets = public.analytics_add_buckets(x.buckets, excluded.buckets);

  update public.fold_state set through = upto where id = 1;
  if days is not null then
    foreach d in array days loop perform public.analytics_rollup(d); end loop;
  end if;
  return coalesce(array_length(days, 1), 0);
end $$;
--> statement-breakpoint
revoke all on function analytics_fold() from public, anon, authenticated, service_role;
