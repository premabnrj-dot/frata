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
CREATE TABLE "staff_notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"to_email" text NOT NULL,
	"kind" text NOT NULL,
	"about" text NOT NULL,
	"by_email" text,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone,
	"claimed_at" timestamp with time zone,
	"last_error" text,
	CONSTRAINT "staff_notices_kind" CHECK ("staff_notices"."kind" in ('staff_added','staff_removed','request_approved','passkey_added','passkey_removed'))
);
--> statement-breakpoint
CREATE TABLE "staff_passkey_tries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_passkey_tries_kind" CHECK ("staff_passkey_tries"."kind" in ('check','request','approve'))
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
CREATE INDEX "staff_notices_due" ON "staff_notices" USING btree ("created_at") WHERE "staff_notices"."sent_at" is null;--> statement-breakpoint
CREATE INDEX "staff_passkey_tries_user" ON "staff_passkey_tries" USING btree ("user_id","kind","at");--> statement-breakpoint
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
alter table staff_notices enable row level security;--> statement-breakpoint
revoke all on staff_passkeys, staff_enrolment_requests, staff_webauthn_challenges, staff_stepups, staff_passkey_tries, staff_notices
  from public, anon, authenticated, service_role, frata_app, frata_admin;--> statement-breakpoint
create policy definer_only on staff_passkeys as restrictive for all to public using (false) with check (false);--> statement-breakpoint
create policy definer_only on staff_enrolment_requests as restrictive for all to public using (false) with check (false);--> statement-breakpoint
create policy definer_only on staff_webauthn_challenges as restrictive for all to public using (false) with check (false);--> statement-breakpoint
create policy definer_only on staff_stepups as restrictive for all to public using (false) with check (false);--> statement-breakpoint
create policy definer_only on staff_passkey_tries as restrictive for all to public using (false) with check (false);--> statement-breakpoint
create policy definer_only on staff_notices as restrictive for all to public using (false) with check (false);--> statement-breakpoint

-- Security emails (staff passkeys spec § Design 5): one row for the person concerned and one for every admin, written in
-- the transaction of the change. Internal: no role may call it; the definers below do.
create or replace function app_staff_notify(p_kind text, p_about text, p_by text, p_detail text) returns void
  language sql security definer set search_path = '' as $$
  insert into public.staff_notices (to_email, kind, about, by_email, detail)
  select distinct lower(e), p_kind, lower(p_about), lower(p_by), p_detail
    from (select p_about as e union select ps.email from public.platform_staff ps where ps.role = 'admin') x
   where e is not null and e <> ''
$$;--> statement-breakpoint

-- A live step-up for (user, session, token hash): the one rule, read by app_access_for and every definer below.
create or replace function app_staff_live_stepup(p_uid uuid, p_session uuid, p_hash text) returns timestamptz
  language sql stable security definer set search_path = '' as $$
  select s.created_at from public.staff_stepups s join public.platform_staff ps on ps.user_id = s.user_id
   where s.user_id = p_uid and s.session_id = p_session and s.token_hash = p_hash and s.expires_at > now()
   order by s.created_at desc limit 1
$$;--> statement-breakpoint

-- Tries by kind, counted before the work, failing closed: 'check' (a passkey prompt) 20 per session in 10 minutes and
-- 60 per person an hour; 'request' and 'approve' (a wrong code is a guess) 5 and 10.
create or replace function app_staff_try(p_uid uuid, p_session uuid, p_kind text) returns void
  language plpgsql security definer set search_path = '' as $$
declare v_session int := case when p_kind = 'check' then 20 else 5 end; v_person int := case when p_kind = 'check' then 60 else 10 end;
begin
  -- One count at a time per person and kind: parallel calls must not all read the same count (security re-review F3).
  perform pg_advisory_xact_lock(hashtextextended(p_uid::text || ':staff-try:' || p_kind, 0));
  delete from public.staff_passkey_tries where at < now() - interval '1 day';
  if (select count(*) from public.staff_passkey_tries t where t.user_id = p_uid and t.kind = p_kind and t.session_id = p_session and t.at > now() - interval '10 minutes') >= v_session
     or (select count(*) from public.staff_passkey_tries t where t.user_id = p_uid and t.kind = p_kind and t.at > now() - interval '1 hour') >= v_person then
    raise exception 'too_many' using errcode = 'P0001';
  end if;
  insert into public.staff_passkey_tries (user_id, session_id, kind) values (p_uid, p_session, p_kind);
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
  perform public.app_staff_try(p_uid, p_session, 'check');
  if p_purpose = 'confirm' and not exists (select 1 from public.staff_passkeys k where k.user_id = p_uid) then
    raise exception 'no_passkey' using errcode = 'P0001';
  end if;
  if p_purpose = 'add' and coalesce(public.app_staff_live_stepup(p_uid, p_session, p_stepup) > now() - interval '5 minutes', false) is false and not exists (
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
create or replace function app_staff_confirm(p_uid uuid, p_session uuid, p_challenge text, p_passkey uuid, p_counter bigint, p_token_hash text) returns timestamptz
  language plpgsql security definer set search_path = '' as $$
declare n int; v_email text; v_name text; v_counter bigint; v_at timestamptz;
begin
  select ps.email into v_email from public.platform_staff ps where ps.user_id = p_uid;
  if v_email is null then raise exception 'not_staff' using errcode = 'P0001'; end if;
  delete from public.staff_webauthn_challenges c where c.user_id = p_uid and c.session_id = p_session and c.purpose = 'confirm'
     and c.challenge = p_challenge and c.used_at > now() - interval '2 minutes';
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
  if coalesce(public.app_staff_live_stepup(p_uid, p_session, p_stepup) > now() - interval '5 minutes', false) then
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
  perform public.app_staff_notify('passkey_added', v_email, v_email, btrim(p_name));
  return v_id;
end $$;--> statement-breakpoint

-- "Let me add a passkey": this session's request, with the hash of the code its screen shows (15 minutes).
create or replace function app_staff_request(p_uid uuid, p_session uuid, p_code_hash text) returns timestamptz
  language plpgsql security definer set search_path = '' as $$
declare v_email text; v_exp timestamptz;
begin
  select ps.email into v_email from public.platform_staff ps where ps.user_id = p_uid;
  if v_email is null then raise exception 'not_staff' using errcode = 'P0001'; end if;
  perform public.app_staff_try(p_uid, p_session, 'request');
  delete from public.staff_enrolment_requests r where r.user_id = p_uid and r.used_at is null and r.approved_at is null;
  delete from public.staff_enrolment_requests r where r.expires_at < now() - interval '90 days'; -- kept 90 days (F6)
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
  perform public.app_staff_try(p_admin, p_session, 'approve');
  update public.staff_enrolment_requests r set approved_by = p_admin, approved_at = now()
   where r.id = (select r2.id from public.staff_enrolment_requests r2 where r2.user_id = v_target and r2.used_at is null
                   and r2.approved_at is null and r2.expires_at > now() and r2.code_hash = p_code_hash order by r2.created_at desc limit 1)
  returning r.id into v_req;
  -- A wrong code returns null rather than raising, so its counted try is kept (a raise would roll the count back).
  if v_req is null then return null; end if;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    values (null, p_admin, v_admin_email, 'staff', 'staff.passkey.approve', lower(btrim(p_email)), null);
  perform public.app_staff_notify('request_approved', lower(btrim(p_email)), v_admin_email, null);
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
  perform public.app_staff_notify('passkey_removed', v_owner_email, v_email, v_name);
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

-- The owner's break-glass, run in Supabase's SQL editor (no app role may call it): approves the open request of a
-- staff member whose 6-digit code the owner reads on their own screen, for the very first admin or an only admin with
-- no device left. The code matters: without it, whoever holds that person's sign-in could ask just before the owner
-- runs this and be approved instead (security re-review F5). Audited.
create or replace function app_staff_bootstrap(p_email text, p_code text) returns text
  language plpgsql security definer set search_path = '' as $$
declare v_uid uuid; v_req uuid;
  v_hash text := encode(sha256(convert_to('staff-enrol:' || regexp_replace(coalesce(p_code, ''), '\D', '', 'g'), 'UTF8')), 'hex');
begin
  select ps.user_id into v_uid from public.platform_staff ps where ps.email = lower(btrim(p_email));
  if v_uid is null then raise exception 'not_staff' using errcode = 'P0001'; end if;
  update public.staff_enrolment_requests r set approved_at = now()
   where r.user_id = v_uid and r.used_at is null and r.approved_at is null and r.expires_at > now() and r.code_hash = v_hash
  returning r.id into v_req;
  if v_req is null then raise exception 'no_request_with_that_code' using errcode = 'P0001'; end if;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    values (null, v_uid, lower(btrim(p_email)), 'staff', 'staff.passkey.bootstrap', lower(btrim(p_email)), jsonb_build_object('by', 'owner (SQL)'));
  perform public.app_staff_notify('request_approved', lower(btrim(p_email)), 'owner (SQL)', null);
  return 'approved for 10 minutes';
end $$;--> statement-breakpoint

-- Staff added or removed (src/lib/admin/staff.ts, in its transaction): the emails, after checking the actor is an admin.
create or replace function app_staff_changed(p_actor uuid, p_kind text, p_about text) returns void
  language plpgsql security definer set search_path = '' as $$
declare v_by text;
begin
  select ps.email into v_by from public.platform_staff ps where ps.user_id = p_actor and ps.role = 'admin';
  if v_by is null then raise exception 'not_admin' using errcode = 'P0001'; end if;
  if p_kind not in ('staff_added', 'staff_removed') then raise exception 'bad_input' using errcode = 'P0001'; end if;
  perform public.app_staff_notify(p_kind, p_about, v_by, null);
end $$;--> statement-breakpoint

-- The 5-minute drain and the send right after a change: claim up to p_limit unsent emails (5 tries each), then settle
-- each. A claim holds its rows for 2 minutes, so the two senders never send one email twice (security re-review F4).
-- Sent and given-up rows are kept 90 days (F6).
create or replace function app_staff_notices_claim(p_limit int) returns table (id uuid, to_email text, kind text, about text, by_email text, detail text, created_at timestamptz)
  language sql security definer set search_path = '' as $$
  with gone as (delete from public.staff_notices o where o.created_at < now() - interval '90 days' and (o.sent_at is not null or o.attempts >= 5))
  update public.staff_notices n set attempts = n.attempts + 1, claimed_at = now()
   where n.id in (select n2.id from public.staff_notices n2 where n2.sent_at is null and n2.attempts < 5
                   and (n2.claimed_at is null or n2.claimed_at < now() - interval '2 minutes')
                   order by n2.created_at limit least(greatest(p_limit, 1), 50) for update skip locked)
  returning n.id, n.to_email, n.kind, n.about, n.by_email, n.detail, n.created_at
$$;--> statement-breakpoint
create or replace function app_staff_notices_settle(p_id uuid, p_ok boolean, p_error text) returns void
  language sql security definer set search_path = '' as $$
  update public.staff_notices set sent_at = case when p_ok then now() end, last_error = case when p_ok then null else left(p_error, 48) end
   where id = p_id and sent_at is null
$$;--> statement-breakpoint

revoke all on function app_access_for(uuid, uuid, text), app_staff_live_stepup(uuid, uuid, text), app_staff_try(uuid, uuid, text),
  app_staff_state(uuid, uuid), app_staff_challenge(uuid, uuid, text, text, text), app_staff_take_challenge(uuid, uuid, text, text, text),
  app_staff_confirm(uuid, uuid, text, uuid, bigint, text), app_staff_add_passkey(uuid, uuid, text, text, text, bigint, text[], text),
  app_staff_request(uuid, uuid, text), app_staff_approve(uuid, uuid, text, text, text), app_staff_remove_passkey(uuid, uuid, text, uuid),
  app_staff_list(uuid, uuid, text), app_staff_signout(text), app_staff_bootstrap(text, text), app_staff_notify(text, text, text, text),
  app_staff_changed(uuid, text, text), app_staff_notices_claim(int), app_staff_notices_settle(uuid, boolean, text)
  from public, anon, authenticated, service_role, frata_app, frata_admin;--> statement-breakpoint
grant execute on function app_access_for(uuid, uuid, text), app_staff_signout(text) to frata_app;--> statement-breakpoint
grant execute on function app_staff_state(uuid, uuid), app_staff_challenge(uuid, uuid, text, text, text), app_staff_take_challenge(uuid, uuid, text, text, text),
  app_staff_confirm(uuid, uuid, text, uuid, bigint, text), app_staff_add_passkey(uuid, uuid, text, text, text, bigint, text[], text),
  app_staff_request(uuid, uuid, text), app_staff_approve(uuid, uuid, text, text, text), app_staff_remove_passkey(uuid, uuid, text, uuid),
  app_staff_list(uuid, uuid, text), app_staff_changed(uuid, text, text),
  -- Only Admin's role reads and settles the staff security emails: they are how a takeover gets noticed (security re-review F2).
  app_staff_notices_claim(int), app_staff_notices_settle(uuid, boolean, text) to frata_admin;
