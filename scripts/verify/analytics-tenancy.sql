-- =============================================================================
-- THE ANALYTICS DATABASE'S ISOLATION PROOF (ADR-0002; A·2, plan docs/plans/2026-11-11-guardrails-infra-a2.md A2·1 and the
-- tenancy review of 2026-11-11). Run by scripts/verify/tenancy.sh on a second throwaway database after
-- drizzle-analytics/*.sql. Every block raises if isolation is broken. Runs as a superuser and becomes frata_app.
-- =============================================================================
\set ON_ERROR_STOP on

-- 1. The app's roles: no superuser, no BYPASSRLS; their limits are set in THIS database (alter role … in database).
do $$
declare r text;
begin
  foreach r in array array['frata_app', 'frata_admin'] loop
    if (select rolsuper or rolbypassrls from pg_roles where rolname = r) then raise exception 'FAIL: % bypasses row security', r; end if;
  end loop;
  if not exists (select 1 from pg_db_role_setting s join pg_database d on d.oid = s.setdatabase join pg_roles o on o.oid = s.setrole
                 where d.datname = current_database() and o.rolname = 'frata_app' and 'statement_timeout=2s' = any (s.setconfig) and 'synchronous_commit=off' = any (s.setconfig)) then
    raise exception 'FAIL: frata_app has no 2 s statement timeout or asynchronous commit in this database'; end if;
  if exists (select 1 from pg_db_role_setting s join pg_roles o on o.oid = s.setrole where s.setdatabase = 0 and o.rolname = 'frata_app' and 'synchronous_commit=off' = any (s.setconfig)) then
    raise exception 'FAIL: frata_app''s asynchronous commit is set for every database, the main one included'; end if;
end $$;

-- 2. The partitions' schema is closed to every role but the owner.
do $$
declare r text;
begin
  foreach r in array array['frata_app', 'frata_admin', 'anon', 'authenticated', 'service_role'] loop
    if has_schema_privilege(r, 'ev', 'USAGE') then raise exception 'FAIL: % can use schema ev', r; end if;
  end loop;
  if (select count(*) from pg_inherits where inhparent = 'public.events'::regclass) < 9 then raise exception 'FAIL: partitions are not made 7 days ahead'; end if;
  if exists (select 1 from pg_inherits i join pg_class c on c.oid = i.inhrelid where i.inhparent = 'public.events'::regclass and not c.relrowsecurity) then
    raise exception 'FAIL: a partition without row security'; end if;
end $$;

-- 3. Nothing but the rollups is readable by the app; no table at all by the API roles.
do $$
declare r text; t text;
begin
  foreach t in array array['events', 'visitor_days', 'visitor_salts', 'fold_state'] loop
    if has_table_privilege('frata_app', t, 'SELECT') then raise exception 'FAIL: frata_app can read %', t; end if;
  end loop;
  foreach t in array array['visitor_days', 'visitor_salts', 'fold_state', 'traffic_daily', 'source_daily', 'browser_daily', 'city_daily', 'product_daily', 'vitals_daily'] loop
    if has_table_privilege('frata_app', t, 'INSERT') or has_table_privilege('frata_app', t, 'UPDATE') or has_table_privilege('frata_app', t, 'DELETE') then
      raise exception 'FAIL: frata_app can write %', t; end if;
  end loop;
  foreach r in array array['anon', 'authenticated', 'service_role', 'frata_admin'] loop
    foreach t in array array['events', 'visitor_days', 'visitor_salts', 'fold_state', 'traffic_daily', 'source_daily', 'browser_daily', 'city_daily', 'product_daily', 'vitals_daily'] loop
      if has_table_privilege(r, t, 'SELECT') or has_table_privilege(r, t, 'INSERT') then raise exception 'FAIL: % holds a grant on %', r, t; end if;
    end loop;
  end loop;
end $$;

-- 4. The definers: the fold, the rollup and maintenance are no app role's; the ingest pair is frata_app's alone.
do $$
declare r text; f text;
begin
  foreach r in array array['public', 'anon', 'authenticated', 'service_role', 'frata_app', 'frata_admin'] loop
    foreach f in array array['analytics_fold()', 'analytics_rollup(date)', 'analytics_maintain()', 'analytics_add_buckets(integer[], integer[])'] loop
      if has_function_privilege(r, f, 'EXECUTE') then raise exception 'FAIL: % can run %', r, f; end if;
    end loop;
  end loop;
  foreach r in array array['public', 'anon', 'authenticated', 'service_role', 'frata_admin'] loop
    foreach f in array array['analytics_visitor(uuid, text)', 'ingest_events(uuid, text, jsonb)'] loop
      if has_function_privilege(r, f, 'EXECUTE') then raise exception 'FAIL: % can run %', r, f; end if;
    end loop;
  end loop;
  if not has_function_privilege('frata_app', 'ingest_events(uuid, text, jsonb)', 'EXECUTE') then raise exception 'FAIL: frata_app cannot ingest'; end if;
  if (select prosecdef from pg_proc where proname = 'ingest_events') then raise exception 'FAIL: ingest_events is a definer (it must run under the events policy)'; end if;
  if exists (select 1 from pg_proc where proname in ('analytics_visitor', 'analytics_fold', 'analytics_rollup', 'analytics_maintain', 'ingest_events')
             and not coalesce(proconfig, '{}') @> array['search_path=""']) then
    raise exception 'FAIL: a definer without search_path '''''; end if;
end $$;

-- 5. As the app: events, a partition, the salts and visitor-days can't be read; the fold can't be run.
begin; set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$
declare t text; part text := 'ev.events_' || to_char((now() at time zone 'Asia/Kolkata')::date, 'YYYYMMDD');
begin
  foreach t in array array['public.events', part, 'public.visitor_salts', 'public.visitor_days', 'public.fold_state'] loop
    begin
      execute format('select count(*) from %s', t);
      raise exception 'FAIL: frata_app read %', t;
    exception when insufficient_privilege then null;
    end;
  end loop;
  begin
    perform analytics_fold();
    raise exception 'FAIL: frata_app ran the fold';
  exception when insufficient_privilege then null;
  end;
end $$;
commit;

-- 6. Ingest: two shops, the same visitor input. Each batch lands under its own shop; the hash differs per shop and is
-- stable within the day; a batch over 50 events, or a write into another shop, is refused.
begin; set local role frata_app;
select ingest_events('11111111-1111-1111-1111-111111111111', '3|1.2.3|chrome-ua',
  '{"d":"phone","b":"chrome","a":"instagram","c":"Pune","e":[{"k":"page_view","l":true,"p":"/","us":"instagram","um":"bio"},{"k":"view_item","p":"/products/kurta","pid":"aaaaaaaa-0000-0000-0000-000000000001"},{"k":"add_to_cart","pid":"aaaaaaaa-0000-0000-0000-000000000001"},{"k":"web_vital","m":"lcp","v":2100,"pid":"aaaaaaaa-0000-0000-0000-000000000001"}]}');
select ingest_events('22222222-2222-2222-2222-222222222222', '3|1.2.3|chrome-ua',
  '{"d":"phone","b":"chrome","a":"instagram","c":"Pune","e":[{"k":"page_view","l":true,"p":"/","us":"instagram","um":"bio"}]}');
-- The same visitor lands again later in the day from Google: the day's first landing keeps the source.
select ingest_events('11111111-1111-1111-1111-111111111111', '3|1.2.3|chrome-ua',
  '{"d":"phone","b":"chrome","a":"instagram","c":"Pune","e":[{"k":"page_view","l":true,"p":"/","us":"google","um":"cpc"},{"k":"web_vital","m":"lcp","v":3400}]}');
do $$
declare big jsonb := jsonb_build_object('e', (select jsonb_agg(jsonb_build_object('k', 'page_view')) from generate_series(1, 51)));
begin
  begin
    perform ingest_events('11111111-1111-1111-1111-111111111111', 'x', big);
    raise exception 'FAIL: a batch of 51 events was accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  perform set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
  begin
    insert into events (tenant_id, day, visitor, kind) values ('22222222-2222-2222-2222-222222222222', (now() at time zone 'Asia/Kolkata')::date, '\x00', 'page_view');
    raise exception 'FAIL: shop A wrote an event into shop B';
  exception when insufficient_privilege then null;
  end;
  if (select visitor from analytics_visitor('11111111-1111-1111-1111-111111111111', 'v')) is distinct from (select visitor from analytics_visitor('11111111-1111-1111-1111-111111111111', 'v')) then
    raise exception 'FAIL: the visitor hash is not stable within the day'; end if;
  if (select visitor from analytics_visitor('11111111-1111-1111-1111-111111111111', 'v')) = (select visitor from analytics_visitor('22222222-2222-2222-2222-222222222222', 'v')) then
    raise exception 'FAIL: one visitor input hashes the same in two shops'; end if;
  if (select length(visitor) from analytics_visitor('11111111-1111-1111-1111-111111111111', 'v')) <> 16 then raise exception 'FAIL: the visitor hash is not 16 bytes'; end if;
end $$;
commit;
do $$ begin
  if (select count(*) from events where tenant_id = '11111111-1111-1111-1111-111111111111') <> 6 then raise exception 'FAIL: shop A has % events, not 6', (select count(*) from events where tenant_id = '11111111-1111-1111-1111-111111111111'); end if;
  if (select count(*) from events where tenant_id = '22222222-2222-2222-2222-222222222222') <> 1 then raise exception 'FAIL: shop B has % events, not 1', (select count(*) from events where tenant_id = '22222222-2222-2222-2222-222222222222'); end if;
  if (select count(*) from visitor_salts) <> 1 then raise exception 'FAIL: % salts, not one for today', (select count(*) from visitor_salts); end if;
end $$;

-- Shop B: 60 visitors from 60 cities (one each), so its own top 50 folds 10 into ''. Shop A has 1 visitor (Pune).
do $$
declare i integer;
begin
  for i in 1 .. 60 loop
    perform ingest_events('22222222-2222-2222-2222-222222222222', 'city-' || i, jsonb_build_object('d', 'computer', 'b', 'safari', 'c', 'City ' || lpad(i::text, 2, '0'),
      'e', jsonb_build_array(jsonb_build_object('k', 'page_view', 'l', true, 'rh', 'site' || i || '.example'))));
  end loop;
end $$;

-- 7. The fold (as the owner, as pg_cron runs it): events older than the 1-minute lag are folded once.
update events set at = at - interval '5 minutes';
update fold_state set through = now() - interval '1 hour';
create temp table fold1 as select analytics_fold() n;
do $$ begin
  if (select n from fold1) <> 1 then raise exception 'FAIL: the fold touched % days, not 1', (select n from fold1); end if;
  if (select count(*) from visitor_days) <> 62 then raise exception 'FAIL: % visitor-days, not 62', (select count(*) from visitor_days); end if;
  if (select us from visitor_days where tenant_id = '11111111-1111-1111-1111-111111111111') <> 'instagram' then raise exception 'FAIL: a later landing replaced the day''s first source'; end if;
  if (select steps from visitor_days where tenant_id = '11111111-1111-1111-1111-111111111111') <> 7 then raise exception 'FAIL: shop A''s visitor steps are % (page, product, bag = 7)', (select steps from visitor_days where tenant_id = '11111111-1111-1111-1111-111111111111'); end if;
end $$;

-- 8. Two shops with the same inputs stay two rows in every rollup; A's numbers are A's alone.
do $$
declare a uuid := '11111111-1111-1111-1111-111111111111'; b uuid := '22222222-2222-2222-2222-222222222222';
begin
  if (select count(*) from source_daily where us = 'instagram' and um = 'bio') <> 2 then raise exception 'FAIL: two shops merged in source_daily'; end if;
  if (select (visitors, views, product_visitors, bag_visitors, phone) from traffic_daily where tenant_id = a) is distinct from (1, 2, 1, 1, 1) then
    raise exception 'FAIL: shop A''s traffic row is %', (select row(visitors, views, product_visitors, bag_visitors, phone) from traffic_daily where tenant_id = a); end if;
  if (select visitors from traffic_daily where tenant_id = b) <> 61 then raise exception 'FAIL: shop B''s visitors are %', (select visitors from traffic_daily where tenant_id = b); end if;
  if (select count(*) from browser_daily where device = 'phone' and browser = 'chrome' and in_app = 'instagram') <> 2 then raise exception 'FAIL: two shops merged in browser_daily'; end if;
  -- Top-N within a shop: B's 60 cities keep 50 by name plus one '' row of 11 (Pune among them, by name); A's Pune is untouched by B's ranking.
  if (select count(*) from city_daily where tenant_id = b and city <> '') <> 50 then raise exception 'FAIL: shop B keeps % cities, not 50', (select count(*) from city_daily where tenant_id = b and city <> ''); end if;
  if (select visitors from city_daily where tenant_id = b and city = '') <> 11 then raise exception 'FAIL: shop B''s other cities are not 11 visitors (61 cities, 50 kept)'; end if;
  if (select city from city_daily where tenant_id = a) <> 'Pune' then raise exception 'FAIL: shop A''s city was ranked against shop B''s'; end if;
  if (select (views, adds) from product_daily where tenant_id = a) is distinct from (1, 1) then raise exception 'FAIL: shop A''s product row'; end if;
  if exists (select 1 from product_daily where tenant_id = b) then raise exception 'FAIL: shop B has a product row it never sent'; end if;
  if (select n from vitals_daily where tenant_id = a and metric = 'lcp' and product_id = '00000000-0000-0000-0000-000000000000') <> 2 then raise exception 'FAIL: shop A''s all-pages LCP count'; end if;
  if (select n from vitals_daily where tenant_id = a and metric = 'lcp' and product_id = 'aaaaaaaa-0000-0000-0000-000000000001') <> 1 then raise exception 'FAIL: shop A''s product LCP count'; end if;
  if exists (select 1 from vitals_daily where (select sum(x) from unnest(buckets) x) <> n or array_length(buckets, 1) <> 64) then raise exception 'FAIL: a histogram that doesn''t add up to its count'; end if;
end $$;

-- 9. A re-run is idempotent: nothing new folds; rebuilding a day gives the same rows.
create temp table before_rollup as
  select 'traffic' t, tenant_id, visitors v from traffic_daily union all select 'source', tenant_id, visitors from source_daily
  union all select 'city', tenant_id, visitors from city_daily union all select 'browser', tenant_id, visitors from browser_daily;
do $$ begin
  if analytics_fold() <> 0 then raise exception 'FAIL: a second fold found events again'; end if;
  perform analytics_rollup((now() at time zone 'Asia/Kolkata')::date);
  if exists ((select * from before_rollup) except all (
      select 'traffic', tenant_id, visitors from traffic_daily union all select 'source', tenant_id, visitors from source_daily
      union all select 'city', tenant_id, visitors from city_daily union all select 'browser', tenant_id, visitors from browser_daily)) then
    raise exception 'FAIL: rebuilding the day changed the rollups'; end if;
end $$;

-- 10. A later slice adds, never doubles: one more event for A's visitor.
begin; set local role frata_app;
select ingest_events('11111111-1111-1111-1111-111111111111', '3|1.2.3|chrome-ua', '{"d":"phone","b":"chrome","a":"instagram","c":"Pune","e":[{"k":"begin_checkout"},{"k":"web_vital","m":"lcp","v":1800}]}');
commit;
update events set at = now() - interval '2 minutes' where kind = 'begin_checkout' or (kind = 'web_vital' and value = 1800);
update fold_state set through = now() - interval '3 minutes';  -- the first slice (5 minutes old) stays behind the watermark
do $$ begin
  if analytics_fold() <> 1 then raise exception 'FAIL: the second slice was not folded'; end if;
  if (select (visitors, views, checkout_visitors) from traffic_daily where tenant_id = '11111111-1111-1111-1111-111111111111') is distinct from (1, 2, 1) then
    raise exception 'FAIL: a later slice changed shop A''s visits or missed its checkout'; end if;
  if (select n from vitals_daily where tenant_id = '11111111-1111-1111-1111-111111111111' and metric = 'lcp' and product_id = '00000000-0000-0000-0000-000000000000') <> 3 then
    raise exception 'FAIL: the second slice''s vitals did not add'; end if;
end $$;

-- 11. As the app: no shop set, no rows; shop A, only A's rows; no writes.
begin; set local role frata_app;
do $$
declare t text;
begin
  foreach t in array array['traffic_daily', 'source_daily', 'browser_daily', 'city_daily', 'product_daily', 'vitals_daily'] loop
    execute format('select count(*) from %I', t) into strict t;
    if t::integer <> 0 then raise exception 'FAIL: rollup rows visible with no shop set'; end if;
  end loop;
end $$;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$
declare t text; n integer;
begin
  foreach t in array array['traffic_daily', 'source_daily', 'browser_daily', 'city_daily', 'product_daily', 'vitals_daily'] loop
    execute format('select count(*) from %I where tenant_id <> %L', t, '11111111-1111-1111-1111-111111111111') into n;
    if n <> 0 then raise exception 'FAIL: shop A sees another shop''s rows in %', t; end if;
    execute format('select count(*) from %I', t) into n;
    if n = 0 then raise exception 'FAIL: shop A sees none of its own rows in %', t; end if;
  end loop;
  begin
    update traffic_daily set visitors = 999;
    raise exception 'FAIL: frata_app changed a rollup';
  exception when insufficient_privilege then null;
  end;
end $$;
commit;

-- 12. Maintenance: raw events past 90 days go with their partition, yesterday's salt goes, rollups stay 2 years.
do $$
declare old date := (now() at time zone 'Asia/Kolkata')::date - 100;
begin
  execute format('create table ev.%I partition of public.events for values from (%L) to (%L)', 'events_' || to_char(old, 'YYYYMMDD'), old, old + 1);
  insert into visitor_salts values ((now() at time zone 'Asia/Kolkata')::date - 1, '\x01');
  insert into visitor_days (tenant_id, day, visitor, first_at, last_at) values ('11111111-1111-1111-1111-111111111111', old, '\x02', now(), now());
  insert into traffic_daily (tenant_id, day, visitors) values ('11111111-1111-1111-1111-111111111111', old, 5);
  if analytics_maintain() <> 1 then raise exception 'FAIL: maintenance did not drop the 100-day-old partition'; end if;
  if to_regclass('ev.events_' || to_char(old, 'YYYYMMDD')) is not null then raise exception 'FAIL: the old partition is still there'; end if;
  if exists (select 1 from visitor_salts where day < (now() at time zone 'Asia/Kolkata')::date) then raise exception 'FAIL: yesterday''s salt survived'; end if;
  if exists (select 1 from visitor_days where day = old) then raise exception 'FAIL: a 100-day-old visitor-day survived'; end if;
  if not exists (select 1 from traffic_daily where day = old) then raise exception 'FAIL: a 100-day-old rollup was dropped (they keep 2 years)'; end if;
  if analytics_maintain() <> 0 then raise exception 'FAIL: maintenance is not idempotent'; end if;
end $$;

\echo 'analytics tenancy proof — all 12 checks passed'
