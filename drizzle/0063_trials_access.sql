-- =============================================================================
-- TRIALS TR0 ACCESS (spec docs/specs/2026-11-08-trials.md; plan docs/plans/2026-11-08-trials.md § Review findings,
-- binding: T1–T13, A1–A15, R1–R7, U*, E*). Hand-written.
--
-- ONE trial end. tenant_plans.trial_ends_at is what billing reads; it is written only by app_trial_recompute, from
-- shop_trials (the SQL twin of trialEndsAt in src/domains/plans/trial.ts — app_ist_day_end_after is held to the TS by
-- a parity test). Every writer calls it: the publish trigger (clock start), the extension, Admin's set / extend / end,
-- and every insert into tenant_plans (a plan change — the shop's or Admin's — carries the running trial forward).
-- An upgrade during a trial waits for its end (owner, 2026-11-08): it is marked waits_for_trial, carries no trial, and
-- recompute moves its start to the end. The trial begins once the website is live (owner): the FIRST publish only.
-- Tenancy: shop_trials is read by its own shop only; trial_settings is platform terms (no tenant data); trial_claims
-- has no app grant at all. The shop's extension checks `members` (a support session reports as owner — T3).
-- =============================================================================
insert into trial_settings (id, days, open_window_days, reason) values (1, 30, 15, 'Owner, 2026-11-08: 30 days from going live; 15 days to go live') on conflict (id) do nothing;
--> statement-breakpoint
revoke all on trial_settings, shop_trials, trial_claims from anon, authenticated, service_role;
--> statement-breakpoint
alter table trial_settings enable row level security;
--> statement-breakpoint
alter table shop_trials enable row level security;
--> statement-breakpoint
alter table trial_claims enable row level security;
--> statement-breakpoint
-- Platform terms for new sign-ups, the same for every shop (OPEN_FOR_APP); never who changed them or why.
grant select (id, days, open_window_days, updated_at) on trial_settings to frata_app;
--> statement-breakpoint
create policy app_read on trial_settings for select to frata_app using (true);
--> statement-breakpoint
grant select on trial_settings, shop_trials, trial_claims to frata_admin;
--> statement-breakpoint
create policy admin_read on trial_settings for select to frata_admin using (true);
--> statement-breakpoint
grant select on shop_trials to frata_app;
--> statement-breakpoint
create policy tenant_read on shop_trials for select to frata_app using (tenant_id = app_current_tenant());
--> statement-breakpoint
create policy admin_read on shop_trials for select to frata_admin using (true);
--> statement-breakpoint
create policy admin_read on trial_claims for select to frata_admin using (true);
--> statement-breakpoint

-- ── The end of the IST day `p_days` days after `p_from` (exclusive): endOfIstDayAfter's twin. Pure. ──
create or replace function app_ist_day_end_after(p_from timestamptz, p_days int) returns timestamptz
  language sql immutable set search_path = '' as $$
  select ((date_trunc('day', (p_from + make_interval(days => p_days)) at time zone 'Asia/Kolkata') + interval '1 day') at time zone 'Asia/Kolkata')
$$;
--> statement-breakpoint
-- ── trialEndsAt's twin: the end from the shop's facts; null without a trial. ──
create or replace function app_trial_ends_at(p_tenant uuid) returns timestamptz
  language plpgsql stable set search_path = '' as $$
declare s record; cap timestamptz; e timestamptz;
begin
  select * from public.shop_trials where tenant_id = p_tenant into s;
  if s.tenant_id is null then return null; end if;
  cap := public.app_ist_day_end_after(s.signed_up_at, s.open_window_days + s.days);
  e := case when s.started_at is null then cap else least(public.app_ist_day_end_after(s.started_at, s.days), cap) end;
  if s.extended_at is not null then e := e + interval '7 days'; end if;
  if s.ended_at is not null and s.ended_at < e then e := s.ended_at; end if;
  return e;
end $$;
--> statement-breakpoint
-- ── THE ONE WRITER of the trial end (A1, R4). SECURITY INVOKER and revoked from every role: callable only from the
-- definers and triggers below (they run as the owner). Locks the tenant first. Every plan row the trial touches gets
-- the end (a row starting at or after it has none); the waiting upgrade carries none and starts at the end. ──
create or replace function app_trial_recompute(p_tenant uuid) returns timestamptz
  language plpgsql set search_path = '' as $$
declare e timestamptz;
begin
  perform 1 from public.tenants where id = p_tenant for update;
  e := public.app_trial_ends_at(p_tenant);
  if e is null then return null; end if;
  update public.tenant_plans tp set trial_ends_at = case when tp.starts_at < e then e else null end
   where tp.tenant_id = p_tenant and not tp.waits_for_trial and tp.trial_ends_at is distinct from (case when tp.starts_at < e then e else null end);
  update public.tenant_plans tp set starts_at = greatest(now(), e), trial_ends_at = null
   where tp.tenant_id = p_tenant and tp.waits_for_trial and tp.starts_at > now() and tp.starts_at <> greatest(now(), e);
  return e;
end $$;
--> statement-breakpoint
-- ── A plan row inserted for a shop with a trial (the shop's change, Admin's change, sign-up) carries the trial. ──
create or replace function app_tenant_plans_trial_sync() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.shop_trials where tenant_id = new.tenant_id) then perform public.app_trial_recompute(new.tenant_id); end if;
  return null;
end $$;
--> statement-breakpoint
create trigger tenant_plans_trial_sync after insert on tenant_plans for each row execute function app_tenant_plans_trial_sync();
--> statement-breakpoint
-- ── The clock: the trial begins once the website is live, the FIRST time only (T4: closing nulls published_at). ──
create or replace function app_trial_clock_starts() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  update public.shop_trials set started_at = now() where tenant_id = new.tenant_id and started_at is null;
  if found then perform public.app_trial_recompute(new.tenant_id); end if;
  return null;
end $$;
--> statement-breakpoint
create trigger shop_settings_trial_clock after update of published_at on shop_settings
  for each row when (new.published_at is not null and old.published_at is null) execute function app_trial_clock_starts();
--> statement-breakpoint
-- ── The owner's one extension (7 days): an owner or admin MEMBER of this shop (never a support visit's reported
-- role), from the last 10 days of the trial through its grace, before the third delivered order; counted here. ──
create or replace function app_trial_extend(p_by uuid) returns timestamptz
  language plpgsql security definer set search_path = '' as $$
declare t uuid := public.app_current_tenant(); s record; e timestamptz; delivered int; v_email text;
begin
  if t is null or not exists (select 1 from public.members m where m.tenant_id = t and m.user_id = p_by and m.role in ('owner', 'admin')) then
    raise exception 'trial: only the shop''s owner or an admin can do this' using errcode = 'insufficient_privilege'; end if;
  perform 1 from public.tenants where id = t for update;
  select * from public.shop_trials where tenant_id = t into s;
  if s.tenant_id is null then raise exception 'trial: this shop has no trial' using errcode = 'check_violation'; end if;
  if s.extended_at is not null or s.ended_at is not null then raise exception 'trial: the extra days were already taken' using errcode = 'check_violation'; end if;
  e := public.app_trial_ends_at(t);
  if now() < e - interval '10 days' or now() >= e + interval '7 days' then
    raise exception 'trial: more days can be taken in the last 10 days of the trial' using errcode = 'check_violation'; end if;
  select count(*) into delivered from public.orders o
   where o.tenant_id = t and o.delivered_at is not null and o.rto_initiated_at is null and o.rto_delivered_at is null;
  if delivered >= 3 then raise exception 'trial: more days are for shops that have not yet had 3 delivered orders' using errcode = 'check_violation'; end if;
  update public.shop_trials set extended_at = now(), extended_by = p_by where tenant_id = t;
  e := public.app_trial_recompute(t);
  select u.email into v_email from auth.users u where u.id = p_by;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    values (t, p_by, v_email, 'member', 'trial.extend', null, jsonb_build_object('ends_at', e));
  return e;
end $$;
--> statement-breakpoint
-- ── Admin (ADMIN_ONLY; each checks platform_staff itself, writes its own audit row; frata_admin only — T9). ──
create or replace function app_trial_staff_check(p_staff uuid, p_reason text) returns text
  language plpgsql stable set search_path = '' as $$
declare v_email text;
begin
  select ps.email into v_email from public.platform_staff ps where ps.user_id = p_staff and ps.role = 'admin';
  if v_email is null then raise exception 'trial: Frrata admins only' using errcode = 'insufficient_privilege'; end if;
  if length(coalesce(btrim(p_reason), '')) < 3 then raise exception 'trial: say why (kept in the activity log)' using errcode = 'check_violation'; end if;
  return v_email;
end $$;
--> statement-breakpoint
create or replace function app_admin_set_trial_settings(p_staff uuid, p_days int, p_window int, p_reason text) returns void
  language plpgsql security definer set search_path = '' as $$
declare v_email text := public.app_trial_staff_check(p_staff, p_reason);
begin
  if p_days is null or p_days < 7 or p_days > 45 then raise exception 'trial: a sign-up trial is 7 to 45 days' using errcode = 'check_violation'; end if;
  if p_window is null or p_window < 0 or p_window > 30 then raise exception 'trial: days to go live are 0 to 30' using errcode = 'check_violation'; end if;
  update public.trial_settings set days = p_days, open_window_days = p_window, reason = left(btrim(p_reason), 240), updated_by = p_staff, updated_at = now() where id = 1;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    values (null, p_staff, v_email, 'staff', 'trial.settings', null, jsonb_build_object('days', p_days, 'open_window_days', p_window, 'reason', left(btrim(p_reason), 240)));
end $$;
--> statement-breakpoint
-- One shop's trial: set up (terms frozen now, the window from the current setting) or its length changed, until it goes live.
create or replace function app_admin_set_shop_trial(p_staff uuid, p_tenant uuid, p_days int, p_reason text) returns timestamptz
  language plpgsql security definer set search_path = '' as $$
declare v_email text := public.app_trial_staff_check(p_staff, p_reason); s record; e timestamptz;
begin
  if p_days is null or p_days < 7 or p_days > 90 then raise exception 'trial: one shop''s trial is 7 to 90 days' using errcode = 'check_violation'; end if;
  perform 1 from public.tenants where id = p_tenant for update;
  if not found then raise exception 'trial: no such shop' using errcode = 'invalid_parameter_value'; end if;
  select * from public.shop_trials where tenant_id = p_tenant into s;
  if s.tenant_id is not null and s.started_at is not null then raise exception 'trial: the shop is live; its length is fixed (an extension remains)' using errcode = 'check_violation'; end if;
  if s.tenant_id is null then
    insert into public.shop_trials (tenant_id, days, open_window_days, signed_up_at) select p_tenant, p_days, ts.open_window_days, now() from public.trial_settings ts where ts.id = 1;
  else
    update public.shop_trials set days = p_days where tenant_id = p_tenant;
  end if;
  e := public.app_trial_recompute(p_tenant);
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    values (p_tenant, p_staff, v_email, 'staff', 'trial.set', null, jsonb_build_object('days', p_days, 'ends_at', e, 'reason', left(btrim(p_reason), 240)));
  return e;
end $$;
--> statement-breakpoint
create or replace function app_admin_extend_trial(p_staff uuid, p_tenant uuid, p_reason text) returns timestamptz
  language plpgsql security definer set search_path = '' as $$
declare v_email text := public.app_trial_staff_check(p_staff, p_reason); s record; e timestamptz;
begin
  perform 1 from public.tenants where id = p_tenant for update;
  select * from public.shop_trials where tenant_id = p_tenant into s;
  if s.tenant_id is null then raise exception 'trial: this shop has no trial' using errcode = 'check_violation'; end if;
  if s.extended_at is not null or s.ended_at is not null then raise exception 'trial: the extra days were already taken' using errcode = 'check_violation'; end if;
  update public.shop_trials set extended_at = now(), extended_by = p_staff where tenant_id = p_tenant;
  e := public.app_trial_recompute(p_tenant);
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    values (p_tenant, p_staff, v_email, 'staff', 'trial.extend', null, jsonb_build_object('ends_at', e, 'reason', left(btrim(p_reason), 240)));
  return e;
end $$;
--> statement-breakpoint
create or replace function app_admin_end_trial(p_staff uuid, p_tenant uuid, p_reason text) returns timestamptz
  language plpgsql security definer set search_path = '' as $$
declare v_email text := public.app_trial_staff_check(p_staff, p_reason); s record; e timestamptz;
begin
  perform 1 from public.tenants where id = p_tenant for update;
  select * from public.shop_trials where tenant_id = p_tenant into s;
  if s.tenant_id is null then raise exception 'trial: this shop has no trial' using errcode = 'check_violation'; end if;
  if s.ended_at is not null then raise exception 'trial: already ended' using errcode = 'check_violation'; end if;
  update public.shop_trials set ended_at = now(), ended_by = p_staff where tenant_id = p_tenant;
  e := public.app_trial_recompute(p_tenant);
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    values (p_tenant, p_staff, v_email, 'staff', 'trial.end', null, jsonb_build_object('ends_at', e, 'reason', left(btrim(p_reason), 240)));
  return e;
end $$;
--> statement-breakpoint
-- ── The shop's plan change (0058) marks an upgrade during a trial as waiting for its end (A1); the insert trigger
-- above then recomputes. Otherwise as 0058. ──
create or replace function app_change_plan(p_code text, p_by uuid) returns table (starts_at timestamptz, upgrade boolean)
  language plpgsql security definer set search_path = '' as $$
declare t uuid := public.app_current_tenant(); cur record; target record; at timestamptz; up boolean; v_email text; waits boolean;
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
  waits := up and coalesce(cur.trial_ends_at > now(), false);
  if waits then
    at := cur.trial_ends_at;          -- an upgrade waits until the trial is over
  elsif up then
    at := now();
  else
    at := month1;
  end if;
  insert into public.tenant_plans (tenant_id, plan_version_id, starts_at, trial_ends_at, created_by, reason, by_shop, waits_for_trial)
    values (t, target.id, at, case when not up and cur.trial_ends_at > at then cur.trial_ends_at else null end, p_by, 'Changed by the shop', true, waits);
  select u.email into v_email from auth.users u where u.id = p_by;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    values (t, p_by, v_email, 'member', 'billing.plan.change', target.code, jsonb_build_object('from', cur.code, 'starts_at', at, 'upgrade', up));
  return query select at, up;
end $$;
--> statement-breakpoint
-- ── Collection never debits during a trial (A2, E2): the due list carries each shop's trial end (null without one). ──
drop function if exists app_billing_due();
--> statement-breakpoint
create function app_billing_due() returns table (tenant_id uuid, invoice_id uuid, number text, due bigint, test_mode boolean, issued_at timestamptz,
  mandate boolean, mandate_max bigint, mandate_method text, notice_at timestamptz, attempts int, pending int, last_failed_at timestamptz, acknowledged boolean, trial_ends_at timestamptz)
  language sql stable security definer set search_path = '' as $$
  select i.tenant_id, i.id, i.number,
         i.total - coalesce((select sum(p.amount) from public.frrata_payments p where p.invoice_id = i.id and p.captured_at is not null), 0)
                 - coalesce((select sum(c.total) from public.frrata_credit_notes c where c.invoice_id = i.id), 0),
         i.test_mode, i.issued_at,
         (b.mandate_token_id is not null and b.mandate_revoked_at is null), b.mandate_max, b.mandate_method,
         (select max(n.created_at) from public.billing_notices n where n.invoice_id = i.id and n.kind = 'debit_notice'),
         (select count(*)::int from public.frrata_payments p where p.invoice_id = i.id and p.attempt > 0),
         (select count(*)::int from public.frrata_payments p where p.invoice_id = i.id and p.attempt > 0 and p.captured_at is null and p.failed_at is null),
         (select max(p.failed_at) from public.frrata_payments p where p.invoice_id = i.id and p.attempt > 0),
         exists (select 1 from public.billing_notices n where n.invoice_id = i.id and n.kind = 'acknowledge'),
         public.app_trial_ends_at(i.tenant_id)
    from public.frrata_invoices i left join public.billing_accounts b on b.tenant_id = i.tenant_id
   where i.number is not null and i.issued_at > now() - interval '60 days'
     and i.total > coalesce((select sum(p.amount) from public.frrata_payments p where p.invoice_id = i.id and p.captured_at is not null), 0)
                 + coalesce((select sum(c.total) from public.frrata_credit_notes c where c.invoice_id = i.id), 0)
$$;
--> statement-breakpoint
revoke all on function app_billing_due() from public, anon, authenticated, service_role;
--> statement-breakpoint
grant execute on function app_billing_due() to frata_app;
--> statement-breakpoint
revoke all on function app_ist_day_end_after(timestamptz, int), app_trial_ends_at(uuid), app_trial_recompute(uuid), app_tenant_plans_trial_sync(),
  app_trial_clock_starts(), app_trial_extend(uuid), app_trial_staff_check(uuid, text), app_admin_set_trial_settings(uuid, int, int, text),
  app_admin_set_shop_trial(uuid, uuid, int, text), app_admin_extend_trial(uuid, uuid, text), app_admin_end_trial(uuid, uuid, text)
  from public, anon, authenticated, service_role, frata_app, frata_admin;
--> statement-breakpoint
-- The pure day rule is harmless and the parity test calls it as the app.
grant execute on function app_ist_day_end_after(timestamptz, int) to frata_app;
--> statement-breakpoint
grant execute on function app_trial_extend(uuid) to frata_app;
--> statement-breakpoint
grant execute on function app_admin_set_trial_settings(uuid, int, int, text), app_admin_set_shop_trial(uuid, uuid, int, text),
  app_admin_extend_trial(uuid, uuid, text), app_admin_end_trial(uuid, uuid, text) to frata_admin;
