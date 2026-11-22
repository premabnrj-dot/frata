ALTER TABLE "build_key_device_codes" ADD COLUMN "start_net" text;--> statement-breakpoint
ALTER TABLE "build_key_device_codes" ADD COLUMN "challenge" text;--> statement-breakpoint
ALTER TABLE "build_key_device_codes" ADD COLUMN "challenge_by" uuid;--> statement-breakpoint
ALTER TABLE "build_key_device_codes" ADD COLUMN "challenge_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "build_key_device_codes" ADD COLUMN "challenge_used_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "build_key_device_codes" ADD CONSTRAINT "build_key_device_codes_net" CHECK ("build_key_device_codes"."start_net" is null or "build_key_device_codes"."start_net" ~ '^[0-9a-f]{64}$');--> statement-breakpoint
ALTER TABLE "build_key_device_codes" ADD CONSTRAINT "build_key_device_codes_challenge" CHECK (("build_key_device_codes"."challenge" is null) = ("build_key_device_codes"."challenge_by" is null) and ("build_key_device_codes"."challenge" is null) = ("build_key_device_codes"."challenge_at" is null) and ("build_key_device_codes"."challenge_used_at" is null or "build_key_device_codes"."challenge" is not null));--> statement-breakpoint
-- =============================================================================
-- G·3's page (four screens § 2, owner-approved 2026-11-22; security review folded in). The person at the terminal
-- confirms their OWN code in Partner workspace › Developer: a Partner owner, or a Lead assigned to the store, of the
-- store's linked partner (the build-key maker rule, app_build_key_maker_live); never the store's own people, a Builder,
-- or anyone on a support visit. Give key needs a passkey check made for THIS code (the challenge lives on the code's
-- row), whatever the passkeys-off switch says; the store's ceiling of 50 live build keys (MAX_LIVE_BUILD_KEYS in
-- src/domains/storefront-api/keys.ts) is checked before the approval, under the settings row's lock. The start keeps
-- the CLI's network (a sha256 of its /64 or /24) for the dialog's Started row; ended codes go at the daily cron.
-- 0160's peek and approve (any member with api.manage) are dropped: nothing calls them, and they were the store-side
-- path the security review closed. Every definer here: empty search_path, EXECUTE for frata_app alone (proof § 81).
-- =============================================================================
drop function if exists app_device_code_peek(uuid, text);--> statement-breakpoint
drop function if exists app_device_code_approve(uuid, text, text);--> statement-breakpoint
drop function if exists app_device_code_start(text, text, text);--> statement-breakpoint
create or replace function app_device_code_start(p_device_hash text, p_code_hash text, p_slug text, p_net text default null) returns timestamptz
  language plpgsql volatile security definer set search_path = '' as $$
declare v_at timestamptz;
begin
  if p_device_hash !~ '^[0-9a-f]{64}$' or p_code_hash !~ '^[0-9a-f]{64}$' then raise exception 'bad_shape' using errcode = '22023'; end if;
  if p_net is not null and p_net !~ '^[0-9a-f]{64}$' then raise exception 'bad_shape' using errcode = '22023'; end if;
  -- No answer says whether the store exists (its approval simply never comes): the start is the same for every slug.
  if p_slug !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' then raise exception 'bad_shape' using errcode = '22023'; end if;
  insert into public.build_key_device_codes (device_hash, code_hash, store_slug, expires_at, start_net)
  values (p_device_hash, p_code_hash, p_slug, now() + interval '10 minutes', p_net)
  returning expires_at into v_at;
  return v_at;
end $$;
--> statement-breakpoint
-- Internal (no role): may this person give a key on this store from the partner workspace? A live Partner owner or a
-- Lead of the store's partner, still its member and (a Lead) assigned to it; not a Frrata person on a support visit.
create or replace function app_device_partner_ok(p_uid uuid, p_tenant uuid) returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_pm_live(p_uid) me
                  where me.role in ('owner', 'lead') and public.app_build_key_maker_live(p_tenant, me.partner_id, p_uid))
     and not exists (select 1 from public.support_sessions s where s.staff_user_id = p_uid and s.ended_at is null and s.expires_at > now())
$$;
--> statement-breakpoint
-- Internal (no role): the store's live build keys have reached the ceiling.
create or replace function app_device_store_full(p_tenant uuid) returns boolean
  language sql stable security definer set search_path = '' as $$
  select count(*) >= 50 from public.storefront_keys k
   where k.tenant_id = p_tenant and k.kind = 'build' and k.revoked_at is null and k.expires_at > now()
$$;
--> statement-breakpoint
-- Check code: what the dialog shows, for the person's own live, unconfirmed code on a client store; null for any other
-- (ended, used, unknown, not a client of theirs: one answer, the page never says whether a store exists).
create or replace function app_device_code_look(p_uid uuid, p_session uuid, p_stepup text, p_code_hash text, p_net text) returns jsonb
  language plpgsql stable security definer set search_path = '' as $$
declare c record;
begin
  perform public.app_partner_need(p_uid, p_session, p_stepup, false);
  select t.id as tenant_id, t.name, x.created_at, x.start_net into c
    from public.build_key_device_codes x join public.tenants t on t.slug = x.store_slug
   where x.code_hash = p_code_hash and x.expires_at > now() and x.approved_at is null and x.claimed_at is null;
  if c.tenant_id is null or not public.app_device_partner_ok(p_uid, c.tenant_id) then return null; end if;
  return jsonb_build_object('store', c.name, 'startedAt', c.created_at,
    'sameNetwork', case when c.start_net is null or p_net is null then null else c.start_net = p_net end,
    'full', public.app_device_store_full(c.tenant_id),
    'hasPasskey', exists (select 1 from public.partner_passkeys k join public.app_pm_live(p_uid) me on me.member_id = k.partner_member_id));
end $$;
--> statement-breakpoint
-- Give key, step 1: the challenge the browser signs for THIS code (replacing any earlier one on it).
create or replace function app_device_code_challenge(p_uid uuid, p_session uuid, p_stepup text, p_code_hash text, p_challenge text) returns void
  language plpgsql volatile security definer set search_path = '' as $$
declare c record;
begin
  perform public.app_partner_need(p_uid, p_session, p_stepup, false);
  if p_challenge is null or length(p_challenge) < 40 or length(p_challenge) > 200 then raise exception 'bad_input' using errcode = 'P0001'; end if;
  select x.id, t.id as tenant_id into c
    from public.build_key_device_codes x join public.tenants t on t.slug = x.store_slug
   where x.code_hash = p_code_hash and x.expires_at > now() and x.approved_at is null and x.claimed_at is null
   for update of x;
  if c.id is null or not public.app_device_partner_ok(p_uid, c.tenant_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.partner_passkeys k join public.app_pm_live(p_uid) me on me.member_id = k.partner_member_id) then
    raise exception 'no_passkey' using errcode = 'P0001';
  end if;
  update public.build_key_device_codes set challenge = p_challenge, challenge_by = p_uid, challenge_at = now(), challenge_used_at = null where id = c.id;
end $$;
--> statement-breakpoint
-- Give key, step 2: marks the challenge taken (once, within 5 minutes, by the person who asked for it) and gives back
-- THIS person's key for the credential the browser used; null otherwise. No partner-session check here (as 0129's take):
-- it matches challenge_by, and give, which writes, checks the session and the person again.
create or replace function app_device_code_take(p_uid uuid, p_session uuid, p_code_hash text, p_challenge text, p_credential text) returns jsonb
  language plpgsql volatile security definer set search_path = '' as $$
declare n int; k record;
begin
  if p_session is null then return null; end if;
  update public.build_key_device_codes x set challenge_used_at = now()
   where x.code_hash = p_code_hash and x.challenge = p_challenge and x.challenge_by = p_uid and x.challenge_used_at is null
     and x.challenge_at > now() - interval '5 minutes' and x.expires_at > now() and x.approved_at is null and x.claimed_at is null;
  get diagnostics n = row_count;
  if n = 0 then return null; end if;
  select pk.id, pk.public_key, pk.counter, pk.transports into k
    from public.partner_passkeys pk join public.app_pm_live(p_uid) me on me.member_id = pk.partner_member_id
   where pk.credential_id = p_credential;
  if k.id is null then return null; end if;
  return jsonb_build_object('ok', true, 'passkeyId', k.id, 'publicKey', k.public_key, 'counter', k.counter, 'transports', to_jsonb(k.transports));
end $$;
--> statement-breakpoint
-- Give key, step 3 (after the app verified the signature): the challenge taken in the last 2 minutes on this code by this
-- person, the counter only rising, the person still allowed, the store under its ceiling (its settings row locked, as
-- mintBuildKey locks it); then the approval and the store's audit row, one transaction. Returns the store's name.
create or replace function app_device_code_give(p_uid uuid, p_session uuid, p_stepup text, p_code_hash text, p_challenge text, p_passkey uuid, p_counter bigint) returns text
  language plpgsql volatile security definer set search_path = '' as $$
declare c record; me record; v_counter bigint; v_email text;
begin
  perform public.app_partner_need(p_uid, p_session, p_stepup, false);
  select x.id, t.id as tenant_id, t.name into c
    from public.build_key_device_codes x join public.tenants t on t.slug = x.store_slug
   where x.code_hash = p_code_hash and x.challenge = p_challenge and x.challenge_by = p_uid
     and x.challenge_used_at > now() - interval '2 minutes' and x.expires_at > now() and x.approved_at is null and x.claimed_at is null
   for update of x;
  if c.id is null then raise exception 'no_challenge' using errcode = 'P0001'; end if;
  if not public.app_device_partner_ok(p_uid, c.tenant_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  select x.* into me from public.app_pm_live(p_uid) x;
  select k.counter into v_counter from public.partner_passkeys k where k.id = p_passkey and k.partner_member_id = me.member_id for update;
  if v_counter is null then raise exception 'replay' using errcode = 'P0001'; end if;
  if not (p_counter > v_counter or (p_counter = 0 and v_counter = 0)) then raise exception 'replay' using errcode = 'P0001'; end if;
  update public.partner_passkeys set counter = p_counter, last_used_at = now() where id = p_passkey;
  perform 1 from public.shop_settings s where s.tenant_id = c.tenant_id for update;
  if public.app_device_store_full(c.tenant_id) then raise exception 'full' using errcode = 'P0001'; end if;
  update public.build_key_device_codes set approved_by = p_uid, approved_at = now(), tenant_id = c.tenant_id where id = c.id;
  select pm.email into v_email from public.partner_members pm where pm.id = me.member_id;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
  values (c.tenant_id, p_uid, left(v_email, 320), 'member', 'build_key.device_confirmed', 'developer', '{"fields":["device","passkey"]}'::jsonb);
  return c.name;
end $$;
--> statement-breakpoint
-- Your computers: the person's own live developer keys on their partner's client stores (newest first, at most 100).
create or replace function app_partner_developer_keys(p_uid uuid, p_session uuid, p_stepup text) returns jsonb
  language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.app_partner_need(p_uid, p_session, p_stepup, false);
  return coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'store', t.name, 'createdAt', k.created_at, 'expiresAt', k.expires_at) order by k.created_at desc)
    from (select k.* from public.storefront_keys k join public.app_pm_live(p_uid) me on me.partner_id = k.partner_id
           where k.kind = 'build' and k.purpose = 'developer' and k.created_by = p_uid and k.revoked_at is null and k.expires_at > now()
           order by k.created_at desc limit 100) k
    join public.tenants t on t.id = k.tenant_id), '[]'::jsonb);
end $$;
--> statement-breakpoint
-- Delete key from Your computers: the person's own live developer key, revoked at once (the header tree reads it
-- uncached), with the store's audit row. False when there is no such key (deleted already, or never theirs).
create or replace function app_partner_developer_key_delete(p_uid uuid, p_session uuid, p_stepup text, p_key uuid) returns boolean
  language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_email text;
begin
  perform public.app_partner_need(p_uid, p_session, p_stepup, false);
  update public.storefront_keys k set revoked_at = now(), revoked_by = p_uid
    from public.app_pm_live(p_uid) me
   where k.id = p_key and k.partner_id = me.partner_id and k.created_by = p_uid and k.kind = 'build' and k.purpose = 'developer'
     and k.revoked_at is null and k.expires_at > now()
  returning k.tenant_id into v_tenant;
  if v_tenant is null then return false; end if;
  select pm.email into v_email from public.partner_members pm join public.app_pm_live(p_uid) me on me.member_id = pm.id;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
  values (v_tenant, p_uid, left(v_email, 320), 'member', 'storefront_key.delete', p_key::text, '{"fields":["revoked_at"]}'::jsonb);
  return true;
end $$;
--> statement-breakpoint
-- The daily cron: ended build keys, as 0160; device codes once ended (a code's network and challenge never outlive the
-- first run after its 10 minutes, so at most a day).
create or replace function app_delete_ended_build_keys() returns integer
  language sql volatile security definer set search_path = '' as $$
  with gone as (delete from public.storefront_keys where kind = 'build' and expires_at <= now() returning 1),
       codes as (delete from public.build_key_device_codes where expires_at <= now() returning 1)
  select (select count(*)::integer from gone)
$$;
--> statement-breakpoint
revoke all on function app_device_code_start(text, text, text, text), app_device_partner_ok(uuid, uuid), app_device_store_full(uuid),
  app_device_code_look(uuid, uuid, text, text, text), app_device_code_challenge(uuid, uuid, text, text, text),
  app_device_code_take(uuid, uuid, text, text, text), app_device_code_give(uuid, uuid, text, text, text, uuid, bigint),
  app_partner_developer_keys(uuid, uuid, text), app_partner_developer_key_delete(uuid, uuid, text, uuid), app_delete_ended_build_keys()
  from public, anon, authenticated, service_role, frata_admin, frata_builder, frata_app;
--> statement-breakpoint
grant execute on function app_device_code_start(text, text, text, text), app_device_code_look(uuid, uuid, text, text, text),
  app_device_code_challenge(uuid, uuid, text, text, text), app_device_code_take(uuid, uuid, text, text, text),
  app_device_code_give(uuid, uuid, text, text, text, uuid, bigint), app_partner_developer_keys(uuid, uuid, text),
  app_partner_developer_key_delete(uuid, uuid, text, uuid), app_delete_ended_build_keys() to frata_app;
