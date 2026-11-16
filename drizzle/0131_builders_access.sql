-- =============================================================================
-- T1c · Builders (ADR-0015 accepted; plan docs/plans/2026-11-15-t1c-builders.md, reviews folded in; owner 2026-11-15).
-- A partner's Builder is a shop member with role 'builder' who never sees orders, shoppers or costs. Three locks here:
--   1. frata_builder, a LOGIN role of its own (owner question 7): column grants on eight catalogue tables, nothing
--      else; it executes no SECURITY DEFINER function (every one already revokes PUBLIC; § 82 asserts it).
--   2. Its policies: tenant rows AND a restrictive app.member_role = 'builder' (an unset setting reads nothing).
--   3. members.role is DERIVED from partner_members.role by trigger (security review H1): no definer, race or stray
--      update can leave a Builder on role 'partner'; frata_app loses UPDATE on members.
-- Deploy order: this before the code (old code is safe on it: no tuple holds 'builder'). The orchestrator sets
-- frata_builder's password and DATABASE_URL_BUILDER at release.
-- =============================================================================

-- ── members: a partner person's row is 'partner' or 'builder' ─────────────────────────────────────────────────────
alter table members drop constraint if exists members_partner_member;
--> statement-breakpoint
alter table members add constraint members_partner_member check ((role in ('partner', 'builder')) = (partner_member_id is not null));
--> statement-breakpoint

-- The row's role follows its person's partner role, on every insert and update (assign, accept, reinstate, set role).
create or replace function app_members_partner_role() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if new.partner_member_id is not null then
    new.role := case (select pm.role from public.partner_members pm where pm.id = new.partner_member_id)
                  when 'builder' then 'builder' else 'partner' end;
  end if;
  return new;
end $$;
--> statement-breakpoint
drop trigger if exists members_partner_role on members;
--> statement-breakpoint
create trigger members_partner_role before insert or update on members
  for each row execute function app_members_partner_role();
--> statement-breakpoint
create or replace function app_partner_members_role_sync() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  update public.members set role = case when new.role = 'builder' then 'builder' else 'partner' end
   where partner_member_id = new.id;
  return null;
end $$;
--> statement-breakpoint
drop trigger if exists partner_members_role_sync on partner_members;
--> statement-breakpoint
create trigger partner_members_role_sync after update of role on partner_members
  for each row when (old.role is distinct from new.role) execute function app_partner_members_role_sync();
--> statement-breakpoint
revoke all on function app_members_partner_role(), app_partner_members_role_sync() from public, anon, authenticated, service_role;
--> statement-breakpoint
-- Every existing partner person's row passes through the trigger once (tenancy audit: a hand-made row is derived now).
update members set partner_member_id = partner_member_id where partner_member_id is not null;
--> statement-breakpoint
-- No app code updates members (grep 2026-11-15); a role moves only through the definers above.
revoke update on members from frata_app;
--> statement-breakpoint

-- ── frata_builder ────────────────────────────────────────────────────────────────────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'frata_builder') then
    create role frata_builder login noinherit nobypassrls;
  end if;
end $$;
--> statement-breakpoint
alter default privileges in schema public revoke execute on functions from public;
--> statement-breakpoint
grant usage on schema public to frata_builder;
--> statement-breakpoint
create or replace function app_member_role() returns text
  language sql stable as $$ select nullif(current_setting('app.member_role', true), '') $$;
--> statement-breakpoint
revoke all on function app_member_role() from public, anon, authenticated, service_role;
--> statement-breakpoint
grant execute on function app_member_role() to frata_app, frata_builder;
--> statement-breakpoint
grant execute on function app_current_tenant() to frata_builder;
--> statement-breakpoint

-- The allow-list, by column (architecture review: derived from listProducts and listCollections/productFactsIn).
-- Never a cost (variants.unit_cost), tax (hsn, gst_bps), draft body or anything outside the catalogue.
grant select (id, tenant_id, title, handle, status, publish_at, published_at, updated_at, type_id, options, option_values,
  tags, taxonomy_category) on products to frata_builder;
--> statement-breakpoint
grant select (id, tenant_id, name) on product_types to frata_builder;
--> statement-breakpoint
grant select (id, tenant_id, product_id, archived_at, stock, price, when_out, ships_by, lead_min_days, lead_max_days,
  preorder_cap, sku) on variants to frata_builder;
--> statement-breakpoint
grant select (tenant_id, product_id, hex, value, family) on product_colours to frata_builder;
--> statement-breakpoint
grant select (tenant_id, product_id, base, widths, position) on product_images to frata_builder;
--> statement-breakpoint
grant select (id, tenant_id, title, handle, kind, rules, match_all) on collections to frata_builder;
--> statement-breakpoint
grant select (tenant_id, collection_id, product_id) on collection_products to frata_builder;
--> statement-breakpoint
grant select (tenant_id, product_id, attribute, values) on product_attributes to frata_builder;
--> statement-breakpoint

-- Policies: the shop's rows, and only with the Builder's setting (ADR-0015 § 3: an unset role refuses).
do $$ declare t text; begin
  foreach t in array array['products', 'product_types', 'variants', 'product_colours', 'product_images', 'collections',
                           'collection_products', 'product_attributes'] loop
    execute format('drop policy if exists builder_rows on %I', t);
    execute format('create policy builder_rows on %I as permissive for select to frata_builder using (tenant_id = app_current_tenant())', t);
    execute format('drop policy if exists builder_only on %I', t);
    execute format('create policy builder_only on %I as restrictive for select to frata_builder using ((select app_member_role()) = ''builder'')', t);
  end loop;
end $$;
--> statement-breakpoint

-- ── Notices never reach a Builder: allow-lists, not deny-lists (tenancy audit) ───────────────────────────────────
create or replace function app_member_email(p_user uuid, p_owner_admin boolean) returns text
  language sql stable security definer set search_path = '' as $$
  select u.email::text from public.members m join auth.users u on u.id = m.user_id
   where m.tenant_id = public.app_current_tenant() and m.user_id = p_user
     and m.role in ('owner', 'admin', 'staff', 'partner')
     and (not p_owner_admin or m.role in ('owner', 'admin')) and u.email is not null $$;
--> statement-breakpoint
create or replace function app_notice_members() returns table (user_id uuid, role text)
  language sql stable security definer set search_path = '' as $$
  select m.user_id, m.role from public.members m where m.tenant_id = public.app_current_tenant()
     and m.role in ('owner', 'admin', 'staff', 'partner') $$;
--> statement-breakpoint

-- ── The partner's own record: a Builder gets the partner's name and state, as a Lead does ──────────────────────
create or replace function app_my_partner(p_uid uuid) returns table (
  id uuid, email text, name text, business_name text, phone text, city text, services text[], work_url text,
  brands_now text, applied_at timestamptz, approved_at timestamptz, declined_at timestamptz, decline_reason text,
  member_id uuid, member_role text, suspended_at timestamptz)
  language sql stable security definer set search_path = '' as $$
  select p.id, case when pm.role = 'owner' then p.email else '' end, p.name, p.business_name,
         case when pm.role = 'owner' then p.phone else '' end, p.city, p.services, p.work_url,
         case when pm.role = 'owner' then p.brands_now end,
         p.applied_at, p.approved_at, p.declined_at, case when pm.role = 'owner' then p.decline_reason end, pm.id, pm.role, p.suspended_at
    from public.partner_members pm join public.partners p on p.id = pm.partner_id
   where pm.user_id = p_uid and pm.removed_at is null and pm.accepted_at is not null and pm.role in ('owner', 'lead', 'builder')
$$;
--> statement-breakpoint

-- ── Clients: the owner sees everything; a Lead or a Builder only its live assigned stores, with no owner email,
--    invite email, plan or the partner's share terms (owner question 6: a Lead too). The stage's facts stay (the first
--    opening, an open invite's end, has_owner) so the stage reads the same for everyone. ──
drop function if exists app_partner_clients(uuid, uuid, text);
--> statement-breakpoint
create function app_partner_clients(p_uid uuid, p_session uuid, p_stepup text) returns table (
  tenant_id uuid, name text, slug text, linked_at timestamptz, share_starts_at timestamptz, removed_at timestamptz,
  share_months integer, notice_days integer, owner_email text, invite_email text, invite_expires_at timestamptz, plan_name text,
  has_owner boolean)
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
    case when me.role = 'owner' and l.removed_at is null then (select u.email::text from public.members m join auth.users u on u.id = m.user_id
                                          where m.tenant_id = l.tenant_id and m.role = 'owner' order by m.created_at limit 1) end,
    case when me.role = 'owner' and l.removed_at is null then i.email end,
    case when l.removed_at is null then i.expires_at end,
    case when me.role = 'owner' and l.removed_at is null then (select p.name from public.tenant_plans tp
                                           join public.plan_versions pv on pv.id = tp.plan_version_id
                                           join public.plans p on p.id = pv.plan_id
                                          where tp.tenant_id = l.tenant_id and tp.starts_at <= now()
                                          order by tp.starts_at desc limit 1) end,
    exists (select 1 from public.members m where m.tenant_id = l.tenant_id and m.role = 'owner')
  from public.app_pm_live(p_uid) me
  join public.partner_links l on l.partner_id = me.partner_id
  join public.tenants t on t.id = l.tenant_id
  left join lateral (select i.email, i.expires_at from public.invites i
                      where i.tenant_id = l.tenant_id and i.role = 'owner' and i.accepted_at is null
                        and i.revoked_at is null and i.expires_at > now()
                      order by i.created_at desc limit 1) i on true
  where me.role = 'owner'
     or (me.role in ('lead', 'builder') and l.removed_at is null
         and exists (select 1 from public.partner_assignments a where a.partner_member_id = me.member_id and a.tenant_id = l.tenant_id))
  order by l.removed_at nulls first, t.name;
end $$;
--> statement-breakpoint

-- ── Invite with a role: Lead or Builder (never owner) ──────────────────────────────────────────────────────────────
create or replace function app_partner_invite(p_uid uuid, p_session uuid, p_stepup text, p_email text, p_role text, p_tenants uuid[]) returns uuid
  language plpgsql volatile security definer set search_path = '' as $$
declare me record; v_email text := lower(btrim(p_email)); v_id uuid; v_t uuid;
begin
  select x.* into me from public.app_pm_live(p_uid) x where x.role = 'owner';
  if me.member_id is null then raise exception 'not_owner' using errcode = 'P0001'; end if;
  perform public.app_partner_need(p_uid, p_session, p_stepup, true);
  if p_role is null or p_role not in ('lead', 'builder') then raise exception 'bad_role' using errcode = 'P0001'; end if;
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
    values (me.partner_id, v_email, p_role, p_uid, now() + interval '7 days') returning id into v_id;
  insert into public.partner_assignments (partner_member_id, tenant_id) select v_id, x from unnest(coalesce(p_tenants, '{}')) x on conflict do nothing;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    select null, p_uid, u.email, 'member', 'partner.person_invited', v_id::text, jsonb_build_object('role', p_role) from auth.users u where u.id = p_uid;
  return v_id;
end $$;
--> statement-breakpoint

-- ── Assign: a Lead or a Builder (the members row's role follows the trigger) ──────────────────────────────────────
create or replace function app_partner_assign(p_uid uuid, p_session uuid, p_stepup text, p_member uuid, p_tenant uuid, p_on boolean) returns void
  language plpgsql volatile security definer set search_path = '' as $$
declare me record; r record; v_email text;
begin
  select x.* into me from public.app_pm_live(p_uid) x where x.role = 'owner';
  if me.member_id is null then raise exception 'not_owner' using errcode = 'P0001'; end if;
  perform public.app_partner_need(p_uid, p_session, p_stepup, true);
  select * into r from public.partner_members pm where pm.id = p_member and pm.partner_id = me.partner_id and pm.removed_at is null for update;
  if r.id is null or r.role not in ('lead', 'builder') then raise exception 'no_person' using errcode = 'P0001'; end if;
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
end $$;
--> statement-breakpoint

-- ── Set a person's role: Lead ↔ Builder (owner only, a fresh check; never the owner row or one's own) ─────────────
create or replace function app_partner_set_role(p_uid uuid, p_session uuid, p_stepup text, p_member uuid, p_role text) returns void
  language plpgsql volatile security definer set search_path = '' as $$
declare me record; r record; v_email text;
begin
  select x.* into me from public.app_pm_live(p_uid) x where x.role = 'owner';
  if me.member_id is null then raise exception 'not_owner' using errcode = 'P0001'; end if;
  perform public.app_partner_need(p_uid, p_session, p_stepup, true);
  if p_role is null or p_role not in ('lead', 'builder') then raise exception 'bad_role' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext('partner_team:' || me.partner_id::text));
  select * into r from public.partner_members pm where pm.id = p_member and pm.partner_id = me.partner_id and pm.removed_at is null for update;
  if r.id is null or r.id = me.member_id then raise exception 'no_person' using errcode = 'P0001'; end if;
  if r.role = 'owner' then raise exception 'is_owner' using errcode = 'P0001'; end if;
  if r.role = p_role then return; end if;
  select u.email into v_email from auth.users u where u.id = p_uid;
  -- The members rows follow (partner_members_role_sync). A Lead made a Builder loses the store invites they made.
  update public.partner_members set role = p_role where id = r.id;
  if p_role = 'builder' and r.user_id is not null then
    update public.invites set revoked_at = now()
     where created_by = r.user_id and accepted_at is null and revoked_at is null
       and tenant_id in (select l.tenant_id from public.partner_links l where l.partner_id = me.partner_id);
  end if;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    select m.tenant_id, p_uid, v_email, 'member', 'shop.partner_person_role', null, jsonb_build_object('role', p_role)
      from public.members m where m.partner_member_id = r.id;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    values (null, p_uid, v_email, 'member', 'partner.person_role', r.id::text, jsonb_build_object('role', p_role));
  perform public.app_partner_notify(r.id, 'partner_role_changed', v_email, case when p_role = 'builder' then 'Builder' else 'Lead' end, false);
end $$;
--> statement-breakpoint

-- ── Accept: a Lead's or a Builder's invite (the members row's role follows the trigger) ─────────────────────────────
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
  if r.role not in ('lead', 'builder') then raise exception 'bad_role' using errcode = 'P0001'; end if;
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
  return jsonb_build_object('partnerId', r.partner_id, 'skipped', to_jsonb(v_skipped), 'role', r.role);
end $$;
--> statement-breakpoint

-- ── A shop's people: a Builder is labelled like a Lead, with its partner; sorted after the partner ─────────────────
create or replace function app_shop_people() returns table (user_id uuid, email text, role text, since timestamptz, partner_name text,
  partner_role text, partner_paused boolean)
  language sql stable security definer set search_path = '' as $$
  select x.* from (
    select m.user_id, u.email::text, m.role, m.created_at,
      case when m.role in ('partner', 'builder') then (select coalesce(nullif(pa.business_name, ''), pa.name) from public.partner_members pm
                                           join public.partners pa on pa.id = pm.partner_id where pm.id = m.partner_member_id) end,
      case when m.role in ('partner', 'builder') then (select pm.role from public.partner_members pm where pm.id = m.partner_member_id) end,
      false
      from public.members m left join auth.users u on u.id = m.user_id
     where m.tenant_id = public.app_current_tenant()
    union all
    select pa.user_id, pa.email, 'partner', l.created_at, coalesce(nullif(pa.business_name, ''), pa.name), 'owner', true
      from public.partner_links l join public.partners pa on pa.id = l.partner_id
     where l.tenant_id = public.app_current_tenant() and l.removed_at is null and pa.suspended_at is not null
       and not exists (select 1 from public.members m where m.tenant_id = l.tenant_id and m.user_id = pa.user_id)
  ) x (user_id, email, role, since, partner_name, partner_role, partner_paused)
   order by array_position(array['owner','admin','partner','builder','staff','accountant'], x.role), x.since
$$;
--> statement-breakpoint

-- ── The owner approves, declines and deletes a Builder's passkeys as a Lead's (T1b definers, role widened) ─────
create or replace function app_partner_pk_approve(p_uid uuid, p_session uuid, p_stepup text, p_member uuid, p_code_hash text) returns text
  language plpgsql security definer set search_path = '' as $$
declare me record; t record; v_req uuid; v_by text;
begin
  select x.* into me from public.app_pm_live(p_uid) x where x.role = 'owner';
  if me.member_id is null then raise exception 'not_owner' using errcode = 'P0001'; end if;
  perform public.app_partner_need(p_uid, p_session, p_stepup, true);
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
end $$;
--> statement-breakpoint
create or replace function app_partner_pk_decline(p_uid uuid, p_session uuid, p_stepup text, p_member uuid) returns void
  language plpgsql security definer set search_path = '' as $$
declare me record; t record; n int;
begin
  select x.* into me from public.app_pm_live(p_uid) x where x.role = 'owner';
  if me.member_id is null then raise exception 'not_owner' using errcode = 'P0001'; end if;
  perform public.app_partner_need(p_uid, p_session, p_stepup, false);
  select pm.id, pm.user_id into t from public.partner_members pm
   where pm.id = p_member and pm.partner_id = me.partner_id and pm.role in ('lead', 'builder') and pm.removed_at is null;
  if t.id is null or t.user_id = p_uid then raise exception 'no_person' using errcode = 'P0001'; end if;
  update public.partner_passkey_requests r set declined_at = now(), device = null, city = null
   where r.partner_member_id = t.id and r.used_at is null and r.approved_at is null and r.declined_at is null and r.expires_at > now();
  get diagnostics n = row_count;
  if n = 0 then raise exception 'no_request' using errcode = 'P0001'; end if;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    select null, p_uid, pm.email, 'member', 'partner.passkey.decline', t.id::text, null from public.partner_members pm where pm.id = me.member_id;
end $$;
--> statement-breakpoint
create or replace function app_partner_pk_remove_all(p_uid uuid, p_session uuid, p_stepup text, p_member uuid) returns integer
  language plpgsql security definer set search_path = '' as $$
declare me record; t record; n int;
begin
  select x.* into me from public.app_pm_live(p_uid) x where x.role = 'owner';
  if me.member_id is null then raise exception 'not_owner' using errcode = 'P0001'; end if;
  perform public.app_partner_need(p_uid, p_session, p_stepup, true);
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
end $$;
--> statement-breakpoint

-- ── Grants (a dropped-and-created function resets them; every definer here revoked from PUBLIC again) ────────────
revoke all on function app_member_email(uuid, boolean), app_notice_members(), app_my_partner(uuid),
  app_partner_clients(uuid, uuid, text), app_partner_invite(uuid, uuid, text, text, text, uuid[]),
  app_partner_assign(uuid, uuid, text, uuid, uuid, boolean), app_partner_set_role(uuid, uuid, text, uuid, text),
  app_partner_accept(uuid, uuid), app_shop_people()
  from public, anon, authenticated, service_role, frata_builder;
--> statement-breakpoint
grant execute on function app_member_email(uuid, boolean), app_notice_members(), app_my_partner(uuid),
  app_partner_clients(uuid, uuid, text), app_partner_invite(uuid, uuid, text, text, text, uuid[]),
  app_partner_assign(uuid, uuid, text, uuid, uuid, boolean), app_partner_set_role(uuid, uuid, text, uuid, text),
  app_partner_accept(uuid, uuid), app_shop_people()
  to frata_app;
