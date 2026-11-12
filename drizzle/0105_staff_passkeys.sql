CREATE TABLE "staff_enrolment_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "staff_passkey_tries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_passkeys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"credential_id" text NOT NULL,
	"public_key" text NOT NULL,
	"counter" bigint DEFAULT 0 NOT NULL,
	"transports" text[] DEFAULT '{}'::text[] NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "staff_passkeys_name" CHECK (char_length("staff_passkeys"."name") between 1 and 40)
);
--> statement-breakpoint
CREATE TABLE "staff_stepups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"passkey_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_webauthn_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"challenge" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	CONSTRAINT "staff_webauthn_challenges_purpose" CHECK ("staff_webauthn_challenges"."purpose" in ('confirm','add'))
);
--> statement-breakpoint
ALTER TABLE "staff_enrolment_requests" ADD CONSTRAINT "staff_enrolment_requests_user_id_platform_staff_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."platform_staff"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_enrolment_requests" ADD CONSTRAINT "staff_enrolment_requests_approved_by_platform_staff_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."platform_staff"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_passkey_tries" ADD CONSTRAINT "staff_passkey_tries_user_id_platform_staff_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."platform_staff"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_passkeys" ADD CONSTRAINT "staff_passkeys_user_id_platform_staff_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."platform_staff"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_stepups" ADD CONSTRAINT "staff_stepups_user_id_platform_staff_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."platform_staff"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_stepups" ADD CONSTRAINT "staff_stepups_passkey_id_staff_passkeys_id_fk" FOREIGN KEY ("passkey_id") REFERENCES "public"."staff_passkeys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_webauthn_challenges" ADD CONSTRAINT "staff_webauthn_challenges_user_id_platform_staff_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."platform_staff"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_enrolment_requests_user" ON "staff_enrolment_requests" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "staff_passkey_tries_user" ON "staff_passkey_tries" USING btree ("user_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_passkeys_credential" ON "staff_passkeys" USING btree ("credential_id");--> statement-breakpoint
CREATE INDEX "staff_passkeys_user" ON "staff_passkeys" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_stepups_token" ON "staff_stepups" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "staff_stepups_user" ON "staff_stepups" USING btree ("user_id","session_id");--> statement-breakpoint
CREATE INDEX "staff_webauthn_challenges_user" ON "staff_webauthn_challenges" USING btree ("user_id","session_id");--> statement-breakpoint
-- ═══ STAFF PASSKEYS (docs/specs/2026-11-12-staff-passkeys.md; ADR-0007 amended 2026-11-12) ═══════════════════════
-- Platform rows, no tenant: NO role holds any privilege (not frata_app, not frata_admin); a restrictive deny-all policy
-- under RLS; every read and write through the app_staff_* definers below (EXECUTE: frata_admin only, except
-- app_access_for and app_staff_signout for frata_app). Each definer re-checks platform_staff for the caller.
alter table staff_passkeys enable row level security;--> statement-breakpoint
alter table staff_enrolment_requests enable row level security;--> statement-breakpoint
alter table staff_webauthn_challenges enable row level security;--> statement-breakpoint
alter table staff_stepups enable row level security;--> statement-breakpoint
alter table staff_passkey_tries enable row level security;--> statement-breakpoint
revoke all on staff_passkeys, staff_enrolment_requests, staff_webauthn_challenges, staff_stepups, staff_passkey_tries
  from public, anon, authenticated, service_role, frata_app, frata_admin;--> statement-breakpoint
create policy definer_only on staff_passkeys as restrictive for all to public using (false) with check (false);--> statement-breakpoint
create policy definer_only on staff_enrolment_requests as restrictive for all to public using (false) with check (false);--> statement-breakpoint
create policy definer_only on staff_webauthn_challenges as restrictive for all to public using (false) with check (false);--> statement-breakpoint
create policy definer_only on staff_stepups as restrictive for all to public using (false) with check (false);--> statement-breakpoint
create policy definer_only on staff_passkey_tries as restrictive for all to public using (false) with check (false);--> statement-breakpoint

-- A live step-up for (user, session, token hash): the one rule, read by app_access_for and every definer below.
create or replace function app_staff_live_stepup(p_uid uuid, p_session uuid, p_hash text) returns timestamptz
  language sql stable security definer set search_path = '' as $$
  select s.created_at from public.staff_stepups s join public.platform_staff ps on ps.user_id = s.user_id
   where s.user_id = p_uid and s.session_id = p_session and s.token_hash = p_hash and s.expires_at > now()
   order by s.created_at desc limit 1
$$;--> statement-breakpoint

-- Tries: 5 per session in 10 minutes, 20 per person an hour. Counted before the work; fails closed.
create or replace function app_staff_try(p_uid uuid, p_session uuid) returns void
  language plpgsql security definer set search_path = '' as $$
begin
  delete from public.staff_passkey_tries where at < now() - interval '1 day';
  if (select count(*) from public.staff_passkey_tries t where t.user_id = p_uid and t.session_id = p_session and t.at > now() - interval '10 minutes') >= 5
     or (select count(*) from public.staff_passkey_tries t where t.user_id = p_uid and t.at > now() - interval '1 hour') >= 20 then
    raise exception 'too_many' using errcode = 'P0001';
  end if;
  insert into public.staff_passkey_tries (user_id, session_id) values (p_uid, p_session);
end $$;--> statement-breakpoint

-- ── Who may reach what: the step-up joins the access answer every signed-in request already asks for (no extra round
-- trip). A support visit counts only while this browser session holds a live step-up (security review B1).
drop function if exists app_access_for(uuid);--> statement-breakpoint
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
        ) u
        order by u.tenant_id, u.pref
      ) d), '[]'::jsonb))
$$;--> statement-breakpoint

-- What the gate screen needs: does this person have a passkey; is this session's request open or approved.
create or replace function app_staff_state(p_uid uuid, p_session uuid) returns jsonb
  language sql stable security definer set search_path = '' as $$
  select case when not exists (select 1 from public.platform_staff ps where ps.user_id = p_uid) then null else jsonb_build_object(
    'passkeys', (select count(*) from public.staff_passkeys k where k.user_id = p_uid),
    'request', (select jsonb_build_object('expiresAt', r.expires_at, 'approved', r.approved_at is not null,
                         'approvedUntil', r.approved_at + interval '10 minutes', 'approvedBy', (select ps.email from public.platform_staff ps where ps.user_id = r.approved_by))
                  from public.staff_enrolment_requests r
                 where r.user_id = p_uid and r.session_id = p_session and r.used_at is null
                   and (r.approved_at is null and r.expires_at > now() or r.approved_at > now() - interval '10 minutes')
                 order by r.created_at desc limit 1)) end
$$;--> statement-breakpoint

-- A WebAuthn challenge (made by the app, stored here): 'confirm' needs a passkey on file; 'add' needs a live step-up
-- on this session (a second device) or this session's approved request.
create or replace function app_staff_challenge(p_uid uuid, p_session uuid, p_purpose text, p_stepup text, p_challenge text) returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.platform_staff ps where ps.user_id = p_uid) then raise exception 'not_staff' using errcode = 'P0001'; end if;
  if p_purpose not in ('confirm', 'add') or p_challenge is null or length(p_challenge) < 40 then raise exception 'bad_input' using errcode = 'P0001'; end if;
  perform public.app_staff_try(p_uid, p_session);
  if p_purpose = 'confirm' and not exists (select 1 from public.staff_passkeys k where k.user_id = p_uid) then
    raise exception 'no_passkey' using errcode = 'P0001';
  end if;
  if p_purpose = 'add' and public.app_staff_live_stepup(p_uid, p_session, p_stepup) is null and not exists (
      select 1 from public.staff_enrolment_requests r where r.user_id = p_uid and r.session_id = p_session and r.used_at is null
         and r.approved_at > now() - interval '10 minutes') then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  delete from public.staff_webauthn_challenges c where c.user_id = p_uid and c.session_id = p_session and (c.purpose = p_purpose or c.expires_at < now());
  insert into public.staff_webauthn_challenges (user_id, session_id, purpose, challenge, expires_at)
    values (p_uid, p_session, p_purpose, p_challenge, now() + interval '5 minutes');
end $$;--> statement-breakpoint

-- The browser answered: mark the challenge it signed as used (once) and give back the key for THIS person's
-- credential — never another person's. Null when the challenge or the credential is not theirs.
create or replace function app_staff_take_challenge(p_uid uuid, p_session uuid, p_purpose text, p_challenge text, p_credential text) returns jsonb
  language plpgsql security definer set search_path = '' as $$
declare n int; k record;
begin
  if not exists (select 1 from public.platform_staff ps where ps.user_id = p_uid) then return null; end if;
  update public.staff_webauthn_challenges c set used_at = now()
   where c.user_id = p_uid and c.session_id = p_session and c.purpose = p_purpose and c.challenge = p_challenge
     and c.used_at is null and c.expires_at > now();
  get diagnostics n = row_count;
  if n = 0 then return null; end if;
  if p_purpose = 'add' then return jsonb_build_object('ok', true); end if;
  select id, public_key, counter, transports into k from public.staff_passkeys
   where user_id = p_uid and credential_id = p_credential;
  if k.id is null then return null; end if;
  return jsonb_build_object('ok', true, 'passkeyId', k.id, 'publicKey', k.public_key, 'counter', k.counter, 'transports', to_jsonb(k.transports));
end $$;--> statement-breakpoint

-- After the app verified the signature: the challenge taken in the last 2 minutes is consumed, the counter only rises
-- (synced passkeys stay at 0), and a 12-hour step-up is made, its expiry set here.
create or replace function app_staff_confirm(p_uid uuid, p_session uuid, p_passkey uuid, p_counter bigint, p_token_hash text) returns timestamptz
  language plpgsql security definer set search_path = '' as $$
declare n int; v_email text; v_name text; v_counter bigint; v_at timestamptz;
begin
  select ps.email into v_email from public.platform_staff ps where ps.user_id = p_uid;
  if v_email is null then raise exception 'not_staff' using errcode = 'P0001'; end if;
  delete from public.staff_webauthn_challenges c where c.user_id = p_uid and c.session_id = p_session and c.purpose = 'confirm'
     and c.used_at > now() - interval '2 minutes';
  get diagnostics n = row_count;
  if n = 0 then raise exception 'no_challenge' using errcode = 'P0001'; end if;
  select k.name, k.counter into v_name, v_counter from public.staff_passkeys k where k.id = p_passkey and k.user_id = p_uid for update;
  if v_name is null then raise exception 'no_passkey' using errcode = 'P0001'; end if;
  if not (p_counter > v_counter or (p_counter = 0 and v_counter = 0)) then raise exception 'replay' using errcode = 'P0001'; end if;
  update public.staff_passkeys set counter = p_counter, last_used_at = now() where id = p_passkey;
  delete from public.staff_stepups s where s.user_id = p_uid and (s.session_id = p_session or s.expires_at < now());
  insert into public.staff_stepups (user_id, session_id, passkey_id, token_hash, expires_at)
    values (p_uid, p_session, p_passkey, p_token_hash, now() + interval '12 hours') returning created_at into v_at;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    values (null, p_uid, v_email, 'staff', 'staff.passkey.confirm', v_email, jsonb_build_object('passkey', v_name));
  return v_at;
end $$;--> statement-breakpoint

-- Add a passkey after the app verified the registration: the 'add' challenge taken in the last 2 minutes, and either a
-- live step-up on this session or this session's approved request (used now, once). At most 10 passkeys a person.
create or replace function app_staff_add_passkey(p_uid uuid, p_session uuid, p_stepup text, p_credential text, p_public_key text,
  p_counter bigint, p_transports text[], p_name text) returns uuid
  language plpgsql security definer set search_path = '' as $$
declare n int; v_email text; v_req uuid; v_by uuid; v_id uuid; v_via text;
begin
  select ps.email into v_email from public.platform_staff ps where ps.user_id = p_uid;
  if v_email is null then raise exception 'not_staff' using errcode = 'P0001'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 40 then raise exception 'bad_name' using errcode = 'P0001'; end if;
  delete from public.staff_webauthn_challenges c where c.user_id = p_uid and c.session_id = p_session and c.purpose = 'add'
     and c.used_at > now() - interval '2 minutes';
  get diagnostics n = row_count;
  if n = 0 then raise exception 'no_challenge' using errcode = 'P0001'; end if;
  if public.app_staff_live_stepup(p_uid, p_session, p_stepup) is not null then
    v_via := 'second_device';
  else
    update public.staff_enrolment_requests r set used_at = now()
     where r.id = (select r2.id from public.staff_enrolment_requests r2 where r2.user_id = p_uid and r2.session_id = p_session
                     and r2.used_at is null and r2.approved_at > now() - interval '10 minutes' order by r2.approved_at desc limit 1)
    returning r.id, r.approved_by into v_req, v_by;
    if v_req is null then raise exception 'not_allowed' using errcode = 'P0001'; end if;
    v_via := 'approved';
  end if;
  if (select count(*) from public.staff_passkeys k where k.user_id = p_uid) >= 10 then raise exception 'too_many_passkeys' using errcode = 'P0001'; end if;
  begin
    insert into public.staff_passkeys (user_id, credential_id, public_key, counter, transports, name)
      values (p_uid, p_credential, p_public_key, greatest(p_counter, 0), coalesce(p_transports, '{}'), btrim(p_name)) returning id into v_id;
  exception when unique_violation then raise exception 'duplicate' using errcode = 'P0001';
  end;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    values (null, p_uid, v_email, 'staff', 'staff.passkey.add', v_email, jsonb_build_object('name', btrim(p_name), 'via', v_via,
            'approvedBy', (select ps.email from public.platform_staff ps where ps.user_id = v_by)));
  return v_id;
end $$;--> statement-breakpoint

-- "Let me add a passkey": this session's request, with the hash of the code its screen shows (15 minutes).
create or replace function app_staff_request(p_uid uuid, p_session uuid, p_code_hash text) returns timestamptz
  language plpgsql security definer set search_path = '' as $$
declare v_email text; v_exp timestamptz;
begin
  select ps.email into v_email from public.platform_staff ps where ps.user_id = p_uid;
  if v_email is null then raise exception 'not_staff' using errcode = 'P0001'; end if;
  perform public.app_staff_try(p_uid, p_session);
  delete from public.staff_enrolment_requests r where r.user_id = p_uid and r.used_at is null and r.approved_at is null;
  insert into public.staff_enrolment_requests (user_id, session_id, code_hash, expires_at)
    values (p_uid, p_session, p_code_hash, now() + interval '15 minutes') returning expires_at into v_exp;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    values (null, p_uid, v_email, 'staff', 'staff.passkey.request', v_email, null);
  return v_exp;
end $$;--> statement-breakpoint

-- An admin approves another person's open request by typing the code that person reads out. The admin must have
-- confirmed with a passkey on this session in the last 5 minutes; never their own request. Returns the person's email.
create or replace function app_staff_approve(p_admin uuid, p_session uuid, p_stepup text, p_email text, p_code_hash text) returns text
  language plpgsql security definer set search_path = '' as $$
declare v_admin_email text; v_role text; v_conf timestamptz; v_target uuid; v_req uuid;
begin
  select ps.email, ps.role into v_admin_email, v_role from public.platform_staff ps where ps.user_id = p_admin;
  if v_role is distinct from 'admin' then raise exception 'not_admin' using errcode = 'P0001'; end if;
  v_conf := public.app_staff_live_stepup(p_admin, p_session, p_stepup);
  if v_conf is null or v_conf < now() - interval '5 minutes' then raise exception 'confirm_first' using errcode = 'P0001'; end if;
  select ps.user_id into v_target from public.platform_staff ps where ps.email = lower(btrim(p_email));
  if v_target is null then raise exception 'not_staff' using errcode = 'P0001'; end if;
  if v_target = p_admin then raise exception 'own_request' using errcode = 'P0001'; end if;
  perform public.app_staff_try(p_admin, p_session);
  update public.staff_enrolment_requests r set approved_by = p_admin, approved_at = now()
   where r.id = (select r2.id from public.staff_enrolment_requests r2 where r2.user_id = v_target and r2.used_at is null
                   and r2.approved_at is null and r2.expires_at > now() and r2.code_hash = p_code_hash order by r2.created_at desc limit 1)
  returning r.id into v_req;
  if v_req is null then raise exception 'bad_code' using errcode = 'P0001'; end if;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    values (null, p_admin, v_admin_email, 'staff', 'staff.passkey.approve', lower(btrim(p_email)), null);
  return lower(btrim(p_email));
end $$;--> statement-breakpoint

-- Remove a passkey (your own, or anyone's as an admin), after a passkey check in the last 5 minutes. Its step-ups go
-- with it (on delete cascade). Nobody may remove their last passkey while it is the one they are signed in with.
create or replace function app_staff_remove_passkey(p_uid uuid, p_session uuid, p_stepup text, p_passkey uuid) returns text
  language plpgsql security definer set search_path = '' as $$
declare v_email text; v_role text; v_conf timestamptz; v_owner uuid; v_name text; v_owner_email text;
begin
  select ps.email, ps.role into v_email, v_role from public.platform_staff ps where ps.user_id = p_uid;
  if v_email is null then raise exception 'not_staff' using errcode = 'P0001'; end if;
  v_conf := public.app_staff_live_stepup(p_uid, p_session, p_stepup);
  if v_conf is null or v_conf < now() - interval '5 minutes' then raise exception 'confirm_first' using errcode = 'P0001'; end if;
  select k.user_id, k.name into v_owner, v_name from public.staff_passkeys k where k.id = p_passkey;
  if v_owner is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if v_owner <> p_uid and v_role <> 'admin' then raise exception 'not_admin' using errcode = 'P0001'; end if;
  if exists (select 1 from public.staff_stepups s where s.passkey_id = p_passkey and s.user_id = p_uid and s.session_id = p_session) then
    raise exception 'in_use' using errcode = 'P0001';
  end if;
  select ps.email into v_owner_email from public.platform_staff ps where ps.user_id = v_owner;
  delete from public.staff_passkeys where id = p_passkey;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    values (null, p_uid, v_email, 'staff', 'staff.passkey.remove', v_owner_email, jsonb_build_object('name', v_name));
  return v_owner_email;
end $$;--> statement-breakpoint

-- Admin › Staff: each person's passkeys (no keys, credential ids or counters) and open requests. A live step-up is
-- required; support staff see only their own row.
create or replace function app_staff_list(p_uid uuid, p_session uuid, p_stepup text) returns jsonb
  language plpgsql stable security definer set search_path = '' as $$
declare v_role text;
begin
  select ps.role into v_role from public.platform_staff ps where ps.user_id = p_uid;
  if v_role is null or public.app_staff_live_stepup(p_uid, p_session, p_stepup) is null then raise exception 'confirm_first' using errcode = 'P0001'; end if;
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

-- Sign-out ends the step-up first (by its cookie's hash; harmless for anyone else's hash).
create or replace function app_staff_signout(p_token_hash text) returns void
  language sql security definer set search_path = '' as $$
  delete from public.staff_stepups where token_hash = p_token_hash
$$;--> statement-breakpoint

-- The owner's break-glass, run in Supabase's SQL editor (no app role may call it): approves the newest open request
-- of a staff member, for the very first admin or an only admin with no device left. Audited.
create or replace function app_staff_bootstrap(p_email text) returns text
  language plpgsql security definer set search_path = '' as $$
declare v_uid uuid; v_req uuid;
begin
  select ps.user_id into v_uid from public.platform_staff ps where ps.email = lower(btrim(p_email));
  if v_uid is null then raise exception 'not_staff' using errcode = 'P0001'; end if;
  update public.staff_enrolment_requests r set approved_at = now()
   where r.id = (select r2.id from public.staff_enrolment_requests r2 where r2.user_id = v_uid and r2.used_at is null
                   and r2.approved_at is null and r2.expires_at > now() order by r2.created_at desc limit 1)
  returning r.id into v_req;
  if v_req is null then raise exception 'no_request' using errcode = 'P0001'; end if;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    values (null, v_uid, lower(btrim(p_email)), 'staff', 'staff.passkey.bootstrap', lower(btrim(p_email)), jsonb_build_object('by', 'owner (SQL)'));
  return 'approved for 10 minutes';
end $$;--> statement-breakpoint

revoke all on function app_access_for(uuid, uuid, text), app_staff_live_stepup(uuid, uuid, text), app_staff_try(uuid, uuid),
  app_staff_state(uuid, uuid), app_staff_challenge(uuid, uuid, text, text, text), app_staff_take_challenge(uuid, uuid, text, text, text),
  app_staff_confirm(uuid, uuid, uuid, bigint, text), app_staff_add_passkey(uuid, uuid, text, text, text, bigint, text[], text),
  app_staff_request(uuid, uuid, text), app_staff_approve(uuid, uuid, text, text, text), app_staff_remove_passkey(uuid, uuid, text, uuid),
  app_staff_list(uuid, uuid, text), app_staff_signout(text), app_staff_bootstrap(text)
  from public, anon, authenticated, service_role, frata_app, frata_admin;--> statement-breakpoint
grant execute on function app_access_for(uuid, uuid, text), app_staff_signout(text) to frata_app;--> statement-breakpoint
grant execute on function app_staff_state(uuid, uuid), app_staff_challenge(uuid, uuid, text, text, text), app_staff_take_challenge(uuid, uuid, text, text, text),
  app_staff_confirm(uuid, uuid, uuid, bigint, text), app_staff_add_passkey(uuid, uuid, text, text, text, bigint, text[], text),
  app_staff_request(uuid, uuid, text), app_staff_approve(uuid, uuid, text, text, text), app_staff_remove_passkey(uuid, uuid, text, uuid),
  app_staff_list(uuid, uuid, text) to frata_admin;
