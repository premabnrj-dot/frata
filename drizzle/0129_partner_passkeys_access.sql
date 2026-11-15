-- Custom SQL migration file, put your code below! --
-- ═══ PARTNER PASSKEYS T1b (docs/plans/2026-11-12-studio-build.md § T1b, reviews folded in) ═══════════════════════
-- Production applies the whole file in ONE call (one transaction): old signatures are dropped and their callers fail
-- closed until the push; partner people re-check with a passkey after it.
-- Every partner passkey row is bound to ONE membership (partner_member_id = app_pm_live(uid).member_id): a person who
-- leaves one partner carries nothing into another. Tables: no role holds any privilege; a restrictive deny-all policy;
-- every read and write through the definers below. EXECUTE: frata_app for the partner side, frata_admin for Admin's,
-- nobody for the internal helpers (live step-up, tries, notify).

alter table partner_passkeys enable row level security;--> statement-breakpoint
alter table partner_passkey_requests enable row level security;--> statement-breakpoint
alter table partner_webauthn_challenges enable row level security;--> statement-breakpoint
alter table partner_stepups enable row level security;--> statement-breakpoint
alter table partner_passkey_tries enable row level security;--> statement-breakpoint
revoke all on partner_passkeys, partner_passkey_requests, partner_webauthn_challenges, partner_stepups, partner_passkey_tries
  from public, anon, authenticated, service_role, frata_app, frata_admin;--> statement-breakpoint
create policy definer_only on partner_passkeys as restrictive for all to public using (false) with check (false);--> statement-breakpoint
create policy definer_only on partner_passkey_requests as restrictive for all to public using (false) with check (false);--> statement-breakpoint
create policy definer_only on partner_webauthn_challenges as restrictive for all to public using (false) with check (false);--> statement-breakpoint
create policy definer_only on partner_stepups as restrictive for all to public using (false) with check (false);--> statement-breakpoint
create policy definer_only on partner_passkey_tries as restrictive for all to public using (false) with check (false);--> statement-breakpoint

-- ── Internal helpers (no role may call them) ─────────────────────────────────────────────────────────────────────
-- A live partner check for (user, session, hash): its member must be live now (accepted, not removed, partner approved,
-- not declined, not suspended), so removal, decline and suspension end it at once.
create or replace function app_partner_live_stepup(p_uid uuid, p_session uuid, p_hash text) returns timestamptz
  language sql stable security definer set search_path = '' as $$
  select s.created_at from public.partner_stepups s
    join public.app_pm_live(p_uid) me on me.member_id = s.partner_member_id
   where s.user_id = p_uid and s.session_id = p_session and s.token_hash = p_hash and s.expires_at > now()
   order by s.created_at desc limit 1
$$;--> statement-breakpoint

-- Refuses without a live check ('confirm_first'), or without one in the last 5 minutes when p_fresh ('confirm_again').
create or replace function app_partner_need(p_uid uuid, p_session uuid, p_hash text, p_fresh boolean) returns void
  language plpgsql stable security definer set search_path = '' as $$
declare v timestamptz := public.app_partner_live_stepup(p_uid, p_session, p_hash);
begin
  if v is null then raise exception 'confirm_first' using errcode = 'P0001'; end if;
  if p_fresh and v < now() - interval '5 minutes' then raise exception 'confirm_again' using errcode = 'P0001'; end if;
end $$;--> statement-breakpoint

-- Tries counted before the work, failing closed: 'check' 20 a session in 10 minutes and 60 a person an hour;
-- 'request' and 'approve' (a wrong code is a guess) 5 and 10.
create or replace function app_partner_try(p_uid uuid, p_session uuid, p_kind text) returns void
  language plpgsql security definer set search_path = '' as $$
declare v_session int := case when p_kind = 'check' then 20 else 5 end; v_person int := case when p_kind = 'check' then 60 else 10 end;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_uid::text || ':partner-try:' || p_kind, 0));
  delete from public.partner_passkey_tries where at < now() - interval '1 day';
  if (select count(*) from public.partner_passkey_tries t where t.user_id = p_uid and t.kind = p_kind and t.session_id = p_session and t.at > now() - interval '10 minutes') >= v_session
     or (select count(*) from public.partner_passkey_tries t where t.user_id = p_uid and t.kind = p_kind and t.at > now() - interval '1 hour') >= v_person then
    raise exception 'too_many' using errcode = 'P0001';
  end if;
  insert into public.partner_passkey_tries (user_id, session_id, kind) values (p_uid, p_session, p_kind);
end $$;--> statement-breakpoint

-- Security emails: the person concerned and the partner's owner (addresses from partner_members, never an argument);
-- every Frrata admin too when p_admins (an owner's own recovery).
create or replace function app_partner_notify(p_member uuid, p_kind text, p_by text, p_detail text, p_admins boolean) returns void
  language sql security definer set search_path = '' as $$
  insert into public.staff_notices (to_email, kind, about, by_email, detail)
  select distinct lower(e), p_kind, (select lower(pm.email) from public.partner_members pm where pm.id = p_member), lower(p_by), p_detail
    from (select pm.email as e from public.partner_members pm where pm.id = p_member
          union select o.email from public.partner_members pm join public.partner_members o on o.partner_id = pm.partner_id
                 and o.role = 'owner' and o.removed_at is null where pm.id = p_member
          union select ps.email from public.platform_staff ps where p_admins and ps.role = 'admin') x
   where e is not null and e <> ''
$$;--> statement-breakpoint

-- ── Access: one function, the partner check's hash last (old code's 3-argument call lands here with none) ─────────
drop function if exists app_access_for(uuid, uuid, text);--> statement-breakpoint
create function app_access_for(p_user uuid, p_session uuid default null, p_stepup text default null, p_partner text default null) returns jsonb
  language sql stable security definer set search_path = '' as $$
  with conf as (select public.app_staff_live_stepup(p_user, p_session, p_stepup) as at),
  pconf as (select s.partner_member_id as member_id, s.created_at as at from public.partner_stepups s
              join public.app_pm_live(p_user) me on me.member_id = s.partner_member_id
             where p_partner is not null and s.user_id = p_user and s.session_id = p_session and s.token_hash = p_partner and s.expires_at > now()
             order by s.created_at desc limit 1),
  prow as (select m.tenant_id, m.partner_member_id from public.members m
             join public.app_pm_live(p_user) me on me.member_id = m.partner_member_id
             join public.partner_links l on l.partner_id = me.partner_id and l.tenant_id = m.tenant_id and l.removed_at is null
            where m.user_id = p_user)
  select jsonb_build_object(
    'staffRole', (select ps.role from public.platform_staff ps where ps.user_id = p_user),
    'staffConfirmedAt', (select at from conf),
    'partnerConfirmedAt', (select at from pconf),
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

-- ── The passkey check itself (the ceremony is src/lib/auth/webauthn.ts; these hold the rules) ─────────────────────
-- What the gate shows: passkeys on this membership; this session's open or approved request.
create or replace function app_partner_pk_state(p_uid uuid, p_session uuid) returns jsonb
  language sql stable security definer set search_path = '' as $$
  select case when me.member_id is null then null else jsonb_build_object(
    'role', me.role,
    'passkeys', (select count(*) from public.partner_passkeys k where k.partner_member_id = me.member_id),
    'request', (select jsonb_build_object('expiresAt', r.expires_at, 'approved', r.approved_at is not null, 'declined', r.declined_at is not null,
                         'approvedUntil', r.approved_at + interval '10 minutes', 'opensAt', r.opens_at,
                         'approvedBy', case when r.approved_kind = 'staff' then 'Frrata' else (select o.email from public.partner_members o where o.user_id = r.approved_by and o.partner_id = me.partner_id and o.removed_at is null limit 1) end)
                  from public.partner_passkey_requests r
                 where r.partner_member_id = me.member_id and r.session_id = p_session and r.used_at is null
                   and (r.approved_at is null and r.expires_at > now() or r.approved_at > now() - interval '10 minutes')
                 order by r.created_at desc limit 1)) end
    from (select 1) one left join public.app_pm_live(p_uid) me on true
$$;--> statement-breakpoint

create or replace function app_partner_pk_credentials(p_uid uuid) returns jsonb
  language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', k.credential_id, 'transports', to_jsonb(k.transports)) order by k.created_at), '[]'::jsonb)
    from public.partner_passkeys k join public.app_pm_live(p_uid) me on me.member_id = k.partner_member_id
$$;--> statement-breakpoint

create or replace function app_partner_pk_challenge(p_uid uuid, p_session uuid, p_purpose text, p_stepup text, p_challenge text) returns void
  language plpgsql security definer set search_path = '' as $$
declare me record;
begin
  select x.* into me from public.app_pm_live(p_uid) x;
  if me.member_id is null then raise exception 'not_partner' using errcode = 'P0001'; end if;
  if p_purpose not in ('confirm', 'add') or p_challenge is null or length(p_challenge) < 40 then raise exception 'bad_input' using errcode = 'P0001'; end if;
  perform public.app_partner_try(p_uid, p_session, 'check');
  if p_purpose = 'confirm' and not exists (select 1 from public.partner_passkeys k where k.partner_member_id = me.member_id) then
    raise exception 'no_passkey' using errcode = 'P0001';
  end if;
  if p_purpose = 'add' and coalesce(public.app_partner_live_stepup(p_uid, p_session, p_stepup) > now() - interval '5 minutes', false) is false and not exists (
      select 1 from public.partner_passkey_requests r where r.partner_member_id = me.member_id and r.session_id = p_session
         and r.used_at is null and r.approved_at > now() - interval '10 minutes') then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  delete from public.partner_webauthn_challenges c where c.user_id = p_uid and c.session_id = p_session and (c.purpose = p_purpose or c.expires_at < now());
  insert into public.partner_webauthn_challenges (partner_member_id, user_id, session_id, purpose, challenge, expires_at)
    values (me.member_id, p_uid, p_session, p_purpose, p_challenge, now() + interval '5 minutes');
end $$;--> statement-breakpoint

-- Marks the signed challenge used (once) and gives back THIS membership's key for the credential; null otherwise.
create or replace function app_partner_pk_take_challenge(p_uid uuid, p_session uuid, p_purpose text, p_challenge text, p_credential text) returns jsonb
  language plpgsql security definer set search_path = '' as $$
declare me record; n int; k record;
begin
  select x.* into me from public.app_pm_live(p_uid) x;
  if me.member_id is null then return null; end if;
  update public.partner_webauthn_challenges c set used_at = now()
   where c.partner_member_id = me.member_id and c.user_id = p_uid and c.session_id = p_session and c.purpose = p_purpose
     and c.challenge = p_challenge and c.used_at is null and c.expires_at > now();
  get diagnostics n = row_count;
  if n = 0 then return null; end if;
  if p_purpose = 'add' then return jsonb_build_object('ok', true); end if;
  select id, public_key, counter, transports into k from public.partner_passkeys
   where partner_member_id = me.member_id and credential_id = p_credential;
  if k.id is null then return null; end if;
  return jsonb_build_object('ok', true, 'passkeyId', k.id, 'publicKey', k.public_key, 'counter', k.counter, 'transports', to_jsonb(k.transports));
end $$;--> statement-breakpoint

-- After the app verified the signature: the challenge taken in the last 2 minutes is consumed, the counter only rises,
-- and a 12-hour check is made for this session (its expiry set here).
create or replace function app_partner_pk_confirm(p_uid uuid, p_session uuid, p_challenge text, p_passkey uuid, p_counter bigint, p_token_hash text) returns timestamptz
  language plpgsql security definer set search_path = '' as $$
declare me record; n int; v_name text; v_counter bigint; v_at timestamptz;
begin
  select x.* into me from public.app_pm_live(p_uid) x;
  if me.member_id is null then raise exception 'not_partner' using errcode = 'P0001'; end if;
  delete from public.partner_webauthn_challenges c where c.partner_member_id = me.member_id and c.session_id = p_session and c.purpose = 'confirm'
     and c.challenge = p_challenge and c.used_at > now() - interval '2 minutes';
  get diagnostics n = row_count;
  if n = 0 then raise exception 'no_challenge' using errcode = 'P0001'; end if;
  select k.name, k.counter into v_name, v_counter from public.partner_passkeys k where k.id = p_passkey and k.partner_member_id = me.member_id for update;
  if v_name is null then raise exception 'no_passkey' using errcode = 'P0001'; end if;
  if not (p_counter > v_counter or (p_counter = 0 and v_counter = 0)) then raise exception 'replay' using errcode = 'P0001'; end if;
  update public.partner_passkeys set counter = p_counter, last_used_at = now() where id = p_passkey;
  delete from public.partner_stepups s where s.user_id = p_uid and (s.session_id = p_session or s.expires_at < now());
  insert into public.partner_stepups (partner_member_id, user_id, session_id, passkey_id, token_hash, expires_at)
    values (me.member_id, p_uid, p_session, p_passkey, p_token_hash, now() + interval '12 hours') returning created_at into v_at;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    select null, p_uid, pm.email, 'member', 'partner.passkey.confirm', pm.id::text, jsonb_build_object('passkey', v_name)
      from public.partner_members pm where pm.id = me.member_id;
  return v_at;
end $$;--> statement-breakpoint

-- Add a passkey: the 'add' challenge taken in the last 2 minutes, and either a live check in the last 5 minutes on this
-- session (a second device) or this session's approved request (used now, once). At most 10 a membership. A name is
-- letters, digits, spaces, - and ' only (it is emailed to the owner).
create or replace function app_partner_pk_add(p_uid uuid, p_session uuid, p_stepup text, p_credential text, p_public_key text,
  p_counter bigint, p_transports text[], p_name text) returns uuid
  language plpgsql security definer set search_path = '' as $$
declare me record; n int; v_req uuid; v_id uuid; v_via text; v_name text := btrim(coalesce(p_name, ''));
begin
  select x.* into me from public.app_pm_live(p_uid) x;
  if me.member_id is null then raise exception 'not_partner' using errcode = 'P0001'; end if;
  if v_name !~ '^[[:alnum:] ''-]{1,40}$' then raise exception 'bad_name' using errcode = 'P0001'; end if;
  delete from public.partner_webauthn_challenges c where c.partner_member_id = me.member_id and c.session_id = p_session and c.purpose = 'add'
     and c.used_at > now() - interval '2 minutes';
  get diagnostics n = row_count;
  if n = 0 then raise exception 'no_challenge' using errcode = 'P0001'; end if;
  if coalesce(public.app_partner_live_stepup(p_uid, p_session, p_stepup) > now() - interval '5 minutes', false) then
    v_via := 'second_device';
  else
    update public.partner_passkey_requests r set used_at = now(), device = null, city = null
     where r.id = (select r2.id from public.partner_passkey_requests r2 where r2.partner_member_id = me.member_id and r2.session_id = p_session
                     and r2.used_at is null and r2.approved_at > now() - interval '10 minutes' order by r2.approved_at desc limit 1)
    returning r.id into v_req;
    if v_req is null then raise exception 'not_allowed' using errcode = 'P0001'; end if;
    v_via := 'approved';
  end if;
  if (select count(*) from public.partner_passkeys k where k.partner_member_id = me.member_id) >= 10 then raise exception 'too_many_passkeys' using errcode = 'P0001'; end if;
  begin
    insert into public.partner_passkeys (partner_member_id, user_id, credential_id, public_key, counter, transports, name)
      values (me.member_id, p_uid, p_credential, p_public_key, greatest(p_counter, 0), coalesce(p_transports, '{}'), v_name) returning id into v_id;
  exception when unique_violation then raise exception 'duplicate' using errcode = 'P0001';
  end;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    select null, p_uid, pm.email, 'member', 'partner.passkey.add', pm.id::text, jsonb_build_object('name', v_name, 'via', v_via)
      from public.partner_members pm where pm.id = me.member_id;
  perform public.app_partner_notify(me.member_id, 'partner_passkey_added', null, v_name, false);
  return v_id;
end $$;--> statement-breakpoint

-- "Let me add a passkey": this session's request with the hash of its 6-digit code. 15 minutes; an OWNER who already
-- has a passkey (a recovery through Frrata) waits 24 hours, keeps it 48, and is emailed at once (review H2).
-- `p_device` ("Chrome on Android") and `p_city` (Vercel's edge) are context for the approver only (partner sign-in
-- mockup screen 10): printable characters, 60 at most, else nothing.
create or replace function app_partner_pk_request(p_uid uuid, p_session uuid, p_code_hash text, p_device text, p_city text) returns jsonb
  language plpgsql security definer set search_path = '' as $$
declare me record; v_wait boolean; v_exp timestamptz; v_opens timestamptz;
  v_device text := nullif(left(btrim(regexp_replace(coalesce(p_device, ''), '[^[:print:]]', '', 'g')), 60), '');
  v_city text := nullif(left(btrim(regexp_replace(coalesce(p_city, ''), '[^[:print:]]', '', 'g')), 60), '');
begin
  select x.* into me from public.app_pm_live(p_uid) x;
  if me.member_id is null then raise exception 'not_partner' using errcode = 'P0001'; end if;
  if p_code_hash !~ '^[0-9a-f]{64}$' then raise exception 'bad_input' using errcode = 'P0001'; end if;
  perform public.app_partner_try(p_uid, p_session, 'request');
  -- An owner who has EVER had a passkey waits (security review M1): deleting every passkey (Admin, a lost device) must
  -- not turn a recovery into an instant first passkey. Every add is audited, so the audit row is the record.
  v_wait := me.role = 'owner' and (exists (select 1 from public.partner_passkeys k where k.partner_member_id = me.member_id)
    or exists (select 1 from public.audit_events a where a.action = 'partner.passkey.add' and a.target = me.member_id::text));
  delete from public.partner_passkey_requests r where r.partner_member_id = me.member_id and r.used_at is null and r.approved_at is null;
  delete from public.partner_passkey_requests r where r.expires_at < now() - interval '90 days';
  insert into public.partner_passkey_requests (partner_member_id, user_id, session_id, code_hash, expires_at, opens_at, device, city)
    values (me.member_id, p_uid, p_session, p_code_hash,
            now() + case when v_wait then interval '48 hours' else interval '15 minutes' end,
            case when v_wait then now() + interval '24 hours' end, v_device, v_city)
  returning expires_at, opens_at into v_exp, v_opens;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    select null, p_uid, pm.email, 'member', 'partner.passkey.request', pm.id::text, jsonb_build_object('waits', v_wait)
      from public.partner_members pm where pm.id = me.member_id;
  -- Any owner's request reaches Frrata's admins (someone has to make the call): 'first' for a first passkey, else a
  -- recovery that waits 24 hours. The owner's own inbox is told too.
  if me.role = 'owner' then perform public.app_partner_notify(me.member_id, 'partner_request_made', null, case when v_wait then null else 'first' end, true); end if;
  return jsonb_build_object('expiresAt', v_exp, 'opensAt', v_opens);
end $$;--> statement-breakpoint

-- The partner's OWNER approves a Lead's open request with the code the Lead reads out: a check in the last 5 minutes,
-- the target a live Lead of the same partner and never the owner; the try is counted first; a wrong code returns null
-- (a raise would roll the count back). Returns the Lead's email.
create or replace function app_partner_pk_approve(p_uid uuid, p_session uuid, p_stepup text, p_member uuid, p_code_hash text) returns text
  language plpgsql security definer set search_path = '' as $$
declare me record; t record; v_req uuid; v_by text;
begin
  select x.* into me from public.app_pm_live(p_uid) x where x.role = 'owner';
  if me.member_id is null then raise exception 'not_owner' using errcode = 'P0001'; end if;
  perform public.app_partner_need(p_uid, p_session, p_stepup, true);
  select pm.id, pm.email, pm.user_id into t from public.partner_members pm
   where pm.id = p_member and pm.partner_id = me.partner_id and pm.role = 'lead' and pm.removed_at is null and pm.accepted_at is not null;
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

-- The owner says no ("Decline request": they did not start the call, or don't know the device). The Lead's screen says
-- so; a new request starts again. A live check is enough (declining gives nothing away).
create or replace function app_partner_pk_decline(p_uid uuid, p_session uuid, p_stepup text, p_member uuid) returns void
  language plpgsql security definer set search_path = '' as $$
declare me record; t record; n int;
begin
  select x.* into me from public.app_pm_live(p_uid) x where x.role = 'owner';
  if me.member_id is null then raise exception 'not_owner' using errcode = 'P0001'; end if;
  perform public.app_partner_need(p_uid, p_session, p_stepup, false);
  select pm.id, pm.user_id into t from public.partner_members pm
   where pm.id = p_member and pm.partner_id = me.partner_id and pm.role = 'lead' and pm.removed_at is null;
  if t.id is null or t.user_id = p_uid then raise exception 'no_person' using errcode = 'P0001'; end if;
  update public.partner_passkey_requests r set declined_at = now(), device = null, city = null
   where r.partner_member_id = t.id and r.used_at is null and r.approved_at is null and r.declined_at is null and r.expires_at > now();
  get diagnostics n = row_count;
  if n = 0 then raise exception 'no_request' using errcode = 'P0001'; end if;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    select null, p_uid, pm.email, 'member', 'partner.passkey.decline', t.id::text, null from public.partner_members pm where pm.id = me.member_id;
end $$;--> statement-breakpoint

-- The person's own passkeys (names and dates only; never a key, credential id or counter).
create or replace function app_partner_pk_list(p_uid uuid, p_session uuid, p_stepup text) returns jsonb
  language plpgsql stable security definer set search_path = '' as $$
declare me record;
begin
  select x.* into me from public.app_pm_live(p_uid) x;
  if me.member_id is null then raise exception 'not_partner' using errcode = 'P0001'; end if;
  perform public.app_partner_need(p_uid, p_session, p_stepup, false);
  return coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'name', k.name, 'createdAt', k.created_at, 'lastUsedAt', k.last_used_at,
      'inUse', exists (select 1 from public.partner_stepups s where s.passkey_id = k.id and s.session_id = p_session and s.token_hash = p_stepup)) order by k.created_at)
    from public.partner_passkeys k where k.partner_member_id = me.member_id), '[]'::jsonb);
end $$;--> statement-breakpoint

-- Remove one of your own passkeys after a check in the last 5 minutes; never the one this session used.
create or replace function app_partner_pk_remove(p_uid uuid, p_session uuid, p_stepup text, p_passkey uuid) returns void
  language plpgsql security definer set search_path = '' as $$
declare me record; v_name text;
begin
  select x.* into me from public.app_pm_live(p_uid) x;
  if me.member_id is null then raise exception 'not_partner' using errcode = 'P0001'; end if;
  perform public.app_partner_need(p_uid, p_session, p_stepup, true);
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

-- A lost or stolen device: the owner signs a Lead out everywhere and removes their passkeys (check in 5 minutes).
create or replace function app_partner_pk_remove_all(p_uid uuid, p_session uuid, p_stepup text, p_member uuid) returns integer
  language plpgsql security definer set search_path = '' as $$
declare me record; t record; n int;
begin
  select x.* into me from public.app_pm_live(p_uid) x where x.role = 'owner';
  if me.member_id is null then raise exception 'not_owner' using errcode = 'P0001'; end if;
  perform public.app_partner_need(p_uid, p_session, p_stepup, true);
  select pm.id, pm.user_id into t from public.partner_members pm
   where pm.id = p_member and pm.partner_id = me.partner_id and pm.role = 'lead' and pm.removed_at is null;
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

-- Sign-out ends this browser's partner check first (by its cookie's hash; harmless for anyone else's hash).
create or replace function app_partner_pk_signout(p_token_hash text) returns void
  language sql security definer set search_path = '' as $$
  delete from public.partner_stepups where token_hash = p_token_hash
$$;--> statement-breakpoint

-- ── Admin: a partner OWNER's request (call back the phone on the partner's record, never the caller) ─────────────
create or replace function admin_partner_pk_state(p_staff uuid, p_session uuid, p_stepup text, p_partner uuid) returns jsonb
  language plpgsql stable security definer set search_path = '' as $$
declare o record;
begin
  if public.app_staff_live_stepup(p_staff, p_session, p_stepup) is null then raise exception 'confirm_first' using errcode = 'P0001'; end if;
  select pm.id, pm.email, pa.phone into o from public.partner_members pm join public.partners pa on pa.id = pm.partner_id
   where pm.partner_id = p_partner and pm.role = 'owner' and pm.removed_at is null and pm.accepted_at is not null limit 1;
  if o.id is null then return null; end if;
  return jsonb_build_object('owner', o.email, 'phone', o.phone,
    'passkeys', (select count(*) from public.partner_passkeys k where k.partner_member_id = o.id),
    'lastUsedAt', (select max(k.last_used_at) from public.partner_passkeys k where k.partner_member_id = o.id),
    'request', (select jsonb_build_object('createdAt', r.created_at, 'approved', r.approved_at is not null, 'opensAt', r.opens_at,
                         'expiresAt', r.expires_at, 'device', r.device, 'city', r.city)
                  from public.partner_passkey_requests r where r.partner_member_id = o.id and r.used_at is null and r.declined_at is null
                   and (r.approved_at is null and r.expires_at > now() or r.approved_at > now() - interval '10 minutes')
                 order by r.created_at desc limit 1));
end $$;--> statement-breakpoint

create or replace function admin_partner_pk_approve(p_staff uuid, p_session uuid, p_stepup text, p_partner uuid, p_code_hash text) returns text
  language plpgsql security definer set search_path = '' as $$
declare v_email text; v_role text; v_conf timestamptz; o record; v_req uuid;
begin
  select ps.email, ps.role into v_email, v_role from public.platform_staff ps where ps.user_id = p_staff;
  if v_role is distinct from 'admin' then raise exception 'not_admin' using errcode = 'P0001'; end if;
  v_conf := public.app_staff_live_stepup(p_staff, p_session, p_stepup);
  if v_conf is null or v_conf < now() - interval '5 minutes' then raise exception 'confirm_first' using errcode = 'P0001'; end if;
  select pm.id, pm.email, pm.user_id into o from public.partner_members pm
   where pm.partner_id = p_partner and pm.role = 'owner' and pm.removed_at is null and pm.accepted_at is not null limit 1;
  if o.id is null then raise exception 'no_person' using errcode = 'P0001'; end if;
  if o.user_id = p_staff then raise exception 'own_request' using errcode = 'P0001'; end if;
  perform public.app_staff_try(p_staff, p_session, 'approve');
  update public.partner_passkey_requests r set approved_by = p_staff, approved_kind = 'staff', approved_at = now(), device = null, city = null
   where r.id = (select r2.id from public.partner_passkey_requests r2 where r2.partner_member_id = o.id and r2.used_at is null
                   and r2.approved_at is null and r2.declined_at is null and r2.expires_at > now() and (r2.opens_at is null or r2.opens_at <= now())
                   and r2.code_hash = p_code_hash order by r2.created_at desc limit 1)
  returning r.id into v_req;
  if v_req is null then return null; end if;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    values (null, p_staff, v_email, 'staff', 'partner.passkey.approve', o.id::text, jsonb_build_object('partner', p_partner));
  perform public.app_partner_notify(o.id, 'partner_request_approved', v_email, null, true);
  return o.email;
end $$;--> statement-breakpoint

create or replace function admin_partner_pk_remove_all(p_staff uuid, p_session uuid, p_stepup text, p_partner uuid) returns integer
  language plpgsql security definer set search_path = '' as $$
declare v_email text; v_role text; v_conf timestamptz; o uuid; n int;
begin
  select ps.email, ps.role into v_email, v_role from public.platform_staff ps where ps.user_id = p_staff;
  if v_role is distinct from 'admin' then raise exception 'not_admin' using errcode = 'P0001'; end if;
  v_conf := public.app_staff_live_stepup(p_staff, p_session, p_stepup);
  if v_conf is null or v_conf < now() - interval '5 minutes' then raise exception 'confirm_first' using errcode = 'P0001'; end if;
  select pm.id into o from public.partner_members pm where pm.partner_id = p_partner and pm.role = 'owner' and pm.removed_at is null limit 1;
  if o is null then raise exception 'no_person' using errcode = 'P0001'; end if;
  delete from public.partner_passkeys where partner_member_id = o;
  get diagnostics n = row_count;
  delete from public.partner_passkey_requests where partner_member_id = o;
  delete from public.partner_webauthn_challenges where partner_member_id = o;
  delete from public.partner_stepups where partner_member_id = o;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    values (null, p_staff, v_email, 'staff', 'partner.passkey.remove_all', o::text, jsonb_build_object('partner', p_partner, 'passkeys', n));
  perform public.app_partner_notify(o, 'partner_passkey_removed', v_email, 'every passkey', true);
  return n;
end $$;--> statement-breakpoint

-- ── The partner workspace's definers now need the check (old signatures dropped: no way around it) ─────────────────
drop function if exists app_partner_clients(uuid);--> statement-breakpoint
create function app_partner_clients(p_uid uuid, p_session uuid, p_stepup text) returns table (
  tenant_id uuid, name text, slug text, linked_at timestamptz, share_starts_at timestamptz, removed_at timestamptz,
  share_months integer, notice_days integer, owner_email text, invite_email text, invite_expires_at timestamptz, plan_name text)
  language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.app_pm_live(p_uid)) then return; end if; -- not a live partner person: nothing
  perform public.app_partner_need(p_uid, p_session, p_stepup, false);
  return query
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
  order by l.removed_at nulls first, t.name;
end $$;--> statement-breakpoint

drop function if exists app_partner_create_shop(uuid, text, text, text, integer, integer, integer, integer);--> statement-breakpoint
create function app_partner_create_shop(p_uid uuid, p_session uuid, p_stepup text, p_name text, p_slug text, p_pickup text,
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
  select * from public.trial_settings where id = 1 into ts;
  insert into public.shop_trials (tenant_id, days, open_window_days, signed_up_at, started_at) values (v_tenant, ts.days, ts.open_window_days, now(), now());
  insert into public.tenant_plans (tenant_id, plan_version_id, starts_at, created_by) values (v_tenant, v_version, now(), p_uid);
  insert into public.partner_links (tenant_id, partner_id, share_bps, share_months, notice_days)
    values (v_tenant, me.partner_id, p_share_bps, p_share_months, p_notice_days);
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    select v_tenant, p_uid, u.email, 'member', 'shop.created', p_slug, jsonb_build_object('pickup', p_pickup, 'by', 'partner')
      from auth.users u where u.id = p_uid;
  return v_tenant;
end $$;--> statement-breakpoint

-- Hand over now lives in the partner workspace and asks again: a check in the last 5 minutes. Its tenant id comes from
-- the form (named exception, like assign): this re-checks the active link, the owner's own members row and the check.
drop function if exists app_handover_invite(uuid, uuid, text);--> statement-breakpoint
create function app_handover_invite(p_tenant uuid, p_uid uuid, p_email text, p_session uuid, p_stepup text) returns uuid
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
  perform public.app_partner_need(p_uid, p_session, p_stepup, true);
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

-- The team, with each person's passkeys and an open request with its context (the owner's approval card).
drop function if exists app_partner_team(uuid);--> statement-breakpoint
create function app_partner_team(p_uid uuid, p_session uuid, p_stepup text) returns table (
  member_id uuid, email text, role text, invited_at timestamptz, invite_expires_at timestamptz, accepted_at timestamptz,
  is_you boolean, stores jsonb, passkeys integer, request jsonb)
  language plpgsql stable security definer set search_path = '' as $$
declare me record;
begin
  select x.* into me from public.app_pm_live(p_uid) x where x.role = 'owner';
  if me.member_id is null then raise exception 'not_owner' using errcode = 'P0001'; end if;
  perform public.app_partner_need(p_uid, p_session, p_stepup, false);
  return query
  select pm.id, pm.email, pm.role, pm.invited_at, pm.invite_expires_at, pm.accepted_at, pm.user_id = p_uid,
    coalesce((select jsonb_agg(jsonb_build_object('tenantId', t.id, 'name', t.name) order by t.name)
                from public.partner_assignments a join public.tenants t on t.id = a.tenant_id
                join public.partner_links l on l.tenant_id = a.tenant_id and l.partner_id = me.partner_id and l.removed_at is null
               where a.partner_member_id = pm.id), '[]'::jsonb),
    (select count(*)::int from public.partner_passkeys k where k.partner_member_id = pm.id),
    (select jsonb_build_object('createdAt', r.created_at, 'expiresAt', r.expires_at, 'device', r.device, 'city', r.city)
       from public.partner_passkey_requests r where r.partner_member_id = pm.id and r.used_at is null and r.approved_at is null
        and r.declined_at is null and r.expires_at > now() and (r.opens_at is null or r.opens_at <= now())
      order by r.created_at desc limit 1)
    from public.partner_members pm
   where pm.partner_id = me.partner_id and pm.removed_at is null
   order by array_position(array['owner','lead','builder'], pm.role), pm.accepted_at is null, pm.invited_at;
end $$;--> statement-breakpoint

drop function if exists app_partner_invite(uuid, text, text, uuid[]);--> statement-breakpoint
create function app_partner_invite(p_uid uuid, p_session uuid, p_stepup text, p_email text, p_role text, p_tenants uuid[]) returns uuid
  language plpgsql volatile security definer set search_path = '' as $$
declare me record; v_email text := lower(btrim(p_email)); v_id uuid; v_t uuid;
begin
  select x.* into me from public.app_pm_live(p_uid) x where x.role = 'owner';
  if me.member_id is null then raise exception 'not_owner' using errcode = 'P0001'; end if;
  perform public.app_partner_need(p_uid, p_session, p_stepup, true);
  if p_role is distinct from 'lead' then raise exception 'bad_role' using errcode = 'P0001'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 200 then raise exception 'bad_email' using errcode = 'P0001'; end if;
  if coalesce(array_length(p_tenants, 1), 0) > 200 then raise exception 'bad_store' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext('partner_team:' || me.partner_id::text));
  if (select count(*) from public.partner_members pm where pm.partner_id = me.partner_id and pm.removed_at is null
        and (pm.accepted_at is not null or pm.invite_expires_at > now())) >= 50 then
    raise exception 'too_many' using errcode = 'P0001';
  end if;
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
end $$;--> statement-breakpoint

drop function if exists app_partner_assign(uuid, uuid, uuid, boolean);--> statement-breakpoint
create function app_partner_assign(p_uid uuid, p_session uuid, p_stepup text, p_member uuid, p_tenant uuid, p_on boolean) returns void
  language plpgsql volatile security definer set search_path = '' as $$
declare me record; r record; v_email text;
begin
  select x.* into me from public.app_pm_live(p_uid) x where x.role = 'owner';
  if me.member_id is null then raise exception 'not_owner' using errcode = 'P0001'; end if;
  perform public.app_partner_need(p_uid, p_session, p_stepup, true);
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
end $$;--> statement-breakpoint

-- Removing a person also deletes their passkeys, requests, challenges and checks (one membership's, all at once).
drop function if exists app_partner_remove_member(uuid, uuid);--> statement-breakpoint
create function app_partner_remove_member(p_uid uuid, p_session uuid, p_stepup text, p_member uuid) returns void
  language plpgsql volatile security definer set search_path = '' as $$
declare me record; r record; v_email text;
begin
  select x.* into me from public.app_pm_live(p_uid) x where x.role = 'owner';
  if me.member_id is null then raise exception 'not_owner' using errcode = 'P0001'; end if;
  perform public.app_partner_need(p_uid, p_session, p_stepup, true);
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
  delete from public.partner_passkeys where partner_member_id = r.id;
  delete from public.partner_passkey_requests where partner_member_id = r.id;
  delete from public.partner_webauthn_challenges where partner_member_id = r.id;
  delete from public.partner_stepups where partner_member_id = r.id;
  update public.partner_members set removed_at = now(), removed_by = p_uid where id = r.id;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target)
    values (null, p_uid, v_email, 'member', 'partner.person_removed', r.id::text);
end $$;--> statement-breakpoint

-- Accept: unchanged, except a declined applicant's ended owner row takes its (unused) passkey rows with it.
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
  if exists (select 1 from public.partners p where p.user_id = p_uid and p.declined_at is null) then
    raise exception 'own_partner' using errcode = 'P0001';
  end if;
  with ended as (
    update public.partner_members set removed_at = now(), removed_by = p_uid
     where user_id = p_uid and removed_at is null
       and partner_id in (select p.id from public.partners p where p.user_id = p_uid and p.declined_at is not null)
    returning id)
  delete from public.partner_passkeys k where k.partner_member_id in (select id from ended);
  if exists (select 1 from public.partner_members pm where pm.user_id = p_uid and pm.removed_at is null) then
    raise exception 'in_team' using errcode = 'P0001';
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
end $$;--> statement-breakpoint

-- ── Grants ─────────────────────────────────────────────────────────────────────────────────────────────────────────
revoke all on function app_partner_live_stepup(uuid, uuid, text), app_partner_need(uuid, uuid, text, boolean),
  app_partner_try(uuid, uuid, text), app_partner_notify(uuid, text, text, text, boolean),
  app_access_for(uuid, uuid, text, text), app_partner_pk_state(uuid, uuid), app_partner_pk_credentials(uuid),
  app_partner_pk_challenge(uuid, uuid, text, text, text), app_partner_pk_take_challenge(uuid, uuid, text, text, text),
  app_partner_pk_confirm(uuid, uuid, text, uuid, bigint, text), app_partner_pk_add(uuid, uuid, text, text, text, bigint, text[], text),
  app_partner_pk_request(uuid, uuid, text, text, text), app_partner_pk_approve(uuid, uuid, text, uuid, text), app_partner_pk_decline(uuid, uuid, text, uuid), app_partner_pk_list(uuid, uuid, text),
  app_partner_pk_remove(uuid, uuid, text, uuid), app_partner_pk_remove_all(uuid, uuid, text, uuid), app_partner_pk_signout(text),
  admin_partner_pk_state(uuid, uuid, text, uuid), admin_partner_pk_approve(uuid, uuid, text, uuid, text), admin_partner_pk_remove_all(uuid, uuid, text, uuid),
  app_partner_clients(uuid, uuid, text), app_partner_create_shop(uuid, uuid, text, text, text, text, integer, integer, integer, integer),
  app_handover_invite(uuid, uuid, text, uuid, text), app_partner_team(uuid, uuid, text), app_partner_invite(uuid, uuid, text, text, text, uuid[]),
  app_partner_assign(uuid, uuid, text, uuid, uuid, boolean), app_partner_remove_member(uuid, uuid, text, uuid), app_partner_accept(uuid, uuid)
  from public, anon, authenticated, service_role, frata_app, frata_admin;--> statement-breakpoint
grant execute on function app_access_for(uuid, uuid, text, text), app_partner_pk_state(uuid, uuid), app_partner_pk_credentials(uuid),
  app_partner_pk_challenge(uuid, uuid, text, text, text), app_partner_pk_take_challenge(uuid, uuid, text, text, text),
  app_partner_pk_confirm(uuid, uuid, text, uuid, bigint, text), app_partner_pk_add(uuid, uuid, text, text, text, bigint, text[], text),
  app_partner_pk_request(uuid, uuid, text, text, text), app_partner_pk_approve(uuid, uuid, text, uuid, text), app_partner_pk_decline(uuid, uuid, text, uuid), app_partner_pk_list(uuid, uuid, text),
  app_partner_pk_remove(uuid, uuid, text, uuid), app_partner_pk_remove_all(uuid, uuid, text, uuid), app_partner_pk_signout(text),
  app_partner_clients(uuid, uuid, text), app_partner_create_shop(uuid, uuid, text, text, text, text, integer, integer, integer, integer),
  app_handover_invite(uuid, uuid, text, uuid, text), app_partner_team(uuid, uuid, text), app_partner_invite(uuid, uuid, text, text, text, uuid[]),
  app_partner_assign(uuid, uuid, text, uuid, uuid, boolean), app_partner_remove_member(uuid, uuid, text, uuid), app_partner_accept(uuid, uuid)
  to frata_app;--> statement-breakpoint
grant execute on function admin_partner_pk_state(uuid, uuid, text, uuid), admin_partner_pk_approve(uuid, uuid, text, uuid, text),
  admin_partner_pk_remove_all(uuid, uuid, text, uuid) to frata_admin;
