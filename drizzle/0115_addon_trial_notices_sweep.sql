-- A3: 3 days before a self-serve trial ends, a required billing notice (and its email) to the shop, once per trial
-- (docs/plans/2026-11-12-true-profit-a3.md, review Sec M2). Run by the daily cron; it takes nothing from its caller.
-- A trial ended before the sweep reaches it gets none; one ended after is skipped by the sender (notice-sender.ts).
create or replace function app_addon_trial_notices() returns int
  language plpgsql volatile security definer set search_path = '' as $$
declare r record; v_n int := 0;
begin
  for r in
    select a.id, a.tenant_id, a.module from public.tenant_addons a
     where a.by_shop and a.trial_ends_at is not null and a.ends_at is null
       and a.trial_ends_at > now() and a.trial_ends_at <= now() + interval '3 days'
       and not exists (select 1 from public.notices n where n.tenant_id = a.tenant_id and n.source_kind = 'addon_trial' and n.source_id = a.id)
     limit 500
  loop
    perform public.notice_write(r.tenant_id, 'billing', 'addon_trial', r.id, null, null, '/console/apps/' || r.module || '?tab=billing', true, true, null, null);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
--> statement-breakpoint
revoke all on function app_addon_trial_notices() from public, anon, authenticated, service_role, frata_admin;
--> statement-breakpoint
grant execute on function app_addon_trial_notices() to frata_app;
