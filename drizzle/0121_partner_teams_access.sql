-- =============================================================================
-- PARTNER TEAMS T1a — access (plan docs/plans/2026-11-12-studio-build.md § T1a; spec
-- docs/specs/2026-11-12-studio-intake-and-team.md § Partner teams; security and tenancy reviews 2026-11-12). Hand-written.
--
-- partner_members / partner_assignments: Frrata's own tables, like partners. frata_app has NO grant (definers only);
-- frata_admin reads. A partner person's shop access is still a members row with role 'partner', now pointing at its
-- partner_members row (members.partner_member_id); definers below keep the two in step and nothing else writes them.
-- Builders (role 'builder') wait for T1c (ADR-0015): every definer here refuses that role.
-- Every uid comes from getUser(); a tenant id an owner picks is checked against the partner's own active links.
-- =============================================================================
-- Production: apply this whole file in ONE call (one implicit transaction), so no partner shop is made while the
-- backfill and the CHECK run; old code keeps working between apply and push (same signatures, superset columns).
revoke all on partner_members, partner_assignments from public, anon, authenticated, service_role, frata_app;
--> statement-breakpoint
alter table partner_members enable row level security;
--> statement-breakpoint
alter table partner_assignments enable row level security;
--> statement-breakpoint
grant select on partner_members, partner_assignments to frata_admin;
--> statement-breakpoint
create policy admin_read on partner_members for select to frata_admin using (true);
--> statement-breakpoint
create policy admin_read on partner_assignments for select to frata_admin using (true);
--> statement-breakpoint
alter table members add constraint members_partner_member_fk foreign key (partner_member_id) references partner_members(id) on delete restrict;
--> statement-breakpoint

-- ── Backfill: each partner's founder is its owner member; each partner shop row points at it. Then the CHECK. ──
insert into partner_members (partner_id, user_id, email, role, invited_at, accepted_at)
select p.id, p.user_id, lower(p.email), 'owner', p.applied_at, p.applied_at from partners p
 where not exists (select 1 from partner_members pm where pm.partner_id = p.id and pm.role = 'owner');
--> statement-breakpoint
update members m set partner_member_id = pm.id from partner_members pm
 where m.role = 'partner' and m.partner_member_id is null and pm.user_id = m.user_id and pm.removed_at is null;
--> statement-breakpoint
alter table members add constraint members_partner_member check ((role = 'partner') = (partner_member_id is not null));
--> statement-breakpoint

-- ── The caller's live membership: accepted, not removed, the partner approved, not declined, not suspended. ──
create or replace function app_pm_live(p_uid uuid) returns table (member_id uuid, partner_id uuid, role text)
  language sql stable set search_path = '' as $$
  select pm.id, pm.partner_id, pm.role from public.partner_members pm join public.partners pa on pa.id = pm.partner_id
   where pm.user_id = p_uid and pm.removed_at is null and pm.accepted_at is not null
     and pa.approved_at is not null and pa.declined_at is null and pa.suspended_at is null
$$;
--> statement-breakpoint

-- ── Apply: the applicant is the partner's owner member from the start. A person already in another partner's team
--    can't apply (one partner per person). ──
create or replace function app_partner_apply(p_uid uuid, p_name text, p_business text, p_phone text, p_city text,
  p_services text[], p_work_url text, p_brands_now text, p_terms_version integer) returns uuid
  language plpgsql volatile security definer set search_path = '' as $$
declare v_email text; v_id uuid;
begin
  select lower(u.email) into v_email from auth.users u where u.id = p_uid and u.email_confirmed_at is not null;
  if v_email is null then raise exception 'email_unconfirmed' using errcode = 'P0001'; end if;
  if exists (select 1 from public.partner_members pm join public.partners pa on pa.id = pm.partner_id
              where pm.user_id = p_uid and pm.removed_at is null and pa.user_id <> p_uid) then
    raise exception 'in_team' using errcode = 'P0001';
  end if;
  if length(btrim(p_name)) not between 1 and 80 or length(btrim(p_city)) not between 1 and 60
     or length(p_business) > 80 or length(p_work_url) > 200 or p_phone !~ '^91[6-9][0-9]{9}$' then
    raise exception 'bad_input' using errcode = 'P0001';
  end if;
  insert into public.partners as p (user_id, email, name, business_name, phone, city, services, work_url, brands_now, terms_version, agreed_at)
    values (p_uid, v_email, btrim(p_name), btrim(p_business), p_phone, btrim(p_city), coalesce(p_services, '{}'), btrim(p_work_url), p_brands_now, p_terms_version, now())
  on conflict (user_id) do update set name = excluded.name, business_name = excluded.business_name, phone = excluded.phone,
    city = excluded.city, services = excluded.services, work_url = excluded.work_url, brands_now = excluded.brands_now,
    terms_version = excluded.terms_version, agreed_at = excluded.agreed_at
    where p.approved_at is null and p.declined_at is null
  returning p.id into v_id;
  if v_id is null then raise exception 'decided' using errcode = 'P0001'; end if;
  insert into public.partner_members (partner_id, user_id, email, role, accepted_at)
    select v_id, p_uid, v_email, 'owner', now()
     where not exists (select 1 from public.partner_members pm where pm.partner_id = v_id and pm.role = 'owner' and pm.removed_at is null);
  return v_id;
end $$;
--> statement-breakpoint

-- ── The caller's partner, through their own membership (owner or lead). member_role and suspended_at are new. ──
drop function if exists app_my_partner(uuid);
--> statement-breakpoint
create function app_my_partner(p_uid uuid) returns table (
  id uuid, email text, name text, business_name text, phone text, city text, services text[], work_url text,
  brands_now text, applied_at timestamptz, approved_at timestamptz, declined_at timestamptz, decline_reason text,
  member_id uuid, member_role text, suspended_at timestamptz)
  language sql stable security definer set search_path = '' as $$
  select p.id, p.email, p.name, p.business_name, p.phone, p.city, p.services, p.work_url, p.brands_now,
         p.applied_at, p.approved_at, p.declined_at, p.decline_reason, pm.id, pm.role, p.suspended_at
    from public.partner_members pm join public.partners p on p.id = pm.partner_id
   where pm.user_id = p_uid and pm.removed_at is null and pm.accepted_at is not null and pm.role in ('owner', 'lead')
$$;
--> statement-breakpoint

-- ── Clients: the owner sees every store of the partner (removed ones too); a lead only the live ones assigned. ──
create or replace function app_partner_clients(p_uid uuid) returns table (
  tenant_id uuid, name text, slug text, linked_at timestamptz, share_starts_at timestamptz, removed_at timestamptz,
  share_months integer, notice_days integer, owner_email text, invite_email text, invite_expires_at timestamptz, plan_name text)
  language sql stable security definer set search_path = '' as $$
  select l.tenant_id, t.name,
    case when l.removed_at is null then t.slug end,
    l.created_at, l.share_starts_at, l.removed_at, l.share_months, l.notice_days,
    case when l.removed_at is null then (select u.email::text from public.members m join auth.users u on u.id = m.user_id
                                          where m.tenant_id = l.tenant_id and m.role = 'owner' order by m.created_at limit 1) end,
    case when l.removed_at is null then i.email end,
    case when l.removed_at is null then i.expires_at end,
    case when l.removed_at is null then (select p.name from public.tenant_plans tp
                                           join public.plan_versions pv on pv.id = tp.plan_version_id
                                           join public.plans p on p.id = pv.plan_id
                                          where tp.tenant_id = l.tenant_id and tp.starts_at <= now()
                                          order by tp.starts_at desc limit 1) end
  from public.app_pm_live(p_uid) me
  join public.partner_links l on l.partner_id = me.partner_id
  join public.tenants t on t.id = l.tenant_id
  left join lateral (select i.email, i.expires_at from public.invites i
                      where i.tenant_id = l.tenant_id and i.role = 'owner' and i.accepted_at is null
                        and i.revoked_at is null and i.expires_at > now()
                      order by i.created_at desc limit 1) i on true
  where me.role = 'owner'
     or (me.role = 'lead' and l.removed_at is null
         and exists (select 1 from public.partner_assignments a where a.partner_member_id = me.member_id and a.tenant_id = l.tenant_id))
  order by l.removed_at nulls first, t.name
$$;
--> statement-breakpoint

-- ── A client store: the owner or a lead makes it. The partner's owner always works on it; a lead making it is
--    assigned to it. The cap counts the partner's unopened stores under the PARTNER's lock (two leads can't race). ──
create or replace function app_partner_create_shop(p_uid uuid, p_name text, p_slug text, p_pickup text,
  p_share_bps integer, p_share_months integer, p_notice_days integer, p_max_unopened integer) returns uuid
  language plpgsql volatile security definer set search_path = '' as $$
declare me record; v_email text; v_owner record; v_tenant uuid; v_version uuid; v_name text := btrim(p_name); ts record;
begin
  select x.* into me from public.app_pm_live(p_uid) x where x.role in ('owner', 'lead');
  if me.member_id is null then raise exception 'not_partner' using errcode = 'P0001'; end if;
  select p.email into v_email from public.partners p where p.id = me.partner_id;
  perform pg_advisory_xact_lock(hashtext('create_shop:' || me.partner_id::text));
  -- Shops not yet handed over count, live or not (R1).
  if (select count(*) from public.partner_links l
       where l.partner_id = me.partner_id and l.removed_at is null
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
  insert into public.shop_settings (tenant_id, pickup_pincode, support_email) values (v_tenant, p_pickup, v_email);
  -- The trial's terms, frozen now; it begins now, as the partner starts work (owner, 2026-11-08).
  select * from public.trial_settings where id = 1 into ts;
  insert into public.shop_trials (tenant_id, days, open_window_days, signed_up_at, started_at) values (v_tenant, ts.days, ts.open_window_days, now(), now());
  insert into public.tenant_plans (tenant_id, plan_version_id, starts_at, created_by) values (v_tenant, v_version, now(), p_uid);
  insert into public.partner_links (tenant_id, partner_id, share_bps, share_months, notice_days)
    values (v_tenant, me.partner_id, p_share_bps, p_share_months, p_notice_days);
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    select v_tenant, p_uid, u.email, 'member', 'shop.created', p_slug, jsonb_build_object('pickup', p_pickup, 'by', 'partner')
      from auth.users u where u.id = p_uid;
  return v_tenant;
end $$;
--> statement-breakpoint

-- ── Hand a store over: only the partner's OWNER until partner passkeys (T1b) ask again (security review 2026-11-12). ──
create or replace function app_handover_invite(p_tenant uuid, p_uid uuid, p_email text) returns uuid
  language plpgsql volatile security definer set search_path = '' as $$
declare v_email text := lower(btrim(p_email)); v_id uuid;
begin
  perform 1 from public.tenants t where t.id = p_tenant for update;
  if not exists (select 1 from public.app_pm_live(p_uid) me
                   join public.partner_links l on l.partner_id = me.partner_id and l.tenant_id = p_tenant and l.removed_at is null
                   join public.members m on m.tenant_id = p_tenant and m.user_id = p_uid and m.role = 'partner' and m.partner_member_id = me.member_id
                  where me.role = 'owner') then
    raise exception 'not_partner' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.members m where m.tenant_id = p_tenant and m.role = 'owner') then
    raise exception 'has_owner' using errcode = 'P0001';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 200 then raise exception 'bad_email' using errcode = 'P0001'; end if;
  if exists (select 1 from public.members m join auth.users u on u.id = m.user_id
              where m.tenant_id = p_tenant and lower(u.email) = v_email) then
    raise exception 'member_email' using errcode = 'P0001';
  end if;
  update public.invites set revoked_at = now()
   where tenant_id = p_tenant and role = 'owner' and accepted_at is null and revoked_at is null;
  insert into public.invites (tenant_id, email, role, created_by) values (p_tenant, v_email, 'owner', p_uid) returning id into v_id;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target)
    select p_tenant, p_uid, u.email, 'member', 'shop.handover_invited', null from auth.users u where u.id = p_uid;
  return v_id;
end $$;
--> statement-breakpoint

-- ── Handovers waiting for this person: never one from a partner they belong to. ──
create or replace function app_my_handovers(p_uid uuid) returns table (
  invite_id uuid, tenant_id uuid, tenant_name text, partner_name text, expires_at timestamptz)
  language sql stable security definer set search_path = '' as $$
  select i.id, t.id, t.name, coalesce(nullif(pa.business_name, ''), pa.name), i.expires_at
    from auth.users u
    join public.invites i on i.email = lower(u.email) and i.role = 'owner'
     and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
    join public.tenants t on t.id = i.tenant_id
    join public.partner_links l on l.tenant_id = t.id and l.removed_at is null
    join public.partners pa on pa.id = l.partner_id
   where u.id = p_uid and u.email_confirmed_at is not null
     and not exists (select 1 from public.partner_members pm where pm.partner_id = pa.id and pm.user_id = p_uid and pm.removed_at is null)
     and not exists (select 1 from public.members m where m.tenant_id = t.id and m.role = 'owner')
   order by i.created_at
$$;
--> statement-breakpoint

-- ── Accept a handover: as 0066, and never by a person in the linked partner's team. ──
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
  if exists (select 1 from public.partner_links l join public.partner_members pm on pm.partner_id = l.partner_id
              where l.tenant_id = v_tenant and l.removed_at is null and pm.user_id = p_uid and pm.removed_at is null) then
    raise exception 'partner_member' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.members m where m.tenant_id = v_tenant and m.role = 'owner') then raise exception 'has_owner' using errcode = 'P0001'; end if;
  if exists (select 1 from public.members m where m.tenant_id = v_tenant and m.user_id = p_uid) then raise exception 'already_member' using errcode = 'P0001'; end if;
  update public.invites set accepted_at = now() where id = p_invite;
  insert into public.members (tenant_id, user_id, role) values (v_tenant, p_uid, 'owner');
  select * from public.shop_trials where tenant_id = v_tenant into s;
  if s.tenant_id is not null and s.ended_at is null then
    if coalesce(p_email_hmac, '') <> '' then perform pg_advisory_xact_lock(hashtext('trial_claim:email:' || p_email_hmac)); end if;
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

-- ── A shop's people: partner people are labelled with their partner and their partner role. ──
drop function if exists app_shop_people();
--> statement-breakpoint
create function app_shop_people() returns table (user_id uuid, email text, role text, since timestamptz, partner_name text, partner_role text)
  language sql stable security definer set search_path = '' as $$
  select m.user_id, u.email::text, m.role, m.created_at,
    case when m.role = 'partner' then (select coalesce(nullif(pa.business_name, ''), pa.name) from public.partner_members pm
                                         join public.partners pa on pa.id = pm.partner_id where pm.id = m.partner_member_id) end,
    case when m.role = 'partner' then (select pm.role from public.partner_members pm where pm.id = m.partner_member_id) end
    from public.members m left join auth.users u on u.id = m.user_id
   where m.tenant_id = public.app_current_tenant()
   order by array_position(array['owner','admin','partner','staff','accountant'], m.role), m.created_at
$$;
--> statement-breakpoint

-- ── The brand's owner removes the partner: every partner person's access to this shop ends, with their invites. ──
create or replace function app_remove_partner(p_tenant uuid, p_uid uuid) returns void
  language plpgsql volatile security definer set search_path = '' as $$
declare v_partner uuid; v_email text;
begin
  if not exists (select 1 from public.members m where m.tenant_id = p_tenant and m.user_id = p_uid and m.role = 'owner') then
    raise exception 'not_owner' using errcode = 'P0001';
  end if;
  update public.partner_links l set removed_at = now(), removed_by = p_uid
   where l.tenant_id = p_tenant and l.removed_at is null
  returning l.partner_id into v_partner;
  if v_partner is null then raise exception 'no_partner' using errcode = 'P0001'; end if;
  update public.invites set revoked_at = now()
   where tenant_id = p_tenant and accepted_at is null and revoked_at is null
     and created_by in (select pm.user_id from public.partner_members pm where pm.partner_id = v_partner and pm.user_id is not null);
  delete from public.members m where m.tenant_id = p_tenant
     and m.partner_member_id in (select pm.id from public.partner_members pm where pm.partner_id = v_partner);
  delete from public.partner_assignments a where a.tenant_id = p_tenant
     and a.partner_member_id in (select pm.id from public.partner_members pm where pm.partner_id = v_partner);
  select u.email into v_email from auth.users u where u.id = p_uid;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target)
    values (p_tenant, p_uid, v_email, 'member', 'shop.partner_removed', null);
end $$;
--> statement-breakpoint

-- ── Access: a partner person's shop row counts only while their membership is live and the link active. ──
create or replace function app_access_for(p_user uuid, p_session uuid default null, p_stepup text default null) returns jsonb
  language sql stable security definer set search_path = '' as $$
  with conf as (select public.app_staff_live_stepup(p_user, p_session, p_stepup) as at)
  select jsonb_build_object(
    'staffRole', (select ps.role from public.platform_staff ps where ps.user_id = p_user),
    'staffConfirmedAt', (select at from conf),
    'memberships', coalesce((
      select jsonb_agg(d.x order by d.name)
      from (
        select distinct on (u.tenant_id) u.tenant_id, u.tenant_name as name,
          jsonb_build_object('tenantId', u.tenant_id, 'tenantName', u.tenant_name,
                             'role', u.role, 'supportSessionId', u.support_session_id) as x
        from (
          select s.tenant_id, t.name as tenant_name, 'owner'::text as role, s.id as support_session_id, 0 as pref
            from public.support_sessions s
            join public.tenants t on t.id = s.tenant_id
            join public.platform_staff ps on ps.user_id = s.staff_user_id
           where s.staff_user_id = p_user and s.ended_at is null and s.expires_at > now()
             and (select at from conf) is not null
          union all
          select m.tenant_id, t.name, m.role, null::uuid, 1
            from public.members m join public.tenants t on t.id = m.tenant_id
           where m.user_id = p_user
             and (m.partner_member_id is null or exists (
                   select 1 from public.app_pm_live(p_user) me
                     join public.partner_links l on l.partner_id = me.partner_id and l.tenant_id = m.tenant_id and l.removed_at is null
                    where me.member_id = m.partner_member_id))
        ) u
        order by u.tenant_id, u.pref
      ) d), '[]'::jsonb))
$$;
--> statement-breakpoint

-- ════════ The team (owner only) ════════
-- The partner's people with the stores each works on. Removed people are not listed.
create or replace function app_partner_team(p_uid uuid) returns table (
  member_id uuid, email text, role text, invited_at timestamptz, invite_expires_at timestamptz, accepted_at timestamptz,
  is_you boolean, stores jsonb)
  language plpgsql stable security definer set search_path = '' as $$
declare me record;
begin
  select x.* into me from public.app_pm_live(p_uid) x where x.role = 'owner';
  if me.member_id is null then raise exception 'not_owner' using errcode = 'P0001'; end if;
  return query
  select pm.id, pm.email, pm.role, pm.invited_at, pm.invite_expires_at, pm.accepted_at, pm.user_id = p_uid,
    coalesce((select jsonb_agg(jsonb_build_object('tenantId', t.id, 'name', t.name) order by t.name)
                from public.partner_assignments a join public.tenants t on t.id = a.tenant_id
                join public.partner_links l on l.tenant_id = a.tenant_id and l.partner_id = me.partner_id and l.removed_at is null
               where a.partner_member_id = pm.id), '[]'::jsonb)
    from public.partner_members pm
   where pm.partner_id = me.partner_id and pm.removed_at is null
   order by array_position(array['owner','lead','builder'], pm.role), pm.accepted_at is null, pm.invited_at;
end $$;
--> statement-breakpoint

-- Invite a lead by email, to some of the partner's stores. 7 days; at most 50 people (active or invited).
create or replace function app_partner_invite(p_uid uuid, p_email text, p_role text, p_tenants uuid[]) returns uuid
  language plpgsql volatile security definer set search_path = '' as $$
declare me record; v_email text := lower(btrim(p_email)); v_id uuid; v_t uuid;
begin
  select x.* into me from public.app_pm_live(p_uid) x where x.role = 'owner';
  if me.member_id is null then raise exception 'not_owner' using errcode = 'P0001'; end if;
  if p_role is distinct from 'lead' then raise exception 'bad_role' using errcode = 'P0001'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 200 then raise exception 'bad_email' using errcode = 'P0001'; end if;
  if coalesce(array_length(p_tenants, 1), 0) > 200 then raise exception 'bad_store' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext('partner_team:' || me.partner_id::text));
  if (select count(*) from public.partner_members pm where pm.partner_id = me.partner_id and pm.removed_at is null
        and (pm.accepted_at is not null or pm.invite_expires_at > now())) >= 50 then
    raise exception 'too_many' using errcode = 'P0001';
  end if;
  -- An expired invite to the same email gives way to the new one.
  update public.partner_members set removed_at = now(), removed_by = p_uid
   where partner_id = me.partner_id and email = v_email and removed_at is null and accepted_at is null and invite_expires_at <= now();
  if exists (select 1 from public.partner_members pm where pm.partner_id = me.partner_id and pm.email = v_email and pm.removed_at is null) then
    raise exception 'already_invited' using errcode = 'P0001';
  end if;
  foreach v_t in array coalesce(p_tenants, '{}') loop
    if not exists (select 1 from public.partner_links l where l.tenant_id = v_t and l.partner_id = me.partner_id and l.removed_at is null) then
      raise exception 'bad_store' using errcode = 'P0001';
    end if;
  end loop;
  insert into public.partner_members (partner_id, email, role, invited_by, invite_expires_at)
    values (me.partner_id, v_email, 'lead', p_uid, now() + interval '7 days') returning id into v_id;
  insert into public.partner_assignments (partner_member_id, tenant_id) select v_id, x from unnest(coalesce(p_tenants, '{}')) x on conflict do nothing;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target)
    select null, p_uid, u.email, 'member', 'partner.person_invited', v_id::text from auth.users u where u.id = p_uid;
  return v_id;
end $$;
--> statement-breakpoint

-- Invites waiting for this person: their confirmed email, not expired, a live partner.
create or replace function app_partner_my_invites(p_uid uuid) returns table (
  member_id uuid, partner_name text, invited_by text, role text, expires_at timestamptz, stores jsonb)
  language sql stable security definer set search_path = '' as $$
  select pm.id, coalesce(nullif(pa.business_name, ''), pa.name), (select u2.email::text from auth.users u2 where u2.id = pm.invited_by),
    pm.role, pm.invite_expires_at,
    coalesce((select jsonb_agg(t.name order by t.name) from public.partner_assignments a join public.tenants t on t.id = a.tenant_id
                join public.partner_links l on l.tenant_id = a.tenant_id and l.partner_id = pa.id and l.removed_at is null
               where a.partner_member_id = pm.id), '[]'::jsonb)
    from auth.users u
    join public.partner_members pm on pm.email = lower(u.email) and pm.accepted_at is null and pm.removed_at is null and pm.invite_expires_at > now()
    join public.partners pa on pa.id = pm.partner_id and pa.approved_at is not null and pa.declined_at is null and pa.suspended_at is null
   where u.id = p_uid and u.email_confirmed_at is not null
   order by pm.invited_at
$$;
--> statement-breakpoint

-- Accept: bound to the invited, confirmed email; one partner per person; never someone with their own application.
-- A store where the person already works (the brand's own people) is skipped and named, never doubled.
create or replace function app_partner_accept(p_uid uuid, p_member uuid) returns jsonb
  language plpgsql volatile security definer set search_path = '' as $$
declare v_email text; r record; a record; v_skipped text[] := '{}';
begin
  select lower(u.email) into v_email from auth.users u where u.id = p_uid and u.email_confirmed_at is not null;
  if v_email is null then raise exception 'email_unconfirmed' using errcode = 'P0001'; end if;
  select pm.* into r from public.partner_members pm join public.partners pa on pa.id = pm.partner_id
   where pm.id = p_member and pm.email = v_email and pm.accepted_at is null and pm.removed_at is null and pm.invite_expires_at > now()
     and pa.approved_at is not null and pa.declined_at is null and pa.suspended_at is null
   for update of pm;
  if r.id is null then raise exception 'no_invite' using errcode = 'P0001'; end if;
  if r.role <> 'lead' then raise exception 'bad_role' using errcode = 'P0001'; end if;
  if exists (select 1 from public.partner_members pm where pm.user_id = p_uid and pm.removed_at is null) then
    raise exception 'in_team' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.partners p where p.user_id = p_uid and p.declined_at is null) then
    raise exception 'own_partner' using errcode = 'P0001';
  end if;
  update public.partner_members set user_id = p_uid, accepted_at = now() where id = p_member;
  for a in select x.tenant_id, t.name from public.partner_assignments x join public.tenants t on t.id = x.tenant_id
            join public.partner_links l on l.tenant_id = x.tenant_id and l.partner_id = r.partner_id and l.removed_at is null
           where x.partner_member_id = p_member loop
    if exists (select 1 from public.members m where m.tenant_id = a.tenant_id and m.user_id = p_uid) then
      delete from public.partner_assignments where partner_member_id = p_member and tenant_id = a.tenant_id;
      v_skipped := v_skipped || a.name;
    else
      insert into public.members (tenant_id, user_id, role, partner_member_id) values (a.tenant_id, p_uid, 'partner', p_member);
      insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target)
        values (a.tenant_id, p_uid, v_email, 'member', 'shop.partner_person_added', null);
    end if;
  end loop;
  return jsonb_build_object('partnerId', r.partner_id, 'skipped', to_jsonb(v_skipped));
end $$;
--> statement-breakpoint

-- Give a lead a store, or take it away. Everything is derived: the caller is the owner, the store one of the
-- partner's active links, the person in the same partner.
create or replace function app_partner_assign(p_uid uuid, p_member uuid, p_tenant uuid, p_on boolean) returns void
  language plpgsql volatile security definer set search_path = '' as $$
declare me record; r record; v_email text;
begin
  select x.* into me from public.app_pm_live(p_uid) x where x.role = 'owner';
  if me.member_id is null then raise exception 'not_owner' using errcode = 'P0001'; end if;
  select * into r from public.partner_members pm where pm.id = p_member and pm.partner_id = me.partner_id and pm.removed_at is null for update;
  if r.id is null or r.role <> 'lead' then raise exception 'no_person' using errcode = 'P0001'; end if;
  perform 1 from public.tenants t where t.id = p_tenant for update;
  if not exists (select 1 from public.partner_links l where l.tenant_id = p_tenant and l.partner_id = me.partner_id and l.removed_at is null) then
    raise exception 'bad_store' using errcode = 'P0001';
  end if;
  select u.email into v_email from auth.users u where u.id = p_uid;
  if p_on then
    if r.user_id is not null and exists (select 1 from public.members m where m.tenant_id = p_tenant and m.user_id = r.user_id
                                           and m.partner_member_id is distinct from r.id) then
      raise exception 'already_member' using errcode = 'P0001';
    end if;
    insert into public.partner_assignments (partner_member_id, tenant_id) values (r.id, p_tenant) on conflict do nothing;
    if r.user_id is not null then
      insert into public.members (tenant_id, user_id, role, partner_member_id) values (p_tenant, r.user_id, 'partner', r.id) on conflict do nothing;
      insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target)
        values (p_tenant, p_uid, v_email, 'member', 'shop.partner_person_added', null);
    end if;
  else
    delete from public.partner_assignments where partner_member_id = r.id and tenant_id = p_tenant;
    if r.user_id is not null then
      delete from public.members m where m.tenant_id = p_tenant and m.partner_member_id = r.id;
      update public.invites set revoked_at = now() where tenant_id = p_tenant and created_by = r.user_id and accepted_at is null and revoked_at is null;
      insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target)
        values (p_tenant, p_uid, v_email, 'member', 'shop.partner_person_removed', null);
    end if;
  end if;
end $$;
--> statement-breakpoint

-- Remove a person (or withdraw an invite): never the owner. Their stores, memberships and the invites they made end.
create or replace function app_partner_remove_member(p_uid uuid, p_member uuid) returns void
  language plpgsql volatile security definer set search_path = '' as $$
declare me record; r record; v_email text;
begin
  select x.* into me from public.app_pm_live(p_uid) x where x.role = 'owner';
  if me.member_id is null then raise exception 'not_owner' using errcode = 'P0001'; end if;
  select * into r from public.partner_members pm where pm.id = p_member and pm.partner_id = me.partner_id and pm.removed_at is null for update;
  if r.id is null then raise exception 'no_person' using errcode = 'P0001'; end if;
  if r.role = 'owner' then raise exception 'is_owner' using errcode = 'P0001'; end if;
  select u.email into v_email from auth.users u where u.id = p_uid;
  if r.user_id is not null then
    insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target)
      select m.tenant_id, p_uid, v_email, 'member', 'shop.partner_person_removed', null from public.members m where m.partner_member_id = r.id;
    update public.invites set revoked_at = now()
     where created_by = r.user_id and accepted_at is null and revoked_at is null
       and tenant_id in (select l.tenant_id from public.partner_links l where l.partner_id = me.partner_id);
    delete from public.members m where m.partner_member_id = r.id;
  end if;
  delete from public.partner_assignments where partner_member_id = r.id;
  update public.partner_members set removed_at = now(), removed_by = p_uid where id = r.id;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target)
    values (null, p_uid, v_email, 'member', 'partner.person_removed', r.id::text);
end $$;
--> statement-breakpoint

-- ════════ Admin: suspend and reinstate a partner (ADMIN_ONLY with a fresh passkey, checked by the caller) ════════
-- Suspend: every partner person's shop rows go (other definers read members directly); assignments stay as the record
-- to rebuild from; each linked shop gets an audit row and a required notice.
create or replace function admin_end_partner(p_staff uuid, p_partner uuid, p_reason text) returns integer
  language plpgsql volatile security definer set search_path = '' as $$
declare v_email text; v_name text; v_reason text := btrim(coalesce(p_reason, '')); n integer := 0; l record;
begin
  select ps.email into v_email from public.platform_staff ps where ps.user_id = p_staff and ps.role = 'admin';
  if v_email is null then raise exception 'not_admin' using errcode = 'P0001'; end if;
  if length(v_reason) not between 1 and 300 then raise exception 'bad_reason' using errcode = 'P0001'; end if;
  update public.partners set suspended_at = now(), suspended_by = p_staff, suspend_reason = v_reason
   where id = p_partner and suspended_at is null and approved_at is not null
  returning coalesce(nullif(business_name, ''), name) into v_name;
  if v_name is null then raise exception 'not_active' using errcode = 'P0001'; end if;
  delete from public.members m where m.partner_member_id in (select pm.id from public.partner_members pm where pm.partner_id = p_partner);
  for l in select tenant_id from public.partner_links where partner_id = p_partner and removed_at is null loop
    n := n + 1;
    insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
      values (l.tenant_id, p_staff, v_email, 'staff', 'shop.partner_suspended', null, jsonb_build_object('partner', v_name));
    perform public.notice_write(l.tenant_id, 'frrata_action', 'admin', null,
      'Frrata paused your partner, ' || v_name,
      'They can’t open your shop until Frrata reinstates them. Your shop and website keep running.',
      '/console/settings/people', true, true, null, p_staff);
  end loop;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    values (null, p_staff, v_email, 'staff', 'partner.suspended', p_partner::text, jsonb_build_object('reason', v_reason, 'shops', n));
  return n;
end $$;
--> statement-breakpoint

-- Reinstate: the owner works on every active link again, leads on their assignments.
create or replace function admin_reinstate_partner(p_staff uuid, p_partner uuid) returns integer
  language plpgsql volatile security definer set search_path = '' as $$
declare v_email text; v_owner record; n integer;
begin
  select ps.email into v_email from public.platform_staff ps where ps.user_id = p_staff and ps.role = 'admin';
  if v_email is null then raise exception 'not_admin' using errcode = 'P0001'; end if;
  update public.partners set suspended_at = null, suspended_by = null, suspend_reason = null where id = p_partner and suspended_at is not null;
  if not found then raise exception 'not_suspended' using errcode = 'P0001'; end if;
  select pm.id, pm.user_id into v_owner from public.partner_members pm
   where pm.partner_id = p_partner and pm.role = 'owner' and pm.removed_at is null and pm.accepted_at is not null limit 1;
  if v_owner.id is not null then
    insert into public.members (tenant_id, user_id, role, partner_member_id)
      select l.tenant_id, v_owner.user_id, 'partner', v_owner.id from public.partner_links l
       where l.partner_id = p_partner and l.removed_at is null on conflict do nothing;
  end if;
  insert into public.members (tenant_id, user_id, role, partner_member_id)
    select a.tenant_id, pm.user_id, 'partner', pm.id from public.partner_assignments a
      join public.partner_members pm on pm.id = a.partner_member_id and pm.partner_id = p_partner and pm.removed_at is null and pm.accepted_at is not null
      join public.partner_links l on l.tenant_id = a.tenant_id and l.partner_id = p_partner and l.removed_at is null
    on conflict do nothing;
  get diagnostics n = row_count;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target)
    values (null, p_staff, v_email, 'staff', 'partner.reinstated', p_partner::text);
  return n;
end $$;
--> statement-breakpoint

revoke all on function app_pm_live(uuid), app_partner_apply(uuid, text, text, text, text, text[], text, text, integer), app_my_partner(uuid),
  app_partner_clients(uuid), app_partner_create_shop(uuid, text, text, text, integer, integer, integer, integer),
  app_handover_invite(uuid, uuid, text), app_my_handovers(uuid), app_accept_handover_v2(uuid, uuid, text, smallint), app_shop_people(),
  app_remove_partner(uuid, uuid), app_access_for(uuid, uuid, text), app_partner_team(uuid), app_partner_invite(uuid, text, text, uuid[]),
  app_partner_my_invites(uuid), app_partner_accept(uuid, uuid), app_partner_assign(uuid, uuid, uuid, boolean),
  app_partner_remove_member(uuid, uuid), admin_end_partner(uuid, uuid, text), admin_reinstate_partner(uuid, uuid)
  from public, anon, authenticated, service_role, frata_app, frata_admin;
--> statement-breakpoint
grant execute on function app_partner_apply(uuid, text, text, text, text, text[], text, text, integer), app_my_partner(uuid),
  app_partner_clients(uuid), app_partner_create_shop(uuid, text, text, text, integer, integer, integer, integer),
  app_handover_invite(uuid, uuid, text), app_my_handovers(uuid), app_accept_handover_v2(uuid, uuid, text, smallint), app_shop_people(),
  app_remove_partner(uuid, uuid), app_access_for(uuid, uuid, text), app_partner_team(uuid), app_partner_invite(uuid, text, text, uuid[]),
  app_partner_my_invites(uuid), app_partner_accept(uuid, uuid), app_partner_assign(uuid, uuid, uuid, boolean),
  app_partner_remove_member(uuid, uuid) to frata_app;
--> statement-breakpoint
grant execute on function admin_end_partner(uuid, uuid, text), admin_reinstate_partner(uuid, uuid) to frata_admin;
