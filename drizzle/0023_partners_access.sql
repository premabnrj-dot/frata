-- =============================================================================
-- PARTNERS ACCESS (docs/specs/2026-11-07-partner-foundations.md, plan
-- docs/plans/2026-11-07-partners.md § Review findings). Hand-written.
--
-- partners: Frata's own table. frata_app has NO grant and reads its own row only
--   through app_my_partner(uid); frata_admin reviews (select + the decision columns).
-- partner_links: a tenant's row. frata_app SELECTs its own shop's (People shows
--   "Built this store"); every write goes through a definer below.
-- Every uid comes from getUser() (requireUser/requireMember), every tenant from
-- requireMember; each function re-checks both against members/partners.
-- =============================================================================
revoke all on partners, partner_links from anon, authenticated, service_role;
--> statement-breakpoint
alter table partners enable row level security;
--> statement-breakpoint
alter table partner_links enable row level security;
--> statement-breakpoint
grant select on partner_links to frata_app;
--> statement-breakpoint
create policy tenant_rows on partner_links for select to frata_app using (tenant_id = app_current_tenant());
--> statement-breakpoint
grant select on partners, partner_links to frata_admin;
--> statement-breakpoint
grant update (approved_at, approved_by, declined_at, declined_by, decline_reason) on partners to frata_admin;
--> statement-breakpoint
create policy admin_all on partners for all to frata_admin using (true) with check (true);
--> statement-breakpoint
create policy admin_read on partner_links for select to frata_admin using (true);
--> statement-breakpoint

-- ── The caller's own partner row (or none). ──────────────────────────────────
create or replace function app_my_partner(p_uid uuid) returns table (
  id uuid, email text, name text, business_name text, phone text, city text, services text[], work_url text,
  brands_now text, applied_at timestamptz, approved_at timestamptz, declined_at timestamptz, decline_reason text)
  language sql stable security definer set search_path = '' as $$
  select p.id, p.email, p.name, p.business_name, p.phone, p.city, p.services, p.work_url, p.brands_now,
         p.applied_at, p.approved_at, p.declined_at, p.decline_reason
    from public.partners p where p.user_id = p_uid
$$;
--> statement-breakpoint

-- ── Apply, or change an application still in review. A decided one is not changed here. ──
create or replace function app_partner_apply(p_uid uuid, p_name text, p_business text, p_phone text, p_city text,
  p_services text[], p_work_url text, p_brands_now text, p_terms_version integer) returns uuid
  language plpgsql volatile security definer set search_path = '' as $$
declare v_email text; v_id uuid;
begin
  select lower(u.email) into v_email from auth.users u where u.id = p_uid and u.email_confirmed_at is not null;
  if v_email is null then raise exception 'email_unconfirmed' using errcode = 'P0001'; end if;
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
  return v_id;
end $$;
--> statement-breakpoint

-- ── A partner makes a client store: no owner, the partner as member, the link with the terms passed in
-- (PARTNER_TERMS, src/domains/partners/terms.ts). The same lock as app_create_shop, so counts hold. ──
create or replace function app_partner_create_shop(p_uid uuid, p_name text, p_slug text, p_pickup text,
  p_share_bps integer, p_share_months integer, p_notice_days integer, p_max_unopened integer) returns uuid
  language plpgsql volatile security definer set search_path = '' as $$
declare v_partner uuid; v_email text; v_tenant uuid; v_version uuid; v_name text := btrim(p_name);
begin
  select p.id, p.email into v_partner, v_email from public.partners p
   where p.user_id = p_uid and p.approved_at is not null and p.declined_at is null;
  if v_partner is null then raise exception 'not_partner' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext('create_shop:' || p_uid::text));
  if (select count(*) from public.partner_links l
       where l.partner_id = v_partner and l.removed_at is null and l.share_starts_at is null) >= p_max_unopened then
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
  insert into public.members (tenant_id, user_id, role) values (v_tenant, p_uid, 'partner');
  insert into public.shop_settings (tenant_id, pickup_pincode, support_email) values (v_tenant, p_pickup, v_email);
  insert into public.tenant_plans (tenant_id, plan_version_id, starts_at, created_by) values (v_tenant, v_version, now(), p_uid);
  insert into public.partner_links (tenant_id, partner_id, share_bps, share_months, notice_days)
    values (v_tenant, v_partner, p_share_bps, p_share_months, p_notice_days);
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    values (v_tenant, p_uid, v_email, 'member', 'shop.created', p_slug, jsonb_build_object('pickup', p_pickup, 'by', 'partner'));
  return v_tenant;
end $$;
--> statement-breakpoint

-- ── The partner's Clients list: Frata's facts about each store, never orders, products or shoppers.
-- A removed link shows only its name and dates. ──
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
  from public.partner_links l
  join public.partners pa on pa.id = l.partner_id and pa.user_id = p_uid
  join public.tenants t on t.id = l.tenant_id
  left join lateral (select i.email, i.expires_at from public.invites i
                      where i.tenant_id = l.tenant_id and i.role = 'owner' and i.accepted_at is null
                        and i.revoked_at is null and i.expires_at > now()
                      order by i.created_at desc limit 1) i on true
  order by l.removed_at nulls first, t.name
$$;
--> statement-breakpoint

-- ── Hand a store over: an owner invite, from the store's own active partner, while it has no owner. ──
create or replace function app_handover_invite(p_tenant uuid, p_uid uuid, p_email text) returns uuid
  language plpgsql volatile security definer set search_path = '' as $$
declare v_email text := lower(btrim(p_email)); v_id uuid;
begin
  perform 1 from public.tenants t where t.id = p_tenant for update;
  if not exists (select 1 from public.members m join public.partner_links l on l.tenant_id = m.tenant_id and l.removed_at is null
                   join public.partners pa on pa.id = l.partner_id and pa.user_id = p_uid
                  where m.tenant_id = p_tenant and m.user_id = p_uid and m.role = 'partner') then
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

-- ── Handovers waiting for this person (their confirmed email). ──
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
   where u.id = p_uid and u.email_confirmed_at is not null and pa.user_id <> p_uid
     and not exists (select 1 from public.members m where m.tenant_id = t.id and m.role = 'owner')
   order by i.created_at
$$;
--> statement-breakpoint

-- ── Accept one: the invite must be this person's (confirmed email), the store ownerless, the caller not its partner. ──
create or replace function app_accept_handover(p_uid uuid, p_invite uuid) returns uuid
  language plpgsql volatile security definer set search_path = '' as $$
declare v_email text; v_tenant uuid;
begin
  select lower(u.email) into v_email from auth.users u where u.id = p_uid and u.email_confirmed_at is not null;
  if v_email is null then raise exception 'email_unconfirmed' using errcode = 'P0001'; end if;
  select i.tenant_id into v_tenant from public.invites i
   where i.id = p_invite and i.email = v_email and i.role = 'owner'
     and i.accepted_at is null and i.revoked_at is null and i.expires_at > now();
  if v_tenant is null then raise exception 'no_invite' using errcode = 'P0001'; end if;
  perform 1 from public.tenants t where t.id = v_tenant for update;
  if exists (select 1 from public.members m where m.tenant_id = v_tenant and m.role = 'owner') then
    raise exception 'has_owner' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.members m where m.tenant_id = v_tenant and m.user_id = p_uid) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;
  update public.invites set accepted_at = now() where id = p_invite;
  insert into public.members (tenant_id, user_id, role) values (v_tenant, p_uid, 'owner');
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target)
    values (v_tenant, p_uid, v_email, 'member', 'shop.handover_accepted', null);
  return v_tenant;
end $$;
--> statement-breakpoint

-- ── Sign-in claims invites as before, EXCEPT an owner invite to a partner-built store: that one waits for
-- "Accept" (app_accept_handover). The skip is in the UPDATE's WHERE, so it is never marked accepted. ──
create or replace function app_claim_invites(p_user uuid) returns integer
  language plpgsql security definer set search_path = '' as $$
declare v_email text; n integer;
begin
  select lower(u.email) into v_email from auth.users u
   where u.id = p_user and u.email_confirmed_at is not null;
  if v_email is null then return 0; end if;
  with claimed as (
    update public.invites i set accepted_at = now()
     where i.email = v_email and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
       and not (i.role = 'owner' and exists (select 1 from public.partner_links l where l.tenant_id = i.tenant_id and l.removed_at is null))
    returning i.tenant_id, i.role)
  insert into public.members (tenant_id, user_id, role)
  select c.tenant_id, p_user, c.role from claimed c
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
--> statement-breakpoint

-- ── A shop's people, for Settings › People. No ids: the shop is app_current_tenant() (withTenant), called
-- only after requireMember(CAN_MANAGE). ──
create or replace function app_shop_people() returns table (user_id uuid, email text, role text, since timestamptz, partner_name text)
  language sql stable security definer set search_path = '' as $$
  select m.user_id, u.email::text, m.role, m.created_at,
    case when m.role = 'partner' then (select coalesce(nullif(pa.business_name, ''), pa.name) from public.partner_links l
                                         join public.partners pa on pa.id = l.partner_id
                                        where l.tenant_id = m.tenant_id and l.removed_at is null and pa.user_id = m.user_id) end
    from public.members m left join auth.users u on u.id = m.user_id
   where m.tenant_id = public.app_current_tenant()
   order by array_position(array['owner','admin','partner','staff'], m.role), m.created_at
$$;
--> statement-breakpoint

-- ── The owner removes the partner: a members row with role owner is required (a support visit has none).
-- The link ends, the partner's membership goes, and the invites they made are revoked, together. ──
create or replace function app_remove_partner(p_tenant uuid, p_uid uuid) returns void
  language plpgsql volatile security definer set search_path = '' as $$
declare v_partner_user uuid; v_email text;
begin
  if not exists (select 1 from public.members m where m.tenant_id = p_tenant and m.user_id = p_uid and m.role = 'owner') then
    raise exception 'not_owner' using errcode = 'P0001';
  end if;
  update public.partner_links l set removed_at = now(), removed_by = p_uid
    from public.partners pa where pa.id = l.partner_id and l.tenant_id = p_tenant and l.removed_at is null
    returning pa.user_id into v_partner_user;
  if v_partner_user is null then raise exception 'no_partner' using errcode = 'P0001'; end if;
  delete from public.members m where m.tenant_id = p_tenant and m.user_id = v_partner_user and m.role = 'partner';
  update public.invites set revoked_at = now()
   where tenant_id = p_tenant and created_by = v_partner_user and accepted_at is null and revoked_at is null;
  select u.email into v_email from auth.users u where u.id = p_uid;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target)
    values (p_tenant, p_uid, v_email, 'member', 'shop.partner_removed', null);
end $$;
--> statement-breakpoint

-- ── The share's window starts at the shop's FIRST opening and never restarts (unit-economics review 2026-11-07). ──
create or replace function app_partner_share_starts() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  update public.partner_links set share_starts_at = new.published_at
   where tenant_id = new.tenant_id and removed_at is null and share_starts_at is null;
  return new;
end $$;
--> statement-breakpoint
create trigger shop_settings_partner_share after update of published_at on shop_settings
  for each row when (new.published_at is not null and old.published_at is null) execute function app_partner_share_starts();
--> statement-breakpoint

revoke all on function app_my_partner(uuid), app_partner_apply(uuid, text, text, text, text, text[], text, text, integer),
  app_partner_create_shop(uuid, text, text, text, integer, integer, integer, integer), app_partner_clients(uuid),
  app_handover_invite(uuid, uuid, text), app_my_handovers(uuid), app_accept_handover(uuid, uuid), app_claim_invites(uuid),
  app_shop_people(), app_remove_partner(uuid, uuid), app_partner_share_starts() from public, anon, authenticated, service_role;
--> statement-breakpoint
grant execute on function app_my_partner(uuid), app_partner_apply(uuid, text, text, text, text, text[], text, text, integer),
  app_partner_create_shop(uuid, text, text, text, integer, integer, integer, integer), app_partner_clients(uuid),
  app_handover_invite(uuid, uuid, text), app_my_handovers(uuid), app_accept_handover(uuid, uuid), app_claim_invites(uuid),
  app_shop_people(), app_remove_partner(uuid, uuid) to frata_app;
