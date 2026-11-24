-- O1 sign-up (plan docs/plans/2026-11-23-o1-signup.md O1·2), EXPAND: sign-up and the partner's New client store
-- without a pickup PIN code (it moves to Settings › Store; shop_settings.pickup_pincode is already nullable). Two new
-- definers beside the old ones: v1, v2 and the 10-argument partner function stay until 0180, applied only after the
-- build that calls these is live (§ Deploy order). Apply this one BEFORE the push.

-- ── app_create_shop_v3: v2 (0065) line for line, minus the PIN code; plus the sign-up's elapsed time in the audit ──
create function app_create_shop_v3(p_uid uuid, p_name text, p_slug text, p_sells text[], p_plan text,
  p_email_hmac text, p_key_version smallint, p_code_id uuid, p_signup_ms integer) returns table (tenant_id uuid, trial boolean)
  language plpgsql volatile security definer set search_path = '' as $$
declare
  v_email text; v_tenant uuid; v_version uuid; v_name text := btrim(p_name); v_trial boolean := true; c record; ts record;
  v_phone text; v_phone_ver smallint; v_detail jsonb;
begin
  select u.email into v_email from auth.users u where u.id = p_uid and u.email_confirmed_at is not null;
  if v_email is null then raise exception 'email_unconfirmed' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext('create_shop:' || p_uid::text));
  if exists (select 1 from public.members m where m.user_id = p_uid and m.role = 'owner') then raise exception 'has_shop' using errcode = 'P0001'; end if;
  if v_name = '' or length(v_name) > 60 then raise exception 'bad_name' using errcode = 'P0001'; end if;
  if p_slug !~ '^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])$' or p_slug ~ '--' then raise exception 'bad_slug' using errcode = 'P0001'; end if;
  if exists (select 1 from public.tenants t where t.slug = p_slug) then raise exception 'slug_taken' using errcode = 'P0001'; end if;
  if p_plan is null or p_plan not in ('launch', 'growth', 'scale') then raise exception 'bad_plan' using errcode = 'P0001'; end if;
  select pv.id into v_version from public.plan_versions pv join public.plans p on p.id = pv.plan_id
    where p.code = p_plan order by pv.version desc limit 1;
  if v_version is null then raise exception 'bad_plan' using errcode = 'P0001'; end if;
  -- The verified phone, from a code this person verified within 30 minutes and has not used (R3).
  if p_code_id is not null then
    select * from public.signup_codes sc where sc.id = p_code_id and sc.user_id = p_uid for update into c;
    if c.id is null or c.verified_at is null or c.consumed_at is not null or c.verified_at < now() - interval '30 minutes' then
      raise exception 'bad_code' using errcode = 'P0001'; end if;
    update public.signup_codes set consumed_at = now() where id = c.id;
    v_phone := c.phone_hmac; v_phone_ver := c.key_version;
  end if;
  -- Two sign-ups with one key wait for each other here, so the check below sees the other's claim (security review TR1).
  if coalesce(p_email_hmac, '') <> '' then perform pg_advisory_xact_lock(hashtext('trial_claim:email:' || p_email_hmac)); end if;
  if v_phone is not null then perform pg_advisory_xact_lock(hashtext('trial_claim:phone:' || v_phone)); end if;
  -- No claimable key (the app has no claim secret): no trial, fail closed.
  if coalesce(p_email_hmac, '') = '' then v_trial := false; end if;
  if v_trial and exists (select 1 from public.trial_claims tc where tc.kind = 'email' and tc.key_version = p_key_version and tc.key_hmac = p_email_hmac) then v_trial := false; end if;
  if v_trial and v_phone is not null and exists (select 1 from public.trial_claims tc where tc.kind = 'phone' and tc.key_version = v_phone_ver and tc.key_hmac = v_phone) then v_trial := false; end if;

  insert into public.tenants (slug, name) values (p_slug, v_name) returning id into v_tenant;
  insert into public.members (tenant_id, user_id, role) values (v_tenant, p_uid, 'owner');
  insert into public.shop_settings (tenant_id, sells, support_email) values (v_tenant, coalesce(p_sells, '{}'), v_email);
  if v_trial then
    select * from public.trial_settings where id = 1 into ts;
    insert into public.shop_trials (tenant_id, days, open_window_days, signed_up_at) values (v_tenant, ts.days, ts.open_window_days, now());
    insert into public.trial_claims (kind, key_hmac, key_version, tenant_id) values ('email', p_email_hmac, p_key_version, v_tenant) on conflict do nothing;
    if v_phone is not null then insert into public.trial_claims (kind, key_hmac, key_version, tenant_id) values ('phone', v_phone, v_phone_ver, v_tenant) on conflict do nothing; end if;
  end if;
  -- The plan row's insert trigger carries the trial (app_trial_recompute writes its provisional end).
  insert into public.tenant_plans (tenant_id, plan_version_id, starts_at, created_by) values (v_tenant, v_version, now(), p_uid);
  -- "/start → created" (plan § Measure): the browser's elapsed time, kept only when it is inside a day.
  v_detail := jsonb_build_object('sells', p_sells, 'plan', p_plan, 'trial', v_trial);
  if p_signup_ms between 0 and 86400000 then v_detail := v_detail || jsonb_build_object('signup_ms', p_signup_ms); end if;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    values (v_tenant, p_uid, v_email, 'member', 'shop.created', p_slug, v_detail);
  return query select v_tenant, v_trial;
end $$;
--> statement-breakpoint
revoke all on function app_create_shop_v3(uuid, text, text, text[], text, text, smallint, uuid, integer)
  from public, anon, authenticated, service_role, frata_admin, frata_builder;
--> statement-breakpoint
grant execute on function app_create_shop_v3(uuid, text, text, text[], text, text, smallint, uuid, integer) to frata_app;
--> statement-breakpoint

-- ── app_partner_create_shop_v2: 0129's partner definer line for line, minus the PIN code ──
create function app_partner_create_shop_v2(p_uid uuid, p_session uuid, p_stepup text, p_name text, p_slug text,
  p_share_bps integer, p_share_months integer, p_notice_days integer, p_max_unopened integer) returns uuid
  language plpgsql volatile security definer set search_path = '' as $$
declare me record; v_email text; v_owner record; v_tenant uuid; v_version uuid; v_name text := btrim(p_name); ts record;
begin
  select x.* into me from public.app_pm_live(p_uid) x where x.role in ('owner', 'lead');
  if me.member_id is null then raise exception 'not_partner' using errcode = 'P0001'; end if;
  perform public.app_partner_need(p_uid, p_session, p_stepup, false);
  select p.email into v_email from public.partners p where p.id = me.partner_id;
  perform pg_advisory_xact_lock(hashtext('create_shop:' || me.partner_id::text));
  if (select count(*) from public.partner_links l
       where l.partner_id = me.partner_id and l.removed_at is null
         and not exists (select 1 from public.members m where m.tenant_id = l.tenant_id and m.role = 'owner')) >= p_max_unopened then
    raise exception 'too_many' using errcode = 'P0001';
  end if;
  if v_name = '' or length(v_name) > 60 then raise exception 'bad_name' using errcode = 'P0001'; end if;
  if p_slug !~ '^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])$' or p_slug ~ '--' then raise exception 'bad_slug' using errcode = 'P0001'; end if;
  if exists (select 1 from public.tenants t where t.slug = p_slug) then raise exception 'slug_taken' using errcode = 'P0001'; end if;
  select pv.id into v_version from public.plan_versions pv join public.plans p on p.id = pv.plan_id
    where p.code = 'launch' order by pv.version desc limit 1;
  if v_version is null then raise exception 'no_launch_plan' using errcode = 'P0001'; end if;
  insert into public.tenants (slug, name) values (p_slug, v_name) returning id into v_tenant;
  insert into public.members (tenant_id, user_id, role, partner_member_id) values (v_tenant, p_uid, 'partner', me.member_id);
  if me.role = 'lead' then
    insert into public.partner_assignments (partner_member_id, tenant_id) values (me.member_id, v_tenant);
    select pm.id, pm.user_id into v_owner from public.partner_members pm
     where pm.partner_id = me.partner_id and pm.role = 'owner' and pm.removed_at is null and pm.accepted_at is not null limit 1;
    if v_owner.id is not null then
      insert into public.members (tenant_id, user_id, role, partner_member_id) values (v_tenant, v_owner.user_id, 'partner', v_owner.id)
        on conflict do nothing;
    end if;
  end if;
  insert into public.shop_settings (tenant_id, support_email) values (v_tenant, v_email);
  select * from public.trial_settings where id = 1 into ts;
  insert into public.shop_trials (tenant_id, days, open_window_days, signed_up_at, started_at) values (v_tenant, ts.days, ts.open_window_days, now(), now());
  insert into public.tenant_plans (tenant_id, plan_version_id, starts_at, created_by) values (v_tenant, v_version, now(), p_uid);
  insert into public.partner_links (tenant_id, partner_id, share_bps, share_months, notice_days)
    values (v_tenant, me.partner_id, p_share_bps, p_share_months, p_notice_days);
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    select v_tenant, p_uid, u.email, 'member', 'shop.created', p_slug, jsonb_build_object('by', 'partner')
      from auth.users u where u.id = p_uid;
  return v_tenant;
end $$;
--> statement-breakpoint
revoke all on function app_partner_create_shop_v2(uuid, uuid, text, text, text, integer, integer, integer, integer)
  from public, anon, authenticated, service_role, frata_app, frata_admin, frata_builder;
--> statement-breakpoint
grant execute on function app_partner_create_shop_v2(uuid, uuid, text, text, text, integer, integer, integer, integer) to frata_app;
