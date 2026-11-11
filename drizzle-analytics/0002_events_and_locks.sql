-- =============================================================================
-- RAW EVENTS, THE FOLD, THE ROLLUPS AND THEIR LOCKS (A·2; plan docs/plans/2026-11-11-guardrails-infra-a2.md A2·1, with
-- the tenancy, security and speed reviews of 2026-11-11 folded in). Proved by scripts/verify/analytics-tenancy.sql.
--
--   ingest_events()      frata_app, invoker: sets the shop for its own statement and inserts one beacon's batch, so the
--                        events policy still applies (one round trip; speed review MED 7).
--   analytics_visitor()  frata_app, definer: the visitor is an HMAC of today's salt with the shop and the visitor's
--                        input (a /24 or /48 network and the user agent, built by the app). The salt never leaves here.
--   analytics_fold()     pg_cron every 15 minutes, definer: folds the events since the last fold into visitor_days
--                        (one row per visitor-day, a bitmask of funnel steps), adds product and Web Vitals counts, then
--                        rebuilds the touched days' rollups (speed review HIGH 2: never a full recompute).
--   analytics_maintain() pg_cron hourly, definer: partitions 7 days ahead, raw events and visitor-days dropped after 90
--                        days, rollups after 2 years (owner call 4), yesterday's salt deleted.
-- Nobody but the owner reads events, visitor_days, the salts or a partition. No app role calls the fold or maintenance.
-- =============================================================================
create table events (
  tenant_id uuid not null,
  day date not null,
  at timestamptz not null default now(),
  visitor bytea not null,
  kind text not null check (kind in ('page_view', 'view_item', 'add_to_cart', 'begin_checkout', 'purchase', 'web_vital')),
  landing boolean not null default false,
  path text check (length(path) <= 200),
  product_id uuid,
  us text check (length(us) <= 100), um text check (length(um) <= 100), uc text check (length(uc) <= 100),
  rh text check (length(rh) <= 100), cc text check (length(cc) <= 40),
  gads boolean not null default false, srs boolean not null default false, fb boolean not null default false,
  device text not null default '' check (length(device) <= 10),
  browser text not null default '' check (length(browser) <= 20),
  in_app text not null default '' check (length(in_app) <= 20),
  city text not null default '' check (length(city) <= 60),
  metric text check (metric in ('lcp', 'inp', 'cls')),
  value integer check (value between 0 and 600000),
  check ((kind = 'web_vital') = (metric is not null and value is not null))
) partition by range (day);
--> statement-breakpoint
create index events_at on events using brin (at);
--> statement-breakpoint
create table visitor_days (
  tenant_id uuid not null,
  day date not null,
  visitor bytea not null,
  first_at timestamptz not null,
  last_at timestamptz not null,
  steps integer not null default 0,
  views integer not null default 0,
  device text not null default '', browser text not null default '', in_app text not null default '', city text not null default '',
  landed boolean not null default false,
  us text, um text, uc text, rh text, cc text,
  gads boolean not null default false, srs boolean not null default false, fb boolean not null default false,
  primary key (tenant_id, day, visitor)
);
--> statement-breakpoint
create index visitor_days_day on visitor_days (day);
--> statement-breakpoint
create table visitor_salts (day date primary key, salt bytea not null);
--> statement-breakpoint
create table fold_state (id integer primary key check (id = 1), through timestamptz not null);
--> statement-breakpoint
insert into fold_state (id, through) values (1, now());
--> statement-breakpoint

-- ── Locks ──────────────────────────────────────────────────────────────────────────────────────────────────────────
revoke all on events, visitor_days, visitor_salts, fold_state, traffic_daily, source_daily, browser_daily, city_daily, product_daily, vitals_daily
  from public, anon, authenticated, service_role;
--> statement-breakpoint
alter table events enable row level security;
--> statement-breakpoint
alter table visitor_days enable row level security;
--> statement-breakpoint
alter table visitor_salts enable row level security;
--> statement-breakpoint
alter table fold_state enable row level security;
--> statement-breakpoint
alter table traffic_daily enable row level security;
--> statement-breakpoint
alter table source_daily enable row level security;
--> statement-breakpoint
alter table browser_daily enable row level security;
--> statement-breakpoint
alter table city_daily enable row level security;
--> statement-breakpoint
alter table product_daily enable row level security;
--> statement-breakpoint
alter table vitals_daily enable row level security;
--> statement-breakpoint
-- events: the app may only add its own shop's rows; it can't read any (no SELECT grant).
grant insert on events to frata_app;
--> statement-breakpoint
create policy tenant_insert on events for insert to frata_app with check (tenant_id = app_current_tenant());
--> statement-breakpoint
-- The definers' own tables: no grant to any role, and a restrictive false policy (the 0065 pattern of the main database).
create policy definer_only on visitor_days as restrictive for all to public using (false) with check (false);
--> statement-breakpoint
create policy definer_only on visitor_salts as restrictive for all to public using (false) with check (false);
--> statement-breakpoint
create policy definer_only on fold_state as restrictive for all to public using (false) with check (false);
--> statement-breakpoint
-- Rollups: the console reads its own shop's rows; the fold (the owner) writes them.
grant select on traffic_daily, source_daily, browser_daily, city_daily, product_daily, vitals_daily to frata_app;
--> statement-breakpoint
create policy tenant_rows on traffic_daily for select to frata_app using (tenant_id = app_current_tenant());
--> statement-breakpoint
create policy tenant_rows on source_daily for select to frata_app using (tenant_id = app_current_tenant());
--> statement-breakpoint
create policy tenant_rows on browser_daily for select to frata_app using (tenant_id = app_current_tenant());
--> statement-breakpoint
create policy tenant_rows on city_daily for select to frata_app using (tenant_id = app_current_tenant());
--> statement-breakpoint
create policy tenant_rows on product_daily for select to frata_app using (tenant_id = app_current_tenant());
--> statement-breakpoint
create policy tenant_rows on vitals_daily for select to frata_app using (tenant_id = app_current_tenant());
--> statement-breakpoint

-- ── The visitor ────────────────────────────────────────────────────────────────────────────────────────────────────
-- 16 bytes of HMAC-SHA256(today's salt, shop id ‖ input). The shop id is fixed-length, so the concatenation is
-- unambiguous; the app length-prefixes the rest (src/domains/analytics/visitor.ts). A new salt each IST day: a visitor
-- can't be followed from one day to the next, and nothing stored is linkable to a person once it is deleted.
create function analytics_visitor(p_tenant uuid, p_input text) returns table (salt_day date, visitor bytea)
  language plpgsql security definer set search_path = '' as $$
declare
  d date := (now() at time zone 'Asia/Kolkata')::date;
  s bytea;
begin
  if p_tenant is null or p_input is null or length(p_input) > 600 then raise exception 'analytics_visitor: bad input'; end if;
  select x.salt into s from public.visitor_salts x where x.day = d;
  if s is null then
    insert into public.visitor_salts (day, salt) values (d, extensions.gen_random_bytes(32)) on conflict (day) do nothing;
    select x.salt into s from public.visitor_salts x where x.day = d;
  end if;
  return query select d, substring(extensions.hmac(convert_to(p_tenant::text || p_input, 'UTF8'), s, 'sha256') from 1 for 16);
end $$;
--> statement-breakpoint

-- ── The ingest ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- One beacon: {d: device, b: browser, a: in-app, c: city, e: [{k, l, p, pid, us, um, uc, rh, cc, gads, srs, fb, m, v}]}.
-- The route has checked it already (Zod, src/domains/analytics/event.ts); the table's checks and the caps here are the
-- backstop. Invoker, so the events policy holds: the shop is set for this transaction only, from the host the route
-- resolved (never the body), exactly as withTenant does.
create function ingest_events(p_tenant uuid, p_input text, p_batch jsonb) returns integer
  language plpgsql set search_path = '' as $$
declare
  v record;
  n integer;
begin
  if p_tenant is null or p_batch is null or jsonb_typeof(p_batch -> 'e') is distinct from 'array' then raise exception 'ingest_events: bad batch'; end if;
  if jsonb_array_length(p_batch -> 'e') > 50 then raise exception 'ingest_events: more than 50 events'; end if;
  perform set_config('app.tenant_id', p_tenant::text, true);
  select * into v from public.analytics_visitor(p_tenant, p_input);
  insert into public.events (tenant_id, day, visitor, kind, landing, path, product_id, us, um, uc, rh, cc, gads, srs, fb, device, browser, in_app, city, metric, value)
  select p_tenant, v.salt_day, v.visitor, e.k, coalesce(e.l, false), e.p, e.pid, e.us, e.um, e.uc, e.rh, e.cc,
         coalesce(e.gads, false), coalesce(e.srs, false), coalesce(e.fb, false),
         coalesce(p_batch ->> 'd', ''), coalesce(p_batch ->> 'b', ''), coalesce(p_batch ->> 'a', ''), coalesce(p_batch ->> 'c', ''), e.m, e.v
  from jsonb_to_recordset(p_batch -> 'e') as e(k text, l boolean, p text, pid uuid, us text, um text, uc text, rh text, cc text, gads boolean, srs boolean, fb boolean, m text, v integer);
  get diagnostics n = row_count;
  return n;
end $$;
--> statement-breakpoint

-- ── Rollups: one day, every shop, rebuilt from visitor_days (idempotent) ───────────────────────────────────────────
-- Every grouping starts with tenant_id, and every top-N is ranked within a shop: one shop's rows never merge with,
-- or push out, another's (proved). Sources keep the top 200 input sets a shop-day (the rest: rh = '*'), cities the
-- top 50 (the rest: city ''). Fewer than 5 visitors fold into Other on read, over the window shown (security MED-5).
create function analytics_rollup(p_day date) returns void
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
end $$;
--> statement-breakpoint

-- Two bucket arrays added element by element (Web Vitals histograms from two slices of a day).
create function analytics_add_buckets(a integer[], b integer[]) returns integer[]
  language sql immutable set search_path = '' as $$
  select array_agg(coalesce(x, 0) + coalesce(y, 0) order by i) from unnest(a, b) with ordinality as u(x, y, i)
$$;
--> statement-breakpoint

-- ── The fold: events since the last fold → visitor_days, product_daily, vitals_daily; then the touched days' rollups.
-- Events are stamped by the server (`at` = the ingest transaction's start, which lasts 2 s at most), so a 1-minute lag
-- means no event at or before the watermark can still commit: each event is folded exactly once.
create function analytics_fold() returns integer
  language plpgsql security definer set search_path = '' as $$
declare
  t timestamptz;
  upto timestamptz := now() - interval '1 minute';
  d0 date;
  d1 date;
  days date[];
  d date;
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

  insert into public.product_daily as x (tenant_id, day, product_id, views, adds)
  select e.tenant_id, e.day, e.product_id, count(*) filter (where e.kind = 'view_item'), count(*) filter (where e.kind = 'add_to_cart')
  from public.events e
  where e.day between d0 and d1 and e.at > t and e.at <= upto and e.product_id is not null and e.kind in ('view_item', 'add_to_cart')
  group by e.tenant_id, e.day, e.product_id
  on conflict (tenant_id, day, product_id) do update set views = x.views + excluded.views, adds = x.adds + excluded.adds;

  insert into public.vitals_daily as x (tenant_id, day, metric, product_id, n, buckets)
  with v as (
    select e.tenant_id, e.day, e.metric, coalesce(e.product_id, '00000000-0000-0000-0000-000000000000'::uuid) pid,
           least(63, floor(ln(e.value + 1) / ln(1.2)))::integer b
    from public.events e where e.day between d0 and d1 and e.at > t and e.at <= upto and e.kind = 'web_vital'
  ), all_pages as (
    select v.tenant_id, v.day, v.metric, v.pid, v.b from v where v.pid <> '00000000-0000-0000-0000-000000000000'::uuid
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

-- ── Maintenance (hourly; idempotent) ───────────────────────────────────────────────────────────────────────────────
create function analytics_maintain() returns integer
  language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
  d date;
  r record;
  dropped integer := 0;
begin
  for d in select g::date from generate_series(today - 1, today + 7, interval '1 day') g loop
    continue when to_regclass('ev.events_' || to_char(d, 'YYYYMMDD')) is not null;
    execute format('create table ev.%I partition of public.events for values from (%L) to (%L)', 'events_' || to_char(d, 'YYYYMMDD'), d, d + 1);
    execute format('alter table ev.%I enable row level security', 'events_' || to_char(d, 'YYYYMMDD'));
  end loop;
  for r in
    select c.relname from pg_catalog.pg_inherits i
    join pg_catalog.pg_class c on c.oid = i.inhrelid join pg_catalog.pg_namespace s on s.oid = c.relnamespace
    where i.inhparent = 'public.events'::regclass and s.nspname = 'ev' and c.relname ~ '^events_[0-9]{8}$'
      and to_date(substr(c.relname, 8), 'YYYYMMDD') < today - 90
  loop
    execute format('drop table ev.%I', r.relname);
    dropped := dropped + 1;
  end loop;
  delete from public.visitor_days where day < today - 90;
  delete from public.visitor_salts where day < today;
  delete from public.traffic_daily where day < today - 730;
  delete from public.source_daily where day < today - 730;
  delete from public.browser_daily where day < today - 730;
  delete from public.city_daily where day < today - 730;
  delete from public.product_daily where day < today - 730;
  delete from public.vitals_daily where day < today - 730;
  return dropped;
end $$;
--> statement-breakpoint
revoke all on function analytics_visitor(uuid, text), ingest_events(uuid, text, jsonb), analytics_rollup(date), analytics_add_buckets(integer[], integer[]), analytics_fold(), analytics_maintain()
  from public, anon, authenticated, service_role;
--> statement-breakpoint
grant execute on function analytics_visitor(uuid, text), ingest_events(uuid, text, jsonb) to frata_app;
--> statement-breakpoint
do $$ begin perform analytics_maintain(); end $$;
--> statement-breakpoint
-- pg_cron, where the server has it (Supabase does; a throwaway Postgres doesn't, and the proof calls the functions).
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('analytics-fold', '*/15 * * * *', 'select public.analytics_fold()');
    perform cron.schedule('analytics-maintain', '7 * * * *', 'select public.analytics_maintain()');
  end if;
end $$;
