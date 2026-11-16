CREATE TABLE "platform_switches" (
	"key" text PRIMARY KEY NOT NULL,
	"until" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"set_by" text NOT NULL,
	"reason" text NOT NULL,
	CONSTRAINT "platform_switches_key" CHECK ("platform_switches"."key" in ('passkeys_off')),
	CONSTRAINT "platform_switches_reason" CHECK (length("platform_switches"."reason") between 1 and 200),
	CONSTRAINT "platform_switches_until" CHECK ("platform_switches"."until" <= "platform_switches"."created_at" + interval '7 days')
);
--> statement-breakpoint
-- =============================================================================
-- PASSKEYS OFF SWITCH (owner, 2026-11-16: "offer me option to turn off pass key, currently I feel they are frictions …
-- we should be able to turn it on when we want … I want to be able to test the system without any frictions"; ADR-0007
-- amendment). Hand-written. While a `passkeys_off` row is live (`until` in the future, at most 7 days from when it was
-- set), getting in counts as checked for people who already qualify: staff (app_access_for) and live partner people,
-- owners, leads and Builders (app_access_for and app_partner_need). What does NOT follow the switch (security review
-- 2026-11-16 H1): adding, approving, listing and removing passkeys, for staff and partners and from Admin, keep the real
-- check (app_staff_live_stepup and app_partner_live_stepup are untouched; five partner passkey definers call
-- app_partner_need_real), so a passkey can't be enrolled with an email alone and outlive the switch. Signing in still
-- needs the email; roles and store access don't change. A trigger writes the audit row for every change (M2).
-- =============================================================================
alter table platform_switches enable row level security;--> statement-breakpoint
revoke all on platform_switches from public, anon, authenticated, service_role, frata_app, frata_admin, frata_builder;--> statement-breakpoint
create policy definer_only on platform_switches as restrictive for all to public using (false) with check (false);--> statement-breakpoint
create or replace function app_passkeys_off() returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_switches w where w.key = 'passkeys_off' and w.until > now())
$$;--> statement-breakpoint
-- Every change to a switch leaves an audit row (system actor): who set it, until when, why; and when it was taken off.
create or replace function app_platform_switch_audit() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_events (tenant_id, actor_kind, action, target, detail)
  values (null, 'system', case when tg_op = 'DELETE' then 'platform.passkeys_on' else 'platform.passkeys_off' end, coalesce(new.key, old.key),
          case when tg_op = 'DELETE' then jsonb_build_object('was_until', old.until, 'was_set_by', old.set_by)
               else jsonb_build_object('until', new.until, 'set_by', new.set_by, 'reason', new.reason) end);
  return coalesce(new, old);
end $$;--> statement-breakpoint
create trigger platform_switches_audit after insert or update or delete on platform_switches
  for each row execute function app_platform_switch_audit();--> statement-breakpoint
-- 0129's app_partner_need, unchanged, under a new name: the real check, for the passkey definers below.
create or replace function app_partner_need_real(p_uid uuid, p_session uuid, p_hash text, p_fresh boolean) returns void
  language plpgsql stable security definer set search_path = '' as $$
declare v timestamptz := public.app_partner_live_stepup(p_uid, p_session, p_hash);
begin
  if v is null then raise exception 'confirm_first' using errcode = 'P0001'; end if;
  if p_fresh and v < now() - interval '5 minutes' then raise exception 'confirm_again' using errcode = 'P0001'; end if;
end $$;--> statement-breakpoint
-- The workspace's check: the switch first (a live partner person counts as checked just now), else the real one.
create or replace function app_partner_need(p_uid uuid, p_session uuid, p_hash text, p_fresh boolean) returns void
  language plpgsql stable security definer set search_path = '' as $$
begin
  if public.app_passkeys_off() and exists (select 1 from public.app_pm_live(p_uid)) then return; end if;
  perform public.app_partner_need_real(p_uid, p_session, p_hash, p_fresh);
end $$;--> statement-breakpoint
-- As 0131_builders_access.sql, its check the real one (a passkey manages passkeys, switch or not).
create or replace function app_partner_pk_approve(p_uid uuid, p_session uuid, p_stepup text, p_member uuid, p_code_hash text) returns text
  language plpgsql security definer set search_path = '' as $$
declare me record; t record; v_req uuid; v_by text;
begin
  select x.* into me from public.app_pm_live(p_uid) x where x.role = 'owner';
  if me.member_id is null then raise exception 'not_owner' using errcode = 'P0001'; end if;
  perform public.app_partner_need_real(p_uid, p_session, p_stepup, true);
  select pm.id, pm.email, pm.user_id into t from public.partner_members pm
   where pm.id = p_member and pm.partner_id = me.partner_id and pm.role in ('lead', 'builder') and pm.removed_at is null and pm.accepted_at is not null;
  if t.id is null then raise exception 'no_person' using errcode = 'P0001'; end if;
  if t.user_id = p_uid then raise exception 'own_request' using errcode = 'P0001'; end if;
  perform public.app_partner_try(p_uid, p_session, 'approve');
  update public.partner_passkey_requests r set approved_by = p_uid, approved_kind = 'owner', approved_at = now(), device = null, city = null
   where r.id = (select r2.id from public.partner_passkey_requests r2 where r2.partner_member_id = t.id and r2.used_at is null
                   and r2.approved_at is null and r2.declined_at is null and r2.expires_at > now() and (r2.opens_at is null or r2.opens_at <= now())
                   and r2.code_hash = p_code_hash order by r2.created_at desc limit 1)
  returning r.id into v_req;
  if v_req is null then return null; end if;
  select pm.email into v_by from public.partner_members pm where pm.id = me.member_id;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    values (null, p_uid, v_by, 'member', 'partner.passkey.approve', t.id::text, null);
  perform public.app_partner_notify(t.id, 'partner_request_approved', v_by, null, false);
  return t.email;
end $$;--> statement-breakpoint
-- As 0131_builders_access.sql, its check the real one (a passkey manages passkeys, switch or not).
create or replace function app_partner_pk_decline(p_uid uuid, p_session uuid, p_stepup text, p_member uuid) returns void
  language plpgsql security definer set search_path = '' as $$
declare me record; t record; n int;
begin
  select x.* into me from public.app_pm_live(p_uid) x where x.role = 'owner';
  if me.member_id is null then raise exception 'not_owner' using errcode = 'P0001'; end if;
  perform public.app_partner_need_real(p_uid, p_session, p_stepup, false);
  select pm.id, pm.user_id into t from public.partner_members pm
   where pm.id = p_member and pm.partner_id = me.partner_id and pm.role in ('lead', 'builder') and pm.removed_at is null;
  if t.id is null or t.user_id = p_uid then raise exception 'no_person' using errcode = 'P0001'; end if;
  update public.partner_passkey_requests r set declined_at = now(), device = null, city = null
   where r.partner_member_id = t.id and r.used_at is null and r.approved_at is null and r.declined_at is null and r.expires_at > now();
  get diagnostics n = row_count;
  if n = 0 then raise exception 'no_request' using errcode = 'P0001'; end if;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    select null, p_uid, pm.email, 'member', 'partner.passkey.decline', t.id::text, null from public.partner_members pm where pm.id = me.member_id;
end $$;--> statement-breakpoint
-- As 0129_partner_passkeys_access.sql, its check the real one (a passkey manages passkeys, switch or not).
create or replace function app_partner_pk_list(p_uid uuid, p_session uuid, p_stepup text) returns jsonb
  language plpgsql stable security definer set search_path = '' as $$
declare me record;
begin
  select x.* into me from public.app_pm_live(p_uid) x;
  if me.member_id is null then raise exception 'not_partner' using errcode = 'P0001'; end if;
  perform public.app_partner_need_real(p_uid, p_session, p_stepup, false);
  return coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'name', k.name, 'createdAt', k.created_at, 'lastUsedAt', k.last_used_at,
      'inUse', exists (select 1 from public.partner_stepups s where s.passkey_id = k.id and s.session_id = p_session and s.token_hash = p_stepup)) order by k.created_at)
    from public.partner_passkeys k where k.partner_member_id = me.member_id), '[]'::jsonb);
end $$;--> statement-breakpoint
-- As 0129_partner_passkeys_access.sql, its check the real one (a passkey manages passkeys, switch or not).
create or replace function app_partner_pk_remove(p_uid uuid, p_session uuid, p_stepup text, p_passkey uuid) returns void
  language plpgsql security definer set search_path = '' as $$
declare me record; v_name text;
begin
  select x.* into me from public.app_pm_live(p_uid) x;
  if me.member_id is null then raise exception 'not_partner' using errcode = 'P0001'; end if;
  perform public.app_partner_need_real(p_uid, p_session, p_stepup, true);
  select k.name into v_name from public.partner_passkeys k where k.id = p_passkey and k.partner_member_id = me.member_id;
  if v_name is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if exists (select 1 from public.partner_stepups s where s.passkey_id = p_passkey and s.session_id = p_session and s.token_hash = p_stepup) then
    raise exception 'in_use' using errcode = 'P0001';
  end if;
  delete from public.partner_passkeys where id = p_passkey;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    select null, p_uid, pm.email, 'member', 'partner.passkey.remove', pm.id::text, jsonb_build_object('name', v_name)
      from public.partner_members pm where pm.id = me.member_id;
  perform public.app_partner_notify(me.member_id, 'partner_passkey_removed', null, v_name, false);
end $$;--> statement-breakpoint
-- As 0131_builders_access.sql, its check the real one (a passkey manages passkeys, switch or not).
create or replace function app_partner_pk_remove_all(p_uid uuid, p_session uuid, p_stepup text, p_member uuid) returns integer
  language plpgsql security definer set search_path = '' as $$
declare me record; t record; n int;
begin
  select x.* into me from public.app_pm_live(p_uid) x where x.role = 'owner';
  if me.member_id is null then raise exception 'not_owner' using errcode = 'P0001'; end if;
  perform public.app_partner_need_real(p_uid, p_session, p_stepup, true);
  select pm.id, pm.user_id into t from public.partner_members pm
   where pm.id = p_member and pm.partner_id = me.partner_id and pm.role in ('lead', 'builder') and pm.removed_at is null;
  if t.id is null or t.user_id = p_uid then raise exception 'no_person' using errcode = 'P0001'; end if;
  delete from public.partner_passkeys where partner_member_id = t.id;
  get diagnostics n = row_count;
  delete from public.partner_passkey_requests where partner_member_id = t.id;
  delete from public.partner_webauthn_challenges where partner_member_id = t.id;
  delete from public.partner_stepups where partner_member_id = t.id;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    select null, p_uid, pm.email, 'member', 'partner.passkey.remove_all', t.id::text, jsonb_build_object('passkeys', n)
      from public.partner_members pm where pm.id = me.member_id;
  perform public.app_partner_notify(t.id, 'partner_passkey_removed', (select pm.email from public.partner_members pm where pm.id = me.member_id), 'every passkey', false);
  return n;
end $$;--> statement-breakpoint
-- As 0129, its check the real one: a handover gives a store away for good (re-review 2026-11-16 M1).
create or replace function app_handover_invite(p_tenant uuid, p_uid uuid, p_email text, p_session uuid, p_stepup text) returns uuid
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
  perform public.app_partner_need_real(p_uid, p_session, p_stepup, true);
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
end $$;--> statement-breakpoint
-- The switch's dates are the database's own (re-review L1): `created_at` is always now, so the 7-day cap holds; and the
-- table can't be emptied without an audit row.
create or replace function app_platform_switch_stamp() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin new.created_at := now(); return new; end $$;--> statement-breakpoint
create trigger platform_switches_stamp before insert or update on platform_switches
  for each row execute function app_platform_switch_stamp();--> statement-breakpoint
create or replace function app_platform_switch_truncated() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_events (tenant_id, actor_kind, action, target, detail)
  values (null, 'system', 'platform.passkeys_on', 'passkeys_off', jsonb_build_object('via', 'truncate'));
  return null;
end $$;--> statement-breakpoint
create trigger platform_switches_truncate after truncate on platform_switches
  for each statement execute function app_platform_switch_truncated();--> statement-breakpoint
-- As 0129, getting in follows the switch (staff: conf; partners: pconf).
create or replace function app_access_for(p_user uuid, p_session uuid default null, p_stepup text default null, p_partner text default null) returns jsonb
  language sql stable security definer set search_path = '' as $$
  -- 0151: while the passkeys-off switch is live, a staff member counts as checked just now (switch first: an old real
  -- step-up never makes a fresh action wait).
  with conf as (select case when public.app_passkeys_off() and exists (select 1 from public.platform_staff ps where ps.user_id = p_user)
                            then now() else public.app_staff_live_stepup(p_user, p_session, p_stepup) end as at),
  -- 0151: while the switch is live, every live partner membership of this person (owner, lead or Builder) counts as
  -- checked just now; otherwise 0129's rule, unchanged.
  pconf as (select me.member_id, now() as at from public.app_pm_live(p_user) me where public.app_passkeys_off()
            union all
            (select s.partner_member_id as member_id, s.created_at as at from public.partner_stepups s
              join public.app_pm_live(p_user) me on me.member_id = s.partner_member_id
             where not public.app_passkeys_off() and p_partner is not null and s.user_id = p_user and s.session_id = p_session
               and s.token_hash = p_partner and s.expires_at > now()
             order by s.created_at desc limit 1)),
  prow as (select m.tenant_id, m.partner_member_id from public.members m
             join public.app_pm_live(p_user) me on me.member_id = m.partner_member_id
             join public.partner_links l on l.partner_id = me.partner_id and l.tenant_id = m.tenant_id and l.removed_at is null
            where m.user_id = p_user)
  select jsonb_build_object(
    'staffRole', (select ps.role from public.platform_staff ps where ps.user_id = p_user),
    'staffConfirmedAt', (select at from conf),
    'partnerConfirmedAt', (select max(at) from pconf),
    -- Stores this person works on as a partner but cannot open until they confirm with a passkey on this session.
    'partnerHeld', coalesce((select jsonb_agg(r.tenant_id) from prow r where not exists (select 1 from pconf c where c.member_id = r.partner_member_id)), '[]'::jsonb),
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
                   select 1 from prow r join pconf c on c.member_id = r.partner_member_id
                    where r.tenant_id = m.tenant_id and r.partner_member_id = m.partner_member_id))
        ) u
        order by u.tenant_id, u.pref
      ) d), '[]'::jsonb))
$$;--> statement-breakpoint
revoke all on function app_passkeys_off(), app_platform_switch_audit(), app_platform_switch_stamp(), app_platform_switch_truncated(), app_partner_need_real(uuid, uuid, text, boolean), app_partner_need(uuid, uuid, text, boolean)
  from public, anon, authenticated, service_role, frata_app, frata_admin, frata_builder;
