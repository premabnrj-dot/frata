-- =============================================================================
-- EKCODE ON BY DEFAULT (docs/specs/2026-11-16-ekcode-default-on.md, task E3; owner 2026-11-16). Hand-written.
-- A module is on when the store has an open switch row, or when it is on by default and the store has no row at all
-- (it never chose). The default itself is NOT here: it is `MODULES.ekcode.defaultOn` in the registry, passed in as
-- `p_default` by src/lib/admin/ekcode.ts, so there is no SQL copy of it (architecture review M3). `app_module_on_tenants`
-- is the one SQL mirror of `switchedOnNow` (src/domains/modules/access.ts), set-based (one grouped read of the switch
-- rows, never a call per store: speed review 2026-11-16 M2); proof § 101 runs it over the same cases as the
-- TS tests in src/domains/modules/__tests__/access.test.ts (no row, closed only, closed then open; with and without).
-- Admin's store list now lists only stores that have opened, on the same rule; "stores offering it" and the busiest
-- hour of the last 7 days (against `globalHour`, task E5) are counted on their own, never off the capped list.
-- =============================================================================
-- The stores where a module is on: an open row, or no row at all and on by default (a closed row only is off).
create or replace function app_module_on_tenants(p_module text, p_default boolean) returns table (tenant_id uuid)
  language sql stable set search_path = '' as $$
  select t.id from public.tenants t
  left join (select m.tenant_id, bool_or(m.disabled_at is null) open from public.tenant_modules m where m.module = p_module group by 1) s on s.tenant_id = t.id
  where coalesce(s.open, coalesce(p_default, false))
$$;--> statement-breakpoint
revoke all on function app_module_on_tenants(text, boolean) from public, anon, authenticated, service_role, frata_app, frata_admin, frata_builder;--> statement-breakpoint
-- The signature changes (p_default), so the old one goes; dropping resets grants, re-run below.
drop function if exists app_admin_ekcode_shops(uuid, int);--> statement-breakpoint
create function app_admin_ekcode_shops(p_uid uuid, p_days int, p_default boolean)
  returns table (tenant_id uuid, shop text, plan text, started bigint, codes bigint, verified bigint, continued bigint, delivered_month bigint,
    breaker_at timestamptz, paused_at timestamptz, raised_cap int)
  -- jit off: the per-store subqueries make the planner's estimate cross the JIT threshold, and compiling costs more
  -- than the query (speed review 2026-11-16: 400–480 ms with it, 160–190 ms without, at 4,500 open stores).
  language plpgsql stable security definer set search_path = '' set jit = off as $$
begin
  if public.ekcode_staff(p_uid, false) is null then raise exception 'not_staff' using errcode = 'P0001'; end if;
  if p_days not in (1, 7, 30) then raise exception 'ekcode: bad period' using errcode = 'invalid_parameter_value'; end if;
  return query
  select t.id, t.name, public.ekcode_plan_of(t.id),
    -- Counts under 5 are not shown (tenancy S1): a single shopper is never readable from a row.
    case when coalesce(sum(d.started), 0) < 5 then null else sum(d.started) end::bigint, case when coalesce(sum(d.codes), 0) < 5 then null else sum(d.codes) end::bigint,
    case when coalesce(sum(d.verified), 0) < 5 then null else sum(d.verified) end::bigint, case when coalesce(sum(d.continued), 0) < 5 then null else sum(d.continued) end::bigint,
    (select count(*) from public.ekcode_codes k where k.tenant_id = t.id and k.delivered_at >= date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata'),
    c.breaker_at, c.paused_at, c.raised_cap
  from public.tenants t
  left join public.ekcode_daily d on d.tenant_id = t.id and d.day >= (now() at time zone 'Asia/Kolkata')::date - (p_days - 1)
  left join public.ekcode_shop_controls c on c.tenant_id = t.id
  where t.first_opened_at is not null and t.id in (select o.tenant_id from public.app_module_on_tenants('ekcode', p_default) o)
  group by t.id, t.name, c.breaker_at, c.paused_at, c.raised_cap
  order by coalesce(sum(d.codes), 0) desc
  limit 500;
end $$;--> statement-breakpoint
-- How far EkCode reaches, counted whole: open stores offering it, open stores in all, and the busiest hour of codes in
-- the last 7 days, as `globalHour` counts it (E5: Admin warns at 80%). `ekcode_issue_code` refuses on a ROLLING hour
-- (codes since now() - 1 hour), so the peak here is the most codes in any 60 minutes, not in a clock hour (a burst
-- across :00 would read half); `busiest_at` is the end of that window. The window includes a code exactly 60 minutes
-- back, which the limit does not: it can read one high, the safe side. Under 5 codes both are null (tenancy S1: a
-- single shopper's moment is never readable).
create or replace function app_admin_ekcode_reach(p_uid uuid, p_default boolean)
  returns table (offering bigint, opened bigint, busiest_hour bigint, busiest_at timestamptz)
  language plpgsql stable security definer set search_path = '' as $$
begin
  if public.ekcode_staff(p_uid, false) is null then raise exception 'not_staff' using errcode = 'P0001'; end if;
  return query
  select (select count(*) from public.tenants t where t.first_opened_at is not null and t.id in (select o.tenant_id from public.app_module_on_tenants('ekcode', p_default) o)),
    (select count(*) from public.tenants t where t.first_opened_at is not null),
    case when coalesce(h.n, 0) < 5 then null else h.n::bigint end, case when coalesce(h.n, 0) < 5 then null else h.ends end
  from (select 1) one
  -- Counted per minute first (at most 10,080 rows a week), then the rolling 60 minutes over those counts (speed M1).
  left join lateral (select w.n, w.ends from (select b.ends, sum(b.n) over (order by b.ends range between interval '59 minutes' preceding and current row) n
      from (select date_trunc('minute', k.created_at) + interval '1 minute' as ends, count(*) n from public.ekcode_codes k
        where k.created_at > now() - interval '7 days' group by 1) b) w order by w.n desc, w.ends desc limit 1) h on true;
end $$;--> statement-breakpoint
revoke all on function app_admin_ekcode_shops(uuid, int, boolean), app_admin_ekcode_reach(uuid, boolean)
  from public, anon, authenticated, service_role, frata_app, frata_builder;--> statement-breakpoint
grant execute on function app_admin_ekcode_shops(uuid, int, boolean), app_admin_ekcode_reach(uuid, boolean) to frata_admin;
