-- =============================================================================
-- 0174 — Settings › People: the owner and a Manager add people by role, and the owner adds a partner by email
-- (docs/specs/2026-11-23-add-partner.md; owner 2026-11-23: "redrawn approved"). Every write is a definer that takes the
-- store from app_current_tenant() and the caller from their own members row; frata_app only reads partner_requests.
-- Reviews folded in: security-reviewer and tenancy-auditor 2026-11-23 (both passes).
-- =============================================================================

-- ── partner_requests: frata_app reads its own store's rows; nothing writes but the definers below. partner_id stays
--    null until a partner answers, so no console read can tell whether an email is a partner's. ──
revoke all on partner_requests from public, anon, authenticated, service_role, frata_builder;
--> statement-breakpoint
alter table partner_requests enable row level security;
--> statement-breakpoint
grant select on partner_requests to frata_app;
--> statement-breakpoint
create policy tenant_rows on partner_requests for select to frata_app using (tenant_id = app_current_tenant());
--> statement-breakpoint
grant select on partner_requests to frata_admin;
--> statement-breakpoint
create policy admin_read on partner_requests for select to frata_admin using (true);
--> statement-breakpoint

-- ── The people limit per plan (owner: "keep modest limit per plan"; numbers recommended in the approved mockup). ──
update plan_versions v set people_limit = case p.code when 'launch' then 3 when 'growth' then 10 when 'scale' then 25 else 3 end
  from plans p where p.id = v.plan_id;
--> statement-breakpoint

-- The store's limit now: its current plan version's, failing closed to the smallest (3) when none is found.
create or replace function app_people_limit(p_tenant uuid) returns integer
  language sql stable security definer set search_path = '' as $$
  select coalesce((select pv.people_limit from public.tenant_plans tp join public.plan_versions pv on pv.id = tp.plan_version_id
                    where tp.tenant_id = p_tenant and tp.starts_at <= now() order by tp.starts_at desc limit 1), 3)
$$;
--> statement-breakpoint
-- People who count: live Managers, Staff and Accountants (never the owner, never a partner's people).
create or replace function app_people_members(p_tenant uuid) returns integer
  language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.members m
   where m.tenant_id = p_tenant and m.role in ('admin', 'staff', 'accountant') and m.partner_member_id is null
$$;
--> statement-breakpoint
-- Open invitations that count (unexpired, not accepted, not revoked).
create or replace function app_people_open_invites(p_tenant uuid) returns integer
  language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.invites i
   where i.tenant_id = p_tenant and i.role in ('admin', 'staff', 'accountant')
     and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
$$;
--> statement-breakpoint

-- The caller's own role on the current store, or null. A Frrata staffer on a live support visit of this store gets
-- null (security L2): a visit adds, cancels and removes nothing, whatever members row the staffer also has.
create or replace function app_people_caller(p_uid uuid) returns text
  language sql stable security definer set search_path = '' as $$
  select m.role from public.members m
   where m.tenant_id = public.app_current_tenant() and m.user_id = p_uid and m.role in ('owner', 'admin')
     and m.partner_member_id is null
     and not exists (select 1 from public.support_sessions s where s.tenant_id = m.tenant_id and s.staff_user_id = p_uid
                       and s.ended_at is null and s.expires_at > now())
$$;
--> statement-breakpoint
-- ROLES_GIVEN_BY (src/domains/tenancy/people.ts), mirrored here and pinned by a test: owner gives Manager, Staff and
-- Accountant; a Manager gives Staff and Accountant. Nobody gives 'owner' or 'partner' through an invite.
create or replace function app_people_may_give(p_caller text, p_role text) returns boolean
  language sql immutable set search_path = '' as $$
  select case p_caller when 'owner' then p_role in ('admin', 'staff', 'accountant')
                       when 'admin' then p_role in ('staff', 'accountant') else false end
$$;
--> statement-breakpoint

-- An address email (staff_notices pipe: platform rows, no store can read them). Per recipient across all stores at
-- most 3 a day, and none if the same kind went to it in the last 10 minutes (security H1).
create or replace function app_people_mail(p_kind text, p_to text, p_about text, p_by uuid, p_detail text) returns void
  language plpgsql volatile security definer set search_path = '' as $$
begin
  if (select count(*) from public.staff_notices n where n.to_email = p_to and n.kind in ('store_invite', 'store_partner_invite')
       and n.created_at > now() - interval '1 day') >= 3 then return; end if;
  if exists (select 1 from public.staff_notices n where n.to_email = p_to and n.kind = p_kind and n.created_at > now() - interval '10 minutes') then return; end if;
  insert into public.staff_notices (to_email, kind, about, by_email, detail)
    values (p_to, p_kind, left(p_about, 60), (select lower(u.email) from auth.users u where u.id = p_by), p_detail);
end $$;
--> statement-breakpoint

-- ── Add a person: Manager, Staff or Accountant, by email. Replaces app_invite_accountant (kept for old code). ──
create or replace function app_invite_person(p_uid uuid, p_email text, p_role text) returns uuid
  language plpgsql volatile security definer set search_path = '' as $$
declare v_t uuid := public.app_current_tenant(); v_caller text; v_email text := lower(btrim(coalesce(p_email, ''))); v_id uuid; v_name text;
begin
  v_caller := public.app_people_caller(p_uid);
  if v_t is null or v_caller is null then raise exception 'not_manager' using errcode = 'P0001'; end if;
  if not public.app_people_may_give(v_caller, p_role) then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(v_email) > 254 then raise exception 'bad_email' using errcode = 'P0001'; end if;
  select t.name into v_name from public.tenants t where t.id = v_t for update; -- serialises the limit and the one-open-invite rule
  if exists (select 1 from auth.users u where u.id = p_uid and lower(u.email) = v_email) then raise exception 'own_email' using errcode = 'P0001'; end if;
  if exists (select 1 from public.members m join auth.users u on u.id = m.user_id where m.tenant_id = v_t and lower(u.email) = v_email) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;
  -- A person of the store's live partner comes in through the partner, never as the store's own (tenancy M).
  if exists (select 1 from public.partner_links l join public.partner_members pm on pm.partner_id = l.partner_id and pm.removed_at is null
              left join auth.users u on u.id = pm.user_id
              where l.tenant_id = v_t and l.removed_at is null and (lower(pm.email) = v_email or lower(u.email) = v_email)) then
    raise exception 'partner_person' using errcode = 'P0001';
  end if;
  -- An open invitation the caller could not give (an owner hand-over, a Manager invite from a Manager) is never replaced.
  if exists (select 1 from public.invites i where i.tenant_id = v_t and i.email = v_email and i.accepted_at is null and i.revoked_at is null
              and i.expires_at > now() and not public.app_people_may_give(v_caller, i.role)) then
    raise exception 'invited' using errcode = 'P0001';
  end if;
  update public.invites set revoked_at = now()
   where tenant_id = v_t and email = v_email and accepted_at is null and revoked_at is null and role in ('admin', 'staff', 'accountant');
  if public.app_people_members(v_t) + public.app_people_open_invites(v_t) >= public.app_people_limit(v_t) then
    raise exception 'at_limit' using errcode = 'P0001';
  end if;
  insert into public.invites (tenant_id, email, role, created_by, expires_at) values (v_t, v_email, p_role, p_uid, now() + interval '14 days')
    returning id into v_id;
  perform public.app_people_mail('store_invite', v_email, v_name, p_uid, p_role);
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    values (v_t, p_uid, (select u.email from auth.users u where u.id = p_uid), 'member', 'shop.person_invited', v_email, jsonb_build_object('role', p_role));
  -- A Manager's invitation tells the owner (security M5).
  if v_caller = 'admin' then
    perform public.notice_write(v_t, 'security', 'partner_request', null, 'A Manager invited someone to your store',
      left(v_email, 254) || ' was invited as ' || case p_role when 'staff' then 'Staff' else 'Accountant' end || '. See People.', '/console/settings/people', true, true, null, p_uid);
  end if;
  return v_id;
end $$;
--> statement-breakpoint
-- Cancel an invitation: only one the caller could have given (security M1).
create or replace function app_cancel_person_invite(p_uid uuid, p_invite uuid) returns void
  language plpgsql volatile security definer set search_path = '' as $$
declare v_t uuid := public.app_current_tenant(); v_caller text := public.app_people_caller(p_uid);
begin
  if v_t is null or v_caller is null then raise exception 'not_manager' using errcode = 'P0001'; end if;
  update public.invites i set revoked_at = now()
   where i.id = p_invite and i.tenant_id = v_t and i.accepted_at is null and i.revoked_at is null and public.app_people_may_give(v_caller, i.role);
  if not found then raise exception 'no_invite' using errcode = 'P0001'; end if;
end $$;
--> statement-breakpoint
-- Remove a person: only a role the caller could have given, never the caller, never an owner, never a partner's person.
-- The invitations they made end with them (security M5).
create or replace function app_remove_person(p_uid uuid, p_member uuid) returns void
  language plpgsql volatile security definer set search_path = '' as $$
declare v_t uuid := public.app_current_tenant(); v_caller text := public.app_people_caller(p_uid); v_role text;
begin
  if v_t is null or v_caller is null then raise exception 'not_manager' using errcode = 'P0001'; end if;
  if p_member = p_uid then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  delete from public.members m where m.tenant_id = v_t and m.user_id = p_member and m.partner_member_id is null
     and public.app_people_may_give(v_caller, m.role)
  returning m.role into v_role;
  if v_role is null then raise exception 'no_person' using errcode = 'P0001'; end if;
  update public.invites set revoked_at = now() where tenant_id = v_t and created_by = p_member and accepted_at is null and revoked_at is null;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    values (v_t, p_uid, (select u.email from auth.users u where u.id = p_uid), 'member', 'shop.person_removed', null, jsonb_build_object('role', v_role));
end $$;
--> statement-breakpoint
-- This store's invitations for People (owner and Manager only): open ones and those expired in the last 30 days.
create or replace function app_person_invites(p_uid uuid) returns table (id uuid, email text, role text, expires_at timestamptz)
  language sql stable security definer set search_path = '' as $$
  select i.id, i.email, i.role, i.expires_at from public.invites i
   where public.app_people_caller(p_uid) is not null and i.tenant_id = public.app_current_tenant()
     and i.role in ('admin', 'staff', 'accountant') and i.accepted_at is null and i.revoked_at is null
     and i.expires_at > now() - interval '30 days'
     and not exists (select 1 from public.invites n where n.tenant_id = i.tenant_id and n.email = i.email and n.id <> i.id and n.created_at > i.created_at)
   order by i.created_at desc
$$;
--> statement-breakpoint
-- The store's limit and count, for People's "3 of 3 people on Launch".
create or replace function app_people_room(p_uid uuid) returns table (used integer, people_limit integer, plan_name text)
  language sql stable security definer set search_path = '' as $$
  select public.app_people_members(t) + public.app_people_open_invites(t), public.app_people_limit(t),
    (select p.name from public.tenant_plans tp join public.plan_versions pv on pv.id = tp.plan_version_id join public.plans p on p.id = pv.plan_id
      where tp.tenant_id = t and tp.starts_at <= now() order by tp.starts_at desc limit 1)
    from (select public.app_current_tenant() as t) x where public.app_people_caller(p_uid) is not null
$$;
--> statement-breakpoint

-- ── Claim at sign-in: as 0023, plus the limit for Managers, Staff and Accountants (counted without the invite being
--    claimed; a refused one stays open until it expires). Owner invites are handled as before. ──
create or replace function app_claim_invites(p_user uuid) returns integer
  language plpgsql security definer set search_path = '' as $$
declare v_email text; n integer := 0; i record;
begin
  select lower(u.email) into v_email from auth.users u where u.id = p_user and u.email_confirmed_at is not null;
  if v_email is null then return 0; end if;
  for i in select inv.id, inv.tenant_id, inv.role from public.invites inv
            where inv.email = v_email and inv.accepted_at is null and inv.revoked_at is null and inv.expires_at > now()
            order by inv.created_at
  loop
    perform 1 from public.tenants t where t.id = i.tenant_id for update;
    if i.role = 'owner' then
      if exists (select 1 from public.partner_links l where l.tenant_id = i.tenant_id and l.removed_at is null) then continue; end if;
    else
      if public.app_people_members(i.tenant_id) >= public.app_people_limit(i.tenant_id) then continue; end if;
      -- A person of the store's live partner never joins as the store's own.
      if exists (select 1 from public.partner_links l join public.partner_members pm on pm.partner_id = l.partner_id and pm.removed_at is null
                  where l.tenant_id = i.tenant_id and l.removed_at is null and pm.user_id = p_user) then continue; end if;
    end if;
    update public.invites set accepted_at = now() where id = i.id;
    insert into public.members (tenant_id, user_id, role) values (i.tenant_id, p_user, i.role) on conflict do nothing;
    if found then
      n := n + 1;
      if i.role in ('admin', 'staff', 'accountant') then
        perform public.notice_write(i.tenant_id, 'security', 'partner_request', null, 'Someone joined your store',
          v_email || ' joined as ' || case i.role when 'admin' then 'Manager' when 'staff' then 'Staff' else 'Accountant' end || '. See People.',
          '/console/settings/people', true, true, null, p_user);
      end if;
    end if;
  end loop;
  return n;
end $$;
--> statement-breakpoint

-- ── A partner, by the partner owner's email (owner: "email"). The store learns nothing about the address: every
--    refusal here reads only the store's own rows, the reply is the same for any address, and the owner's notice is
--    written for every request. The partner's email goes out only when the address is a live partner owner's. ──
create or replace function app_partner_request_send(p_uid uuid, p_email text) returns uuid
  language plpgsql volatile security definer set search_path = '' as $$
declare v_t uuid := public.app_current_tenant(); v_email text := lower(btrim(coalesce(p_email, ''))); v_id uuid; v_name text;
begin
  if v_t is null or public.app_people_caller(p_uid) is distinct from 'owner' then raise exception 'not_owner' using errcode = 'P0001'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(v_email) > 254 then raise exception 'bad_email' using errcode = 'P0001'; end if;
  select t.name into v_name from public.tenants t where t.id = v_t for update;
  if exists (select 1 from public.partner_links l where l.tenant_id = v_t and l.removed_at is null) then raise exception 'has_partner' using errcode = 'P0001'; end if;
  if exists (select 1 from auth.users u where u.id = p_uid and lower(u.email) = v_email) then raise exception 'own_email' using errcode = 'P0001'; end if;
  if exists (select 1 from public.members m join auth.users u on u.id = m.user_id where m.tenant_id = v_t and lower(u.email) = v_email) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;
  -- 5 requests a day per store (security H1).
  if (select count(*) from public.partner_requests r where r.tenant_id = v_t and r.created_at > now() - interval '1 day') >= 5 then
    raise exception 'too_many' using errcode = 'P0001';
  end if;
  -- An expired open request frees the slot; a live one must be cancelled first.
  update public.partner_requests set cancelled_at = now()
   where tenant_id = v_t and accepted_at is null and declined_at is null and cancelled_at is null and expires_at <= now();
  if exists (select 1 from public.partner_requests r where r.tenant_id = v_t and r.accepted_at is null and r.declined_at is null and r.cancelled_at is null) then
    raise exception 'has_request' using errcode = 'P0001';
  end if;
  insert into public.partner_requests (tenant_id, email, created_by, expires_at) values (v_t, v_email, p_uid, now() + interval '14 days') returning id into v_id;
  if exists (select 1 from public.partner_members pm join public.partners pa on pa.id = pm.partner_id join auth.users u on u.id = pm.user_id
              where pm.role = 'owner' and pm.removed_at is null and pm.accepted_at is not null and pa.approved_at is not null
                and pa.declined_at is null and pa.suspended_at is null and u.email_confirmed_at is not null and lower(u.email) = v_email) then
    perform public.app_people_mail('store_partner_invite', v_email, v_name, p_uid, null);
  end if;
  perform public.notice_write(v_t, 'security', 'partner_request', v_id, 'You invited a partner to your store',
    v_email || ' sees your orders and shoppers if they accept. Not you? Cancel the invitation in People.', '/console/settings/people', true, true, null, null); -- by nobody: the owner is told even of their own send (a stolen session)
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target)
    values (v_t, p_uid, (select u.email from auth.users u where u.id = p_uid), 'member', 'shop.partner_invited', v_email);
  return v_id;
end $$;
--> statement-breakpoint
create or replace function app_partner_request_cancel(p_uid uuid) returns void
  language plpgsql volatile security definer set search_path = '' as $$
declare v_t uuid := public.app_current_tenant();
begin
  if v_t is null or public.app_people_caller(p_uid) is distinct from 'owner' then raise exception 'not_owner' using errcode = 'P0001'; end if;
  update public.partner_requests set cancelled_at = now()
   where tenant_id = v_t and accepted_at is null and declined_at is null and cancelled_at is null;
  if not found then raise exception 'no_request' using errcode = 'P0001'; end if;
end $$;
--> statement-breakpoint
-- The partner owner's invitations: matched on the caller's CONFIRMED sign-in email, never a typed one (tenancy H3).
-- Open and unexpired only; no tenant id, no owner email.
create or replace function app_partner_requests(p_uid uuid) returns table (id uuid, store_name text, created_at timestamptz, expires_at timestamptz)
  language sql stable security definer set search_path = '' as $$
  select r.id, t.name, r.created_at, r.expires_at
    from public.app_pm_live(p_uid) me
    join auth.users u on u.id = p_uid and u.email_confirmed_at is not null
    join public.partner_requests r on r.email = lower(u.email) and r.accepted_at is null and r.declined_at is null
                                  and r.cancelled_at is null and r.expires_at > now()
    join public.tenants t on t.id = r.tenant_id
   where me.role = 'owner'
     and not exists (select 1 from public.partner_links l where l.tenant_id = r.tenant_id and l.removed_at is null)
   order by r.created_at desc
$$;
--> statement-breakpoint
-- Accept or decline. Takes only the caller, their check, the request id and yes/no; the partner is the caller's own,
-- the store the request's. Accept writes a link with no share (owner: "no revenue share"; share_months 1 only because
-- the CHECK wants > 0), the owner's members row, an audit row, and deletes the partner's older keys on this store so a
-- re-added partner never gets them back (tenancy H2). Returns the store on accept, null on decline.
create or replace function app_partner_answer_request(p_uid uuid, p_session uuid, p_stepup text, p_request uuid, p_yes boolean) returns uuid
  language plpgsql volatile security definer set search_path = '' as $$
declare me record; r record; v_email text; v_name text;
begin
  select * into me from public.app_pm_live(p_uid) x where x.role = 'owner';
  if me.member_id is null then raise exception 'not_partner' using errcode = 'P0001'; end if;
  perform public.app_partner_need(p_uid, p_session, p_stepup, true);
  select lower(u.email) into v_email from auth.users u where u.id = p_uid and u.email_confirmed_at is not null;
  select pr.id, pr.tenant_id, pr.created_by into r from public.partner_requests pr
   where pr.id = p_request and pr.email = v_email and pr.accepted_at is null and pr.declined_at is null and pr.cancelled_at is null
     and pr.expires_at > now();
  if r.id is null then raise exception 'no_request' using errcode = 'P0001'; end if;
  perform 1 from public.tenants t where t.id = r.tenant_id for update;
  perform 1 from public.partner_requests pr where pr.id = r.id for update;
  select coalesce(nullif(pa.business_name, ''), pa.name) into v_name from public.partners pa where pa.id = me.partner_id;
  if not p_yes then
    update public.partner_requests set declined_at = now(), partner_id = me.partner_id where id = r.id;
    perform public.notice_write(r.tenant_id, 'needs_you', 'partner_request', r.id, 'Your partner invitation was declined',
      'You can add another partner from People.', '/console/settings/people', false, true, null, null);
    return null;
  end if;
  if exists (select 1 from public.partner_links l where l.tenant_id = r.tenant_id and l.removed_at is null) then raise exception 'has_partner' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.members m where m.tenant_id = r.tenant_id and m.user_id = r.created_by and m.role = 'owner') then
    raise exception 'no_owner' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.members m join public.partner_members pm on pm.user_id = m.user_id
              where m.tenant_id = r.tenant_id and pm.partner_id = me.partner_id and pm.removed_at is null) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;
  insert into public.partner_links (tenant_id, partner_id, share_bps, share_months, notice_days) values (r.tenant_id, me.partner_id, 0, 1, 0);
  insert into public.members (tenant_id, user_id, role, partner_member_id) values (r.tenant_id, p_uid, 'partner', me.member_id);
  update public.storefront_keys set revoked_at = now(), revoked_by = p_uid
   where tenant_id = r.tenant_id and partner_id = me.partner_id and revoked_at is null;
  update public.partner_requests set accepted_at = now(), partner_id = me.partner_id where id = r.id;
  perform public.notice_write(r.tenant_id, 'security', 'partner_request', r.id, left('Your new partner is ' || v_name, 120),
    'They can work on your store from today. Remove them any time in People.', '/console/settings/people', true, true, null, null);
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target)
    values (r.tenant_id, p_uid, v_email, 'member', 'shop.partner_accepted', v_name);
  return r.tenant_id;
end $$;
--> statement-breakpoint

revoke all on function app_people_limit(uuid), app_people_members(uuid), app_people_open_invites(uuid), app_people_caller(uuid),
  app_people_may_give(text, text), app_people_mail(text, text, text, uuid, text), app_invite_person(uuid, text, text),
  app_cancel_person_invite(uuid, uuid), app_remove_person(uuid, uuid), app_person_invites(uuid), app_people_room(uuid),
  app_claim_invites(uuid), app_partner_request_send(uuid, text), app_partner_request_cancel(uuid), app_partner_requests(uuid),
  app_partner_answer_request(uuid, uuid, text, uuid, boolean)
  from public, anon, authenticated, service_role, frata_app, frata_admin, frata_builder;
--> statement-breakpoint
grant execute on function app_invite_person(uuid, text, text), app_cancel_person_invite(uuid, uuid), app_remove_person(uuid, uuid),
  app_person_invites(uuid), app_people_room(uuid), app_claim_invites(uuid), app_partner_request_send(uuid, text),
  app_partner_request_cancel(uuid), app_partner_requests(uuid), app_partner_answer_request(uuid, uuid, text, uuid, boolean) to frata_app;
--> statement-breakpoint
-- People's notices are for owners and Managers only (as a partner's ask): same signature, its grants stay.
create or replace function app_notice_members(p_notice uuid default null) returns table (user_id uuid, role text)
  language sql stable security definer set search_path = '' as $$
  select m.user_id, m.role from public.members m where m.tenant_id = public.app_current_tenant()
     and m.role in ('owner', 'admin', 'staff', 'partner')
     and (m.role in ('owner', 'admin') or not exists (select 1 from public.notices n where n.tenant_id = m.tenant_id and n.id = p_notice and n.source_kind in ('ask_owner', 'brand', 'partner_request'))) $$;

--> statement-breakpoint
-- app_partner_clients as 0147, plus the link's own share_bps (owner only): a store an owner added its partner to
-- carries 0, and the partner's pages must say so instead of falling back to PARTNER_TERMS (unit-economics review).
drop function if exists app_partner_clients(uuid, uuid, text);--> statement-breakpoint
create function app_partner_clients(p_uid uuid, p_session uuid, p_stepup text) returns table (
  tenant_id uuid, name text, slug text, linked_at timestamptz, share_starts_at timestamptz, removed_at timestamptz,
  share_months integer, notice_days integer, owner_email text, invite_email text, invite_expires_at timestamptz, plan_name text,
  has_owner boolean, link_id uuid, owner_since timestamptz, invite_sent_at timestamptz, share_bps integer)
  language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.app_pm_live(p_uid)) then return; end if;
  perform public.app_partner_need(p_uid, p_session, p_stepup, false);
  return query
  select l.tenant_id, t.name,
    case when l.removed_at is null then t.slug end,
    l.created_at,
    l.share_starts_at, l.removed_at,
    case when me.role = 'owner' then l.share_months end, case when me.role = 'owner' then l.notice_days end,
    case when me.role = 'owner' and l.removed_at is null then o.email end,
    case when me.role = 'owner' and l.removed_at is null then i.email end,
    case when l.removed_at is null then i.expires_at end,
    case when me.role = 'owner' and l.removed_at is null then (select p.name from public.tenant_plans tp
                                           join public.plan_versions pv on pv.id = tp.plan_version_id
                                           join public.plans p on p.id = pv.plan_id
                                          where tp.tenant_id = l.tenant_id and tp.starts_at <= now()
                                          order by tp.starts_at desc limit 1) end,
    o.member_since is not null,
    l.id,
    case when me.role <> 'builder' and l.removed_at is null then o.member_since end,
    case when me.role <> 'builder' and l.removed_at is null then i.created_at end,
    case when me.role = 'owner' then l.share_bps end
  from public.app_pm_live(p_uid) me
  join public.partner_links l on l.partner_id = me.partner_id
  join public.tenants t on t.id = l.tenant_id
  left join lateral (select u.email::text as email, m.created_at as member_since from public.members m join auth.users u on u.id = m.user_id
                      where m.tenant_id = l.tenant_id and m.role = 'owner' order by m.created_at limit 1) o on true
  left join lateral (select i.email, i.expires_at, i.created_at from public.invites i
                      where i.tenant_id = l.tenant_id and i.role = 'owner' and i.accepted_at is null
                        and i.revoked_at is null and i.expires_at > now()
                      order by i.created_at desc limit 1) i on true
  where me.role = 'owner'
     or (me.role in ('lead', 'builder') and l.removed_at is null
         and exists (select 1 from public.partner_assignments a where a.partner_member_id = me.member_id and a.tenant_id = l.tenant_id))
  order by l.removed_at nulls first, t.name;
end $$;
--> statement-breakpoint
revoke all on function app_partner_clients(uuid, uuid, text) from public, anon, authenticated, service_role, frata_admin, frata_builder;
--> statement-breakpoint
grant execute on function app_partner_clients(uuid, uuid, text) to frata_app;

--> statement-breakpoint
-- The accountant's own definers (0072) are replaced by app_invite_person and friends: the app runs them no more, so
-- nothing invites past the people limit, the rate limits or the owner's notice (impact review 2026-11-23).
revoke execute on function app_invite_accountant(uuid, uuid, text), app_remove_accountant(uuid, uuid, uuid), app_accountant_invites(uuid),
  app_revoke_accountant_invite(uuid, uuid, uuid) from frata_app;
