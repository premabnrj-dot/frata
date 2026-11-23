-- =============================================================================
-- PASSKEYS OFF FROM ADMIN, AND OFF MEANS OFF (owner 2026-11-23: "park the plan and just add option in admin to disable
-- passkeys … it's too early for passkeys in the system, let it be just email … just wish to get started for now";
-- mockup docs/mockups/2026-11-23-admin-passkeys-switch.html). Hand-written. Amends ADR-0007 (2026-11-12 and 2026-11-16),
-- ADR-0015, ADR-0020 § 4–5, G·3's Give key finding and C1's real-money check (security H1): while the switch is live
-- nothing asks for a passkey. What still keeps its real check: adding, approving and removing passkeys (security review
-- 2026-11-16 H1: no passkey is enrolled with an email alone). The switch has no end date when set from Admin (0170).
-- =============================================================================

-- Live while a row exists that has no end, or an end still ahead.
create or replace function app_passkeys_off() returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_switches w where w.key = 'passkeys_off' and (w.until is null or w.until > now()))
$$;--> statement-breakpoint

-- What the pages show: off or on, since when, set by whom. No secret; the app's server reads it (Admin's banner and
-- control, the partner pages that list passkeys, Studio's door, Give key).
create or replace function app_passkeys_state() returns jsonb
  language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('off', public.app_passkeys_off(),
    'since', (select w.created_at from public.platform_switches w where w.key = 'passkeys_off' and (w.until is null or w.until > now())),
    'by', (select w.set_by from public.platform_switches w where w.key = 'passkeys_off' and (w.until is null or w.until > now())))
$$;--> statement-breakpoint

-- Admin › Staff's control (frata_admin): an Admin turns passkeys off (their own passkey in the last 5 minutes, a real
-- check, so a stolen inbox can't) or on (no check). Off has no end. An audit row names the person; 0151's trigger keeps
-- its own row too.
create or replace function app_admin_passkeys_set(p_uid uuid, p_session uuid, p_stepup text, p_off boolean) returns boolean
  language plpgsql volatile security definer set search_path = '' as $$
declare v_email text;
begin
  select ps.email into v_email from public.platform_staff ps where ps.user_id = p_uid and ps.role = 'admin';
  if v_email is null then raise exception 'not_admin' using errcode = 'P0001'; end if;
  if p_off is null then raise exception 'bad_input' using errcode = 'P0001'; end if;
  if p_off then
    if coalesce(public.app_staff_live_stepup(p_uid, p_session, p_stepup) > now() - interval '5 minutes', false) is false then
      raise exception 'confirm_first' using errcode = 'P0001';
    end if;
    insert into public.platform_switches (key, until, set_by, reason) values ('passkeys_off', null, v_email, 'Turned off in Admin › Staff')
      on conflict (key) do update set until = null, set_by = excluded.set_by, reason = excluded.reason;
  else
    delete from public.platform_switches where key = 'passkeys_off';
  end if;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
  values (null, p_uid, left(v_email, 320), 'staff', case when p_off then 'platform.passkeys_off' else 'platform.passkeys_on' end, 'passkeys_off',
          jsonb_build_object('via', 'admin'));
  return p_off;
end $$;--> statement-breakpoint

-- Admin › Staff's list while off: who and their passkeys' names (no key material), with no passkey check.
create or replace function app_staff_list(p_uid uuid, p_session uuid, p_stepup text) returns jsonb
  language plpgsql stable security definer set search_path = '' as $$
declare v_role text;
begin
  select ps.role into v_role from public.platform_staff ps where ps.user_id = p_uid;
  if v_role is null or (public.app_staff_live_stepup(p_uid, p_session, p_stepup) is null and not public.app_passkeys_off()) then raise exception 'confirm_first' using errcode = 'P0001'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'userId', ps.user_id, 'email', ps.email, 'role', ps.role, 'since', ps.created_at,
      'passkeys', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'name', k.name, 'createdAt', k.created_at, 'lastUsedAt', k.last_used_at) order by k.created_at)
                            from public.staff_passkeys k where k.user_id = ps.user_id), '[]'::jsonb),
      'lastConfirmedAt', (select max(k.last_used_at) from public.staff_passkeys k where k.user_id = ps.user_id),
      'request', (select jsonb_build_object('createdAt', r.created_at, 'approved', r.approved_at is not null)
                    from public.staff_enrolment_requests r where r.user_id = ps.user_id and r.used_at is null
                     and (r.approved_at is null and r.expires_at > now() or r.approved_at > now() - interval '10 minutes')
                   order by r.created_at desc limit 1)) order by ps.email)
    from public.platform_staff ps where v_role = 'admin' or ps.user_id = p_uid), '[]'::jsonb);
end $$;--> statement-breakpoint

-- Credits' real-money writes (C1 security H1) follow the switch.
create or replace function app_pc_owner(p_uid uuid, p_session uuid, p_stepup text, p_fresh boolean, p_real boolean,
  out member_id uuid, out partner_id uuid)
  language plpgsql stable security definer set search_path = '' as $$
begin
  select x.member_id, x.partner_id into member_id, partner_id from public.app_pm_live(p_uid) x where x.role = 'owner';
  if member_id is null then raise exception 'not_owner' using errcode = 'P0001'; end if;
  if p_real and not public.app_passkeys_off() then perform public.app_partner_need_real(p_uid, p_session, p_stepup, p_fresh);
  else perform public.app_partner_need(p_uid, p_session, p_stepup, p_fresh); end if;
end $$;--> statement-breakpoint

-- A handover invite follows the switch.
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
  perform public.app_partner_need(p_uid, p_session, p_stepup, true); -- 0171: the switch counts (owner 2026-11-23)
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

-- Studio (ADR-0020 § 4–5 amended): while off, the person binds and a turn re-checks them with no step-up; a bind or turn
-- made while off holds none, so it ends at its next check once passkeys are on again.
create or replace function app_studio_proved(p_uid uuid, p_tenant uuid, p_staff uuid, p_partner_stepup uuid) returns table (member_id uuid, partner_id uuid)
  language sql stable security definer set search_path = '' as $$
  select p.member_id, p.partner_id from public.app_studio_person(p_uid, p_tenant) p
   where exists (select 1 from public.platform_staff ps where ps.user_id = p_uid)
     and ((p_staff is null and p_partner_stepup is null and public.app_passkeys_off())
       or (exists (select 1 from public.staff_stepups s where s.id = p_staff and s.user_id = p_uid and s.expires_at > now())
           and exists (select 1 from public.partner_stepups s where s.id = p_partner_stepup and s.user_id = p_uid and s.partner_member_id = p.member_id and s.expires_at > now())))
$$;--> statement-breakpoint
create or replace function app_studio_partner(p_uid uuid, p_session uuid, p_staff_hash text, p_partner_hash text) returns uuid
  language plpgsql volatile security definer set search_path = '' as $$
declare v_t uuid := public.app_current_tenant(); v_staff uuid; v_ps uuid; m record;
begin
  if v_t is null or p_uid is null or p_session is null then return null; end if;
  select s.id into v_staff from public.staff_stepups s
   where s.user_id = p_uid and s.session_id = p_session and s.token_hash = p_staff_hash and s.expires_at > now() order by s.created_at desc limit 1;
  select s.id into v_ps from public.partner_stepups s
   where s.user_id = p_uid and s.session_id = p_session and s.token_hash = p_partner_hash and s.expires_at > now() order by s.created_at desc limit 1;
  -- Passkeys off (0171): the person alone binds, with no step-up; a turn then re-checks the person only.
  if v_staff is null or v_ps is null then
    if not public.app_passkeys_off() then return null; end if;
    v_staff := null; v_ps := null;
  end if;
  select x.* into m from public.app_studio_proved(p_uid, v_t, v_staff, v_ps) x;
  if m.partner_id is null then return null; end if;
  perform public.app_studio_write_bind(v_t, m.partner_id, p_uid, m.member_id, v_staff, v_ps);
  return m.partner_id;
end $$;--> statement-breakpoint
create or replace function app_studio_new_session() returns uuid
  language plpgsql volatile security definer set search_path = '' as $$
declare b record; v uuid;
begin
  select x.* into b from public.app_studio_bound() x;
  if b.token is null or (b.staff_stepup_id is null and not public.app_passkeys_off()) then raise exception 'not_bound' using errcode = 'P0001'; end if;
  insert into public.studio_sessions (tenant_id, partner_id, partner_member_id, user_id)
    values (b.tenant_id, b.partner_id, b.member_id, b.user_id) returning id into v;
  return v;
end $$;--> statement-breakpoint
create or replace function app_studio_open_turn(p_session uuid, p_ceiling bigint, p_person_cap bigint, p_platform_cap bigint, p_open_cap integer) returns uuid
  language plpgsql volatile security definer set search_path = '' as $$
declare b record; s public.studio_sessions; v_turn uuid; pr record; dr record; v_open integer; v_day text; v_new boolean;
begin
  if p_ceiling is null or p_person_cap is null or p_platform_cap is null or p_open_cap is null
     or p_ceiling <= 0 or p_ceiling > 7500000 or p_person_cap > 50000000 or p_platform_cap > 270000000 or p_open_cap > 70 then
    raise exception 'bad_input' using errcode = 'P0001';
  end if;
  s := public.app_studio_own_session(p_session);
  if s.ended_at is not null then raise exception 'not_found' using errcode = 'P0001'; end if;
  select x.* into b from public.app_studio_bound() x;
  if not exists (select 1 from public.app_studio_proved(b.user_id, b.tenant_id, b.staff_stepup_id, b.partner_stepup_id)) then
    raise exception 'not_bound' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.studio_turns t where t.session_id = s.id and t.ended_at is null and t.paused_at is null and t.failed_at is null) then
    raise exception 'turn_open' using errcode = 'P0001';
  end if;
  v_day := to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD');
  v_new := not exists (select 1 from public.studio_turns t where t.session_id = s.id);
  insert into public.studio_spend_people (day, user_id) values (v_day, s.user_id) on conflict do nothing;
  insert into public.studio_spend_days (day) values (v_day) on conflict do nothing;
  select * into pr from public.studio_spend_people where day = v_day and user_id = s.user_id for update;
  select * into dr from public.studio_spend_days where day = v_day for update;
  if v_new then
    select count(*) into v_open from public.studio_sessions x where x.ended_at is null and x.id <> s.id;
    if v_open >= p_open_cap then raise exception 'sessions' using errcode = 'P0001'; end if;
  end if;
  if pr.reserved_micro + pr.measured_micro + p_ceiling > p_person_cap then raise exception 'person_day' using errcode = 'P0001'; end if;
  if dr.reserved_micro + dr.measured_micro + p_ceiling > p_platform_cap then raise exception 'platform_day' using errcode = 'P0001'; end if;
  insert into public.studio_turns (tenant_id, partner_id, session_id) values (s.tenant_id, s.partner_id, s.id) returning id into v_turn;
  insert into public.studio_turn_keys (turn_id, user_id, staff_stepup_id, partner_stepup_id) values (v_turn, s.user_id, b.staff_stepup_id, b.partner_stepup_id);
  insert into public.studio_spend_turns (turn_id, day, user_id, reserved_micro) values (v_turn, v_day, s.user_id, p_ceiling);
  insert into public.studio_spend_sessions (session_id) values (s.id) on conflict do nothing;
  update public.studio_spend_people set reserved_micro = reserved_micro + p_ceiling where day = v_day and user_id = s.user_id;
  update public.studio_spend_days set reserved_micro = reserved_micro + p_ceiling where day = v_day;
  update public.studio_sessions set last_activity_at = now() where id = s.id;
  return v_turn;
end $$;--> statement-breakpoint

-- Give key while off (G·3 amended): the signed-in partner person approves the code with no passkey; every other rule as
-- app_device_code_challenge and app_device_code_give (the code, the person, the network, the store's ceiling, the audit).
create or replace function app_device_code_give_off(p_uid uuid, p_session uuid, p_stepup text, p_code_hash text, p_net text, p_mine boolean) returns text
  language plpgsql volatile security definer set search_path = '' as $$
declare c record; me record; v_email text;
begin
  if not public.app_passkeys_off() then raise exception 'no_challenge' using errcode = 'P0001'; end if;
  if p_session is null then raise exception 'confirm_first' using errcode = 'P0001'; end if;
  perform public.app_partner_need(p_uid, p_session, p_stepup, false);
  select x.id, t.id as tenant_id, t.name, x.start_net into c
    from public.build_key_device_codes x join public.tenants t on t.slug = x.store_slug
   where x.code_hash = p_code_hash and x.expires_at > now() and x.approved_at is null and x.claimed_at is null
   for update of x;
  if c.id is null or not public.app_device_partner_ok(p_uid, c.tenant_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if p_mine is not true and (c.start_net is null or p_net is null or c.start_net <> p_net) then raise exception 'not_mine' using errcode = 'P0001'; end if;
  select x.* into me from public.app_pm_live(p_uid) x;
  perform 1 from public.shop_settings s where s.tenant_id = c.tenant_id for update;
  if public.app_device_store_full(c.tenant_id) then raise exception 'full' using errcode = 'P0001'; end if;
  update public.build_key_device_codes set approved_by = p_uid, approved_at = now(), tenant_id = c.tenant_id where id = c.id;
  select pm.email into v_email from public.partner_members pm where pm.id = me.member_id;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
  values (c.tenant_id, p_uid, left(v_email, 320), 'member', 'build_key.device_confirmed', 'developer', '{"fields":["device"],"passkeys":"off"}'::jsonb);
  return c.name;
end $$;--> statement-breakpoint

revoke all on function app_passkeys_state(), app_admin_passkeys_set(uuid, uuid, text, boolean), app_device_code_give_off(uuid, uuid, text, text, text, boolean)
  from public, anon, authenticated, service_role, frata_app, frata_admin, frata_builder;--> statement-breakpoint
grant execute on function app_passkeys_state() to frata_app, frata_admin;--> statement-breakpoint
grant execute on function app_admin_passkeys_set(uuid, uuid, text, boolean) to frata_admin;--> statement-breakpoint
grant execute on function app_device_code_give_off(uuid, uuid, text, text, text, boolean) to frata_app;
