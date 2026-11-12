-- A3: SELF-SERVE ADD-ON TRIALS (docs/plans/2026-11-12-true-profit-a3.md, review findings; first used by Delivery Zones
-- on Launch). frata_app still only READS tenant_addons; these three definers are its only writes. Each takes the shop
-- from app_current_tenant() (never an argument), checks the caller is the shop's owner or admin, and takes times from
-- now() and the price from addon_prices (never the browser). The trial ends at 23:59:59 IST on day 14.
create unique index addon_prices_id_module on addon_prices (id, module);
--> statement-breakpoint
alter table tenant_addons add constraint tenant_addons_price_module foreign key (addon_price_id, module) references addon_prices (id, module);
--> statement-breakpoint
create or replace function app_start_addon_trial(p_uid uuid, p_module text, p_price uuid) returns timestamptz
  language plpgsql volatile security definer set search_path = '' as $$
declare
  v_tenant uuid := public.app_current_tenant();
  v_ends timestamptz;
begin
  if v_tenant is null then raise exception 'no_shop' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.members m where m.tenant_id = v_tenant and m.user_id = p_uid and m.role in ('owner', 'admin')) then
    raise exception 'not_owner' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('trial:' || v_tenant::text || ':' || p_module));
  -- One trial per shop and add-on, ever (Admin's trials count too); none while the shop has it.
  if exists (select 1 from public.tenant_addons a where a.tenant_id = v_tenant and a.module = p_module and a.trial_ends_at is not null) then
    raise exception 'trialled' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.tenant_addons a where a.tenant_id = v_tenant and a.module = p_module and (a.ends_at is null or a.ends_at > now())) then
    raise exception 'has_it' using errcode = 'P0001';
  end if;
  -- The price shown is the price agreed: the add-on's newest version, and the one the page showed.
  if p_price is distinct from (select p.id from public.addon_prices p where p.module = p_module order by p.version desc limit 1) then
    raise exception 'price_changed' using errcode = 'P0001';
  end if;
  v_ends := ((date_trunc('day', now() at time zone 'Asia/Kolkata') + interval '15 days' - interval '1 second') at time zone 'Asia/Kolkata');
  insert into public.tenant_addons (tenant_id, module, starts_at, trial_ends_at, by_shop, reason, created_by)
    values (v_tenant, p_module, now(), v_ends, true, '14-day trial', p_uid);
  insert into public.tenant_addons (tenant_id, module, addon_price_id, starts_at, by_shop, reason, created_by)
    values (v_tenant, p_module, p_price, v_ends, true, 'After the trial', p_uid);
  return v_ends;
end $$;
--> statement-breakpoint
-- End trial: the trial and the paid row after it both close now; nothing is ever charged.
create or replace function app_end_addon_trial(p_uid uuid, p_module text) returns boolean
  language plpgsql volatile security definer set search_path = '' as $$
declare
  v_tenant uuid := public.app_current_tenant();
  v_trial public.tenant_addons%rowtype;
begin
  if v_tenant is null then raise exception 'no_shop' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.members m where m.tenant_id = v_tenant and m.user_id = p_uid and m.role in ('owner', 'admin')) then
    raise exception 'not_owner' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('trial:' || v_tenant::text || ':' || p_module));
  select * into v_trial from public.tenant_addons a where a.tenant_id = v_tenant and a.module = p_module and a.by_shop
    and a.trial_ends_at > now() and a.ends_at is null;
  if not found then return false; end if;
  update public.tenant_addons a set ends_at = now() where a.id = v_trial.id;
  update public.tenant_addons a set ends_at = a.starts_at
   where a.tenant_id = v_tenant and a.module = p_module and a.by_shop and a.addon_price_id is not null and a.ends_at is null and a.starts_at >= v_trial.trial_ends_at;
  return true;
end $$;
--> statement-breakpoint
-- Stop a paid add-on: it was billed for this month in advance, so it works to the month's end and is never billed again.
create or replace function app_stop_addon(p_uid uuid, p_module text) returns timestamptz
  language plpgsql volatile security definer set search_path = '' as $$
declare
  v_tenant uuid := public.app_current_tenant();
  v_end timestamptz := ((date_trunc('month', now() at time zone 'Asia/Kolkata') + interval '1 month') at time zone 'Asia/Kolkata');
  v_n int;
begin
  if v_tenant is null then raise exception 'no_shop' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.members m where m.tenant_id = v_tenant and m.user_id = p_uid and m.role in ('owner', 'admin')) then
    raise exception 'not_owner' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('trial:' || v_tenant::text || ':' || p_module));
  update public.tenant_addons a set ends_at = v_end
   where a.tenant_id = v_tenant and a.module = p_module and a.addon_price_id is not null and a.starts_at <= now()
     and (a.ends_at is null or a.ends_at > v_end);
  get diagnostics v_n = row_count;
  return case when v_n > 0 then v_end else null end;
end $$;
--> statement-breakpoint
revoke all on function app_start_addon_trial(uuid, text, uuid) from public, anon, authenticated, service_role, frata_admin;
--> statement-breakpoint
revoke all on function app_end_addon_trial(uuid, text) from public, anon, authenticated, service_role, frata_admin;
--> statement-breakpoint
revoke all on function app_stop_addon(uuid, text) from public, anon, authenticated, service_role, frata_admin;
--> statement-breakpoint
grant execute on function app_start_addon_trial(uuid, text, uuid) to frata_app;
--> statement-breakpoint
grant execute on function app_end_addon_trial(uuid, text) to frata_app;
--> statement-breakpoint
grant execute on function app_stop_addon(uuid, text) to frata_app;
