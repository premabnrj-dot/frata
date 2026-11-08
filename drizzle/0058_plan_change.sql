-- =============================================================================
-- BILLING B4: A SHOP CHANGES ITS OWN PLAN (docs/specs/2026-11-08-billing.md § Phases; owner call: upgrade now, the
-- difference charged by days on the next invoice; downgrade on the 1st). Hand-written.
-- Bound to app_current_tenant(): a shop changes only its own plan, from the latest public version of a plan. An upgrade
-- starts now; a downgrade starts on the next 1st (IST); a scheduled change can be cancelled until it starts. A price
-- agreed with Frrata (custom) is never changed here. tenant_plans stays written only by definers and frata_admin.
-- =============================================================================
create or replace function app_change_plan(p_code text, p_by uuid) returns table (starts_at timestamptz, upgrade boolean)
  language plpgsql security definer set search_path = '' as $$
declare t uuid := public.app_current_tenant(); cur record; target record; cur_price bigint; at timestamptz;
begin
  if t is null then raise exception 'plan: no shop' using errcode = 'insufficient_privilege'; end if;
  select tp.*, v.monthly_price vprice, p.code into cur from public.tenant_plans tp join public.plan_versions v on v.id = tp.plan_version_id join public.plans p on p.id = v.plan_id
   where tp.tenant_id = t and tp.starts_at <= now() order by tp.starts_at desc limit 1 for update of tp;
  if cur.id is null then raise exception 'plan: no plan yet; Frrata sets the first' using errcode = 'check_violation'; end if;
  if cur.custom_monthly_price is not null then raise exception 'plan: your price was agreed with Frrata; message Frrata to change it' using errcode = 'check_violation'; end if;
  select v.id, v.monthly_price, p.code into target from public.plan_versions v join public.plans p on p.id = v.plan_id
   where p.code = p_code order by v.version desc limit 1;
  if target.id is null then raise exception 'plan: no such plan' using errcode = 'invalid_parameter_value'; end if;
  if target.code = cur.code then raise exception 'plan: that is your plan already' using errcode = 'check_violation'; end if;
  cur_price := cur.vprice;
  -- A change Frrata scheduled is never undone from here; the shop's own scheduled change is replaced.
  if exists (select 1 from public.tenant_plans where tenant_id = t and tenant_plans.starts_at > now() and coalesce(reason, '') <> 'Changed by the shop') then
    raise exception 'plan: Frrata has a change scheduled for your plan; message Frrata' using errcode = 'check_violation'; end if;
  delete from public.tenant_plans where tenant_id = t and tenant_plans.starts_at > now() and reason = 'Changed by the shop';
  if target.monthly_price > cur_price then
    at := now();
  else
    at := (date_trunc('month', now() at time zone 'Asia/Kolkata') + interval '1 month') at time zone 'Asia/Kolkata';
  end if;
  insert into public.tenant_plans (tenant_id, plan_version_id, starts_at, trial_ends_at, created_by, reason)
    values (t, target.id, at, case when cur.trial_ends_at > at then cur.trial_ends_at else null end, p_by, 'Changed by the shop');
  return query select at, target.monthly_price > cur_price;
end $$;
--> statement-breakpoint
create or replace function app_cancel_plan_change() returns void language sql security definer set search_path = '' as $$
  delete from public.tenant_plans where tenant_id = public.app_current_tenant() and starts_at > now() and reason = 'Changed by the shop'
$$;
--> statement-breakpoint
revoke all on function app_change_plan(text, uuid), app_cancel_plan_change() from public, anon, authenticated, service_role;
--> statement-breakpoint
grant execute on function app_change_plan(text, uuid), app_cancel_plan_change() to frata_app;
