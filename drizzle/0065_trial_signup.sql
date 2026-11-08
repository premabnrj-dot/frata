-- =============================================================================
-- TRIALS TR1·5: A TRIAL AT SIGN-UP (spec docs/specs/2026-11-08-trials.md; plan docs/plans/2026-11-08-trials.md § Review
-- findings T1, T2, R2, R3, R5, A6 — binding). Hand-written.
--
-- app_create_shop_v2 replaces app_create_shop for /start (the old 5-argument function stays until a later migration
-- drops it, A6): the shop starts on the plan the brand chose, and gets a trial — terms frozen from trial_settings — only
-- when no business key it brings has had one. The keys are VERIFIED only (T1): the email HMAC the app computes from
-- getUser() (the secret is not in the database), and the phone from a sign-up code this person verified (R3: the
-- function takes the code's id, never a phone hash). Claims are made here, inside the definer (T2): no app role may
-- write or read trial_claims. Without a claimable key (no secret configured) there is no trial: fail closed.
-- signup_codes: platform rows (no tenant), definers only (R2); the code itself is never stored, only its HMAC.
-- =============================================================================
alter table signup_codes enable row level security;
--> statement-breakpoint
revoke all on signup_codes from public, anon, authenticated, service_role;
--> statement-breakpoint
create policy definer_only on signup_codes as restrictive for all to public using (false) with check (false);
--> statement-breakpoint
create index signup_codes_user on signup_codes (user_id, created_at);
--> statement-breakpoint
-- ── A code for this person's phone (the app rate-limits per person, phone and IP first; this caps 5 an hour too). ──
create or replace function app_signup_code_issue(p_uid uuid, p_phone_hmac text, p_code_hmac text, p_key_version smallint) returns uuid
  language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_uid is null or coalesce(p_phone_hmac, '') = '' or coalesce(p_code_hmac, '') = '' then raise exception 'code: missing' using errcode = 'invalid_parameter_value'; end if;
  if not exists (select 1 from auth.users u where u.id = p_uid and u.email_confirmed_at is not null) then raise exception 'code: confirm your email first' using errcode = 'insufficient_privilege'; end if;
  if (select count(*) from public.signup_codes c where c.user_id = p_uid and c.created_at > now() - interval '1 hour') >= 5 then
    raise exception 'code: too many codes; try again in an hour' using errcode = 'check_violation'; end if;
  insert into public.signup_codes (user_id, phone_hmac, code_hmac, key_version, expires_at)
    values (p_uid, p_phone_hmac, p_code_hmac, p_key_version, now() + interval '10 minutes') returning id into v_id;
  return v_id;
end $$;
--> statement-breakpoint
-- ── Check a code: this person's, unexpired, at most 5 tries. True once; the row is then verified (not yet consumed). ──
create or replace function app_signup_code_verify(p_uid uuid, p_id uuid, p_code_hmac text) returns boolean
  language plpgsql security definer set search_path = '' as $$
declare c record;
begin
  select * from public.signup_codes where id = p_id and user_id = p_uid for update into c;
  if c.id is null or c.consumed_at is not null or c.expires_at <= now() or c.attempts >= 5 then return false; end if;
  if c.verified_at is not null then return true; end if;
  if c.code_hmac <> p_code_hmac then
    update public.signup_codes set attempts = attempts + 1 where id = p_id;
    return false;
  end if;
  update public.signup_codes set verified_at = now() where id = p_id;
  return true;
end $$;
--> statement-breakpoint
-- ── The shop, on the chosen plan, with a trial when no verified key has had one. Errors as app_create_shop (0008). ──
create or replace function app_create_shop_v2(p_uid uuid, p_name text, p_slug text, p_pickup text, p_sells text[], p_plan text,
  p_email_hmac text, p_key_version smallint, p_code_id uuid) returns table (tenant_id uuid, trial boolean)
  language plpgsql volatile security definer set search_path = '' as $$
declare
  v_email text; v_tenant uuid; v_version uuid; v_name text := btrim(p_name); v_trial boolean := true; c record; ts record;
  v_phone text; v_phone_ver smallint;
begin
  select u.email into v_email from auth.users u where u.id = p_uid and u.email_confirmed_at is not null;
  if v_email is null then raise exception 'email_unconfirmed' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext('create_shop:' || p_uid::text));
  if exists (select 1 from public.members m where m.user_id = p_uid and m.role = 'owner') then raise exception 'has_shop' using errcode = 'P0001'; end if;
  if v_name = '' or length(v_name) > 60 then raise exception 'bad_name' using errcode = 'P0001'; end if;
  if p_slug !~ '^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])$' or p_slug ~ '--' then raise exception 'bad_slug' using errcode = 'P0001'; end if;
  if p_pickup !~ '^[1-9][0-9]{5}$' then raise exception 'bad_pincode' using errcode = 'P0001'; end if;
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
  insert into public.shop_settings (tenant_id, pickup_pincode, sells, support_email) values (v_tenant, p_pickup, coalesce(p_sells, '{}'), v_email);
  if v_trial then
    select * from public.trial_settings where id = 1 into ts;
    insert into public.shop_trials (tenant_id, days, open_window_days, signed_up_at) values (v_tenant, ts.days, ts.open_window_days, now());
    insert into public.trial_claims (kind, key_hmac, key_version, tenant_id) values ('email', p_email_hmac, p_key_version, v_tenant) on conflict do nothing;
    if v_phone is not null then insert into public.trial_claims (kind, key_hmac, key_version, tenant_id) values ('phone', v_phone, v_phone_ver, v_tenant) on conflict do nothing; end if;
  end if;
  -- The plan row's insert trigger carries the trial (app_trial_recompute writes its provisional end).
  insert into public.tenant_plans (tenant_id, plan_version_id, starts_at, created_by) values (v_tenant, v_version, now(), p_uid);
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    values (v_tenant, p_uid, v_email, 'member', 'shop.created', p_slug, jsonb_build_object('pickup', p_pickup, 'sells', p_sells, 'plan', p_plan, 'trial', v_trial));
  return query select v_tenant, v_trial;
end $$;
--> statement-breakpoint
revoke all on function app_signup_code_issue(uuid, text, text, smallint), app_signup_code_verify(uuid, uuid, text),
  app_create_shop_v2(uuid, text, text, text, text[], text, text, smallint, uuid) from public, anon, authenticated, service_role, frata_admin;
--> statement-breakpoint
grant execute on function app_signup_code_issue(uuid, text, text, smallint), app_signup_code_verify(uuid, uuid, text),
  app_create_shop_v2(uuid, text, text, text, text[], text, text, smallint, uuid) to frata_app;
