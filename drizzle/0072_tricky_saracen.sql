ALTER TABLE "invites" DROP CONSTRAINT "invites_role";--> statement-breakpoint
ALTER TABLE "members" DROP CONSTRAINT "members_role";--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_role" CHECK ("invites"."role" in ('owner','admin','staff','accountant'));--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_role" CHECK ("members"."role" in ('owner','admin','staff','partner','accountant'));--> statement-breakpoint
-- =============================================================================
-- GST PLAN PHASE 3: the Accountant role (docs/plans/2026-11-09-gst-core-and-categories.md § 3; tenancy audit
-- 2026-11-09). Hand-written. An owner or admin invites one by email; they sign in with that email and the existing
-- app_claim_invites (0006) makes them a member with role 'accountant'. frata_app has no grant on invites: these two
-- definers are the one way in, each checking the caller is an owner or admin of THIS shop (app_current_tenant()), the
-- role hard-coded, never read from a form.
-- =============================================================================
create or replace function app_invite_accountant(p_tenant uuid, p_uid uuid, p_email text) returns uuid
  language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid; v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if p_tenant is distinct from public.app_current_tenant() then raise exception 'wrong_shop' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.members m where m.tenant_id = p_tenant and m.user_id = p_uid and m.role in ('owner', 'admin')) then
    raise exception 'not_manager' using errcode = 'P0001';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(v_email) > 254 then raise exception 'bad_email' using errcode = 'P0001'; end if;
  if exists (select 1 from public.members m join auth.users u on u.id = m.user_id where m.tenant_id = p_tenant and lower(u.email) = v_email) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;
  -- One open invite per email: an earlier one is revoked, so the newest is the one that counts.
  update public.invites set revoked_at = now() where tenant_id = p_tenant and email = v_email and accepted_at is null and revoked_at is null;
  insert into public.invites (tenant_id, email, role, created_by, expires_at) values (p_tenant, v_email, 'accountant', p_uid, now() + interval '14 days')
    returning id into v_id;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target)
    values (p_tenant, p_uid, (select u.email from auth.users u where u.id = p_uid), 'member', 'shop.accountant_invited', v_email);
  return v_id;
end $$;
--> statement-breakpoint
create or replace function app_remove_accountant(p_tenant uuid, p_uid uuid, p_member uuid) returns void
  language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_tenant is distinct from public.app_current_tenant() then raise exception 'wrong_shop' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.members m where m.tenant_id = p_tenant and m.user_id = p_uid and m.role in ('owner', 'admin')) then
    raise exception 'not_manager' using errcode = 'P0001';
  end if;
  delete from public.members m where m.tenant_id = p_tenant and m.user_id = p_member and m.role = 'accountant';
  if not found then raise exception 'no_accountant' using errcode = 'P0001'; end if;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target)
    values (p_tenant, p_uid, (select u.email from auth.users u where u.id = p_uid), 'member', 'shop.accountant_removed', null);
end $$;
--> statement-breakpoint
-- Open accountant invites of this shop (People shows them): email and expiry only.
create or replace function app_accountant_invites() returns table (id uuid, email text, expires_at timestamptz)
  language sql stable security definer set search_path = '' as $$
  select i.id, i.email, i.expires_at from public.invites i
   where i.tenant_id = public.app_current_tenant() and i.role = 'accountant' and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
   order by i.created_at desc limit 20
$$;
--> statement-breakpoint
create or replace function app_revoke_accountant_invite(p_tenant uuid, p_uid uuid, p_invite uuid) returns void
  language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_tenant is distinct from public.app_current_tenant() then raise exception 'wrong_shop' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.members m where m.tenant_id = p_tenant and m.user_id = p_uid and m.role in ('owner', 'admin')) then
    raise exception 'not_manager' using errcode = 'P0001';
  end if;
  update public.invites set revoked_at = now() where id = p_invite and tenant_id = p_tenant and role = 'accountant' and accepted_at is null and revoked_at is null;
end $$;
--> statement-breakpoint
-- People: the accountant sorts after staff (array_position is null for an unlisted role).
create or replace function app_shop_people() returns table (user_id uuid, email text, role text, since timestamptz, partner_name text)
  language sql stable security definer set search_path = '' as $$
  select m.user_id, u.email::text, m.role, m.created_at,
    case when m.role = 'partner' then (select coalesce(nullif(pa.business_name, ''), pa.name) from public.partner_links l
                                         join public.partners pa on pa.id = l.partner_id
                                        where l.tenant_id = m.tenant_id and l.removed_at is null and pa.user_id = m.user_id) end
    from public.members m left join auth.users u on u.id = m.user_id
   where m.tenant_id = public.app_current_tenant()
   order by array_position(array['owner','admin','partner','staff','accountant'], m.role), m.created_at
$$;
--> statement-breakpoint
revoke all on function app_invite_accountant(uuid, uuid, text), app_remove_accountant(uuid, uuid, uuid), app_accountant_invites(), app_revoke_accountant_invite(uuid, uuid, uuid)
  from public, anon, authenticated, service_role, frata_admin;
--> statement-breakpoint
grant execute on function app_invite_accountant(uuid, uuid, text), app_remove_accountant(uuid, uuid, uuid), app_accountant_invites(), app_revoke_accountant_invite(uuid, uuid, uuid) to frata_app;
