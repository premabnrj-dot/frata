-- =============================================================================
-- BILLING B4: A SHOP CHANGES ITS OWN PLAN (docs/specs/2026-11-08-billing.md § Phases; owner call: upgrade now, the
-- difference charged by days on the next invoice; downgrade on the 1st). Hand-written. tenant_plans.by_shop is added
-- by 0061 (plpgsql bodies are resolved when they run).
-- Bound to app_current_tenant(), and the actor must be an owner or admin of that shop (the precedent:
-- app_change_shop_address). Each change and cancel is audited here. The shop is locked first, so two tabs act one
-- after the other. A price agreed with Frrata (custom) or a change Frrata scheduled (by_shop false) is never changed
-- here. Security review 2026-11-08:
--  * an upgrade keeps the shop on the higher plan until the end of the NEXT month (a downgrade after it starts the 1st
--    of the month after next), so a short upgrade cannot buy a lower fee for a month's deliveries;
--  * a trial does not carry onto a higher plan: the higher plan is paid from the moment it starts.
-- tenant_plans stays written only by definers and frata_admin; Admin cannot write by_shop (column grant).
-- =============================================================================
create or replace function app_change_plan(p_code text, p_by uuid) returns table (starts_at timestamptz, upgrade boolean)
  language plpgsql security definer set search_path = '' as $$
declare t uuid := public.app_current_tenant(); cur record; target record; at timestamptz; up boolean; v_email text;
  month1 timestamptz := (date_trunc('month', now() at time zone 'Asia/Kolkata') + interval '1 month') at time zone 'Asia/Kolkata';
begin
  if t is null then raise exception 'plan: no shop' using errcode = 'insufficient_privilege'; end if;
  if not exists (select 1 from public.members m where m.tenant_id = t and m.user_id = p_by and m.role in ('owner', 'admin')) then
    raise exception 'plan: only the shop''s owner or an admin can change its plan' using errcode = 'insufficient_privilege'; end if;
  perform 1 from public.tenants where id = t for update;
  select tp.*, v.monthly_price vprice, p.code into cur from public.tenant_plans tp join public.plan_versions v on v.id = tp.plan_version_id join public.plans p on p.id = v.plan_id
   where tp.tenant_id = t and tp.starts_at <= now() order by tp.starts_at desc limit 1;
  if cur.id is null then raise exception 'plan: no plan yet; Frrata sets the first' using errcode = 'check_violation'; end if;
  if cur.custom_monthly_price is not null then raise exception 'plan: your price was agreed with Frrata; message Frrata to change it' using errcode = 'check_violation'; end if;
  select v.id, v.monthly_price, p.code into target from public.plan_versions v join public.plans p on p.id = v.plan_id
   where p.code = p_code order by v.version desc limit 1;
  if target.id is null then raise exception 'plan: no such plan' using errcode = 'invalid_parameter_value'; end if;
  if target.code = cur.code then raise exception 'plan: that is your plan already' using errcode = 'check_violation'; end if;
  if exists (select 1 from public.tenant_plans tp where tp.tenant_id = t and tp.starts_at > now() and not tp.by_shop) then
    raise exception 'plan: Frrata has a change scheduled for your plan; message Frrata' using errcode = 'check_violation'; end if;
  delete from public.tenant_plans tp where tp.tenant_id = t and tp.starts_at > now() and tp.by_shop;
  up := target.monthly_price > cur.vprice;
  if up then
    at := now();
  elsif cur.by_shop and cur.starts_at >= month1 - interval '1 month' then
    -- The current plan is this month's upgrade: it runs to the end of next month.
    at := (date_trunc('month', now() at time zone 'Asia/Kolkata') + interval '2 months') at time zone 'Asia/Kolkata';
  else
    at := month1;
  end if;
  insert into public.tenant_plans (tenant_id, plan_version_id, starts_at, trial_ends_at, created_by, reason, by_shop)
    values (t, target.id, at, case when not up and cur.trial_ends_at > at then cur.trial_ends_at else null end, p_by, 'Changed by the shop', true);
  select u.email into v_email from auth.users u where u.id = p_by;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    values (t, p_by, v_email, 'member', 'billing.plan.change', target.code, jsonb_build_object('from', cur.code, 'starts_at', at, 'upgrade', up));
  return query select at, up;
end $$;
--> statement-breakpoint
create or replace function app_cancel_plan_change(p_by uuid) returns boolean language plpgsql security definer set search_path = '' as $$
declare t uuid := public.app_current_tenant(); n int; v_email text;
begin
  if t is null or not exists (select 1 from public.members m where m.tenant_id = t and m.user_id = p_by and m.role in ('owner', 'admin')) then
    raise exception 'plan: only the shop''s owner or an admin can change its plan' using errcode = 'insufficient_privilege'; end if;
  delete from public.tenant_plans tp where tp.tenant_id = t and tp.starts_at > now() and tp.by_shop;
  get diagnostics n = row_count;
  if n > 0 then
    select u.email into v_email from auth.users u where u.id = p_by;
    insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
      values (t, p_by, v_email, 'member', 'billing.plan.cancel', null, '{}'::jsonb);
  end if;
  return n > 0;
end $$;
--> statement-breakpoint
-- Admin: a change Frrata makes replaces the shop's own scheduled one (impact review): Admin holds no delete on
-- tenant_plans, so this removes only by_shop rows still to start.
create or replace function app_admin_clear_shop_plan_change(p_tenant uuid) returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  delete from public.tenant_plans tp where tp.tenant_id = p_tenant and tp.starts_at > now() and tp.by_shop;
  get diagnostics n = row_count;
  return n;
end $$;
--> statement-breakpoint
revoke all on function app_change_plan(text, uuid), app_cancel_plan_change(uuid), app_admin_clear_shop_plan_change(uuid) from public, anon, authenticated, service_role;
--> statement-breakpoint
grant execute on function app_change_plan(text, uuid), app_cancel_plan_change(uuid) to frata_app;
--> statement-breakpoint
grant execute on function app_admin_clear_shop_plan_change(uuid) to frata_admin;
--> statement-breakpoint
-- Admin inserts tenant_plans rows but never as the shop (drizzle writes DEFAULT into every column, so a column grant
-- cannot say this; a trigger does). The definer above runs as the table's owner, not as frata_admin.
create or replace function app_tenant_plans_by_shop_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.by_shop and current_user = 'frata_admin' then raise exception 'plan: Admin never writes a change as the shop' using errcode = 'insufficient_privilege'; end if;
  return new;
end $$;
--> statement-breakpoint
drop trigger if exists tenant_plans_by_shop_guard on tenant_plans;
--> statement-breakpoint
create trigger tenant_plans_by_shop_guard before insert or update on tenant_plans for each row execute function app_tenant_plans_by_shop_guard();
--> statement-breakpoint
revoke all on function app_tenant_plans_by_shop_guard() from public, anon, authenticated, service_role;
