-- =============================================================================
-- G·3: A DEVELOPER'S DEVICE SIGN-IN FOR A BUILD KEY (Studio plan § G-a; ADR-0018's build-key amendment, point 1; Studio
-- spec § 10). Hand-written; the table, its RLS and its definer-only policy are 0159. Proof: scripts/verify/tenancy.sql § 81.
--
-- The CLI (`npx frrata dev <store>`) starts a sign-in: it holds a long device secret and shows the person a short code.
-- Only their sha256s are stored, with the store the CLI named, for 10 minutes. The person confirms the code signed in to
-- Frrata, with a passkey check in the last 5 minutes (the confirm page waits for its mockup: orchestrator ruling B1);
-- the code binds to that person and that store, and only if they hold a members row there. The CLI's next poll claims it
-- ONCE and the server mints the build key (purpose developer, 24 hours) as that person through mintBuildKey. No Frrata
-- role reads or writes the table: these three definers are the only door, frata_app alone runs them.
--   app_device_code_start(device, code, slug)   a new sign-in, the same answer for any well-formed store slug
--   app_device_code_approve(uid, code)          binds a live, unclaimed code to its store for a member of it
--   app_device_code_claim(device)               the approved code, once: the store and the person
-- Codes past their 10 minutes answer nothing; the daily delete removes them with ended build keys.
-- =============================================================================
create or replace function app_device_code_start(p_device_hash text, p_code_hash text, p_slug text) returns timestamptz
  language plpgsql volatile security definer set search_path = '' as $$
declare v_at timestamptz;
begin
  if p_device_hash !~ '^[0-9a-f]{64}$' or p_code_hash !~ '^[0-9a-f]{64}$' then raise exception 'bad_shape' using errcode = '22023'; end if;
  -- No answer says whether the store exists (its approval simply never comes): the start is the same for every slug.
  if p_slug !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' then raise exception 'bad_shape' using errcode = '22023'; end if;
  insert into public.build_key_device_codes (device_hash, code_hash, store_slug, expires_at)
  values (p_device_hash, p_code_hash, p_slug, now() + interval '10 minutes')
  returning expires_at into v_at;
  return v_at;
end $$;
--> statement-breakpoint
create or replace function app_device_code_approve(p_uid uuid, p_code_hash text) returns uuid
  language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid; v_tenant uuid;
begin
  select c.id, t.id into v_id, v_tenant
    from public.build_key_device_codes c
    join public.tenants t on t.slug = c.store_slug
    join public.members m on m.tenant_id = t.id and m.user_id = p_uid
   where c.code_hash = p_code_hash and c.expires_at > now() and c.approved_at is null and c.claimed_at is null
   for update of c;
  if v_id is null then return null; end if;
  update public.build_key_device_codes set approved_by = p_uid, approved_at = now(), tenant_id = v_tenant where id = v_id;
  return v_tenant;
end $$;
--> statement-breakpoint
create or replace function app_device_code_claim(p_device_hash text) returns table (state text, tenant_id uuid, user_id uuid, role text, email text)
  language plpgsql volatile security definer set search_path = '' as $$
declare c record;
begin
  if p_device_hash !~ '^[0-9a-f]{64}$' then return; end if;
  select x.id, x.tenant_id, x.approved_by, x.approved_at, x.claimed_at, x.expires_at into c
    from public.build_key_device_codes x where x.device_hash = p_device_hash for update;
  if c.id is null or c.expires_at <= now() or c.claimed_at is not null then return; end if;
  if c.approved_at is null then return query select 'pending'::text, null::uuid, null::uuid, null::text, null::text; return; end if;
  update public.build_key_device_codes set claimed_at = now() where id = c.id;
  -- The person as they are now: a members row on the store still (removed since the approval: nothing).
  return query select 'approved'::text, m.tenant_id, m.user_id, m.role, u.email::text
    from public.members m left join auth.users u on u.id = m.user_id
   where m.tenant_id = c.tenant_id and m.user_id = c.approved_by;
end $$;
--> statement-breakpoint
revoke all on function app_device_code_start(text, text, text), app_device_code_approve(uuid, text), app_device_code_claim(text)
  from public, anon, authenticated, service_role, frata_admin, frata_builder;
--> statement-breakpoint
grant execute on function app_device_code_start(text, text, text), app_device_code_approve(uuid, text), app_device_code_claim(text) to frata_app;
--> statement-breakpoint
create or replace function app_delete_ended_build_keys() returns integer
  language sql volatile security definer set search_path = '' as $$
  with gone as (delete from public.storefront_keys where kind = 'build' and expires_at <= now() returning 1),
       codes as (delete from public.build_key_device_codes where expires_at <= now() - interval '1 day' returning 1)
  select (select count(*)::integer from gone)
$$;
--> statement-breakpoint
revoke all on function app_delete_ended_build_keys() from public, anon, authenticated, service_role, frata_admin, frata_builder;
--> statement-breakpoint
grant execute on function app_delete_ended_build_keys() to frata_app;
