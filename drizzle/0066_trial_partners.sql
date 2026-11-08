-- =============================================================================
-- TRIALS TR1·10: PARTNER-BUILT SHOPS (plan § R1, R7, A5; owner 2026-11-08: the trial begins once the website is live,
-- for every shop; a brand accepting a handover with under 7 trial days left gets the extension automatically).
-- Hand-written. Replaces app_partner_create_shop and app_accept_handover (0023) and app_shops_to_bill (0048).
-- - A partner's cap counts its shops not yet handed over, live or not (R1: publishing no longer frees a slot).
-- - A partner-built shop gets its trial terms at creation (frozen); the publish trigger starts the clock.
-- - Handover claims the new owner's VERIFIED email (the HMAC the app computes from getUser(); R7). A business that
--   has had a trial ends this one now; otherwise, under 7 days left, the one extension is given at once.
-- - A shop with no owner is never billed (R1): app_shops_to_bill lists owned shops only.
-- =============================================================================
create or replace function app_partner_create_shop(p_uid uuid, p_name text, p_slug text, p_pickup text,
  p_share_bps integer, p_share_months integer, p_notice_days integer, p_max_unopened integer) returns uuid
  language plpgsql volatile security definer set search_path = '' as $$
declare v_partner uuid; v_email text; v_tenant uuid; v_version uuid; v_name text := btrim(p_name); ts record;
begin
  select p.id, p.email into v_partner, v_email from public.partners p
   where p.user_id = p_uid and p.approved_at is not null and p.declined_at is null;
  if v_partner is null then raise exception 'not_partner' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext('create_shop:' || p_uid::text));
  -- Shops not yet handed over count, live or not (R1).
  if (select count(*) from public.partner_links l
       where l.partner_id = v_partner and l.removed_at is null
         and not exists (select 1 from public.members m where m.tenant_id = l.tenant_id and m.role = 'owner')) >= p_max_unopened then
    raise exception 'too_many' using errcode = 'P0001';
  end if;
  if v_name = '' or length(v_name) > 60 then raise exception 'bad_name' using errcode = 'P0001'; end if;
  if p_slug !~ '^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])$' or p_slug ~ '--' then raise exception 'bad_slug' using errcode = 'P0001'; end if;
  if p_pickup !~ '^[1-9][0-9]{5}$' then raise exception 'bad_pincode' using errcode = 'P0001'; end if;
  if exists (select 1 from public.tenants t where t.slug = p_slug) then raise exception 'slug_taken' using errcode = 'P0001'; end if;
  select pv.id into v_version from public.plan_versions pv join public.plans p on p.id = pv.plan_id
    where p.code = 'launch' order by pv.version desc limit 1;
  if v_version is null then raise exception 'no_launch_plan' using errcode = 'P0001'; end if;

  insert into public.tenants (slug, name) values (p_slug, v_name) returning id into v_tenant;
  insert into public.members (tenant_id, user_id, role) values (v_tenant, p_uid, 'partner');
  insert into public.shop_settings (tenant_id, pickup_pincode, support_email) values (v_tenant, p_pickup, v_email);
  -- The trial's terms, frozen now; it begins when the website goes live (the publish trigger).
  select * from public.trial_settings where id = 1 into ts;
  insert into public.shop_trials (tenant_id, days, open_window_days, signed_up_at) values (v_tenant, ts.days, ts.open_window_days, now());
  insert into public.tenant_plans (tenant_id, plan_version_id, starts_at, created_by) values (v_tenant, v_version, now(), p_uid);
  insert into public.partner_links (tenant_id, partner_id, share_bps, share_months, notice_days)
    values (v_tenant, v_partner, p_share_bps, p_share_months, p_notice_days);
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    values (v_tenant, p_uid, v_email, 'member', 'shop.created', p_slug, jsonb_build_object('pickup', p_pickup, 'by', 'partner'));
  return v_tenant;
end $$;
--> statement-breakpoint
create or replace function app_accept_handover_v2(p_uid uuid, p_invite uuid, p_email_hmac text, p_key_version smallint) returns uuid
  language plpgsql volatile security definer set search_path = '' as $$
declare v_email text; v_tenant uuid; s record; e timestamptz;
begin
  select lower(u.email) into v_email from auth.users u where u.id = p_uid and u.email_confirmed_at is not null;
  if v_email is null then raise exception 'email_unconfirmed' using errcode = 'P0001'; end if;
  select i.tenant_id into v_tenant from public.invites i
   where i.id = p_invite and i.email = v_email and i.role = 'owner'
     and i.accepted_at is null and i.revoked_at is null and i.expires_at > now();
  if v_tenant is null then raise exception 'no_invite' using errcode = 'P0001'; end if;
  perform 1 from public.tenants t where t.id = v_tenant for update;
  if exists (select 1 from public.members m where m.tenant_id = v_tenant and m.role = 'owner') then raise exception 'has_owner' using errcode = 'P0001'; end if;
  if exists (select 1 from public.members m where m.tenant_id = v_tenant and m.user_id = p_uid) then raise exception 'already_member' using errcode = 'P0001'; end if;
  update public.invites set accepted_at = now() where id = p_invite;
  insert into public.members (tenant_id, user_id, role) values (v_tenant, p_uid, 'owner');
  -- The trial: one per business (the owner's verified email), else the handover ends it; under 7 days left, the one
  -- extension at once. No claim key (no secret configured): the trial ends — fail closed.
  select * from public.shop_trials where tenant_id = v_tenant into s;
  if s.tenant_id is not null and s.ended_at is null then
    if coalesce(p_email_hmac, '') = '' or exists (select 1 from public.trial_claims tc where tc.kind = 'email' and tc.key_version = p_key_version and tc.key_hmac = p_email_hmac) then
      update public.shop_trials set ended_at = now() where tenant_id = v_tenant;
    else
      insert into public.trial_claims (kind, key_hmac, key_version, tenant_id) values ('email', p_email_hmac, p_key_version, v_tenant) on conflict do nothing;
      e := public.app_trial_ends_at(v_tenant);
      if s.extended_at is null and e - now() < interval '7 days' then update public.shop_trials set extended_at = now() where tenant_id = v_tenant; end if;
    end if;
    perform public.app_trial_recompute(v_tenant);
  end if;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target)
    values (v_tenant, p_uid, v_email, 'member', 'shop.handover_accepted', null);
  return v_tenant;
end $$;
--> statement-breakpoint
create or replace function app_shops_to_bill(p_before timestamptz) returns setof uuid
  language sql stable security definer set search_path = '' as $$
  select distinct tp.tenant_id from public.tenant_plans tp
   where tp.starts_at < p_before
     and exists (select 1 from public.members m where m.tenant_id = tp.tenant_id and m.role = 'owner')
$$;
--> statement-breakpoint
revoke all on function app_accept_handover_v2(uuid, uuid, text, smallint) from public, anon, authenticated, service_role, frata_admin;
--> statement-breakpoint
grant execute on function app_accept_handover_v2(uuid, uuid, text, smallint) to frata_app;
--> statement-breakpoint
-- The 0023 handover neither claims nor ends a trial: nothing calls it now, so no role may (security review, TR1).
revoke all on function app_accept_handover(uuid, uuid) from public, anon, authenticated, service_role, frata_app, frata_admin;
