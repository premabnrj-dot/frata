-- =============================================================================
-- OWN DOMAINS D2·6 DEFINERS (plan docs/plans/2026-11-08-shop-addresses.md § D·2 and its Review 2026-11-09). Hand-written.
--
-- Every write to shop_domains is one of these. The rules:
--   · who: owners and admins (CAN_MANAGE), re-checked here from members; the check's writers run inside the shop's
--     own transaction and match `id = p_id and tenant_id = app_current_tenant()` together (definers bypass RLS);
--   · a claim is the shop's alone; a host and its apex are live for one shop at most (unique indexes, 0080);
--   · nothing reaches Vercel before the row's own proof: app_domain_record says when to add (an outbox row);
--   · a proof is only what BOTH resolvers saw at _frrata.<apex>, and only this row's own token proves it. If another
--     shop holds the apex live: it moves only when its token is gone and ours is there; a MAIN domain waits 72 h
--     (contest_at); both tokens seen is a dispute (no move, Admin decides). A move locks both rows, then removes the
--     old and proves the new as two statements (the unique index isn't deferrable);
--   · caps: 4 hosts a shop (parked ones count), 10 claims a day, the project's capacity (passed in) minus 4 kept free;
--     an unproven claim is let go after 48 h.
-- =============================================================================

-- ── Claim a domain (Connect › Continue): returns the row and its token (made by the table, never passed in) ──
create or replace function app_claim_domain(p_tenant uuid, p_uid uuid, p_host text, p_apex text, p_with_www boolean, p_capacity int)
  returns table (id uuid, token text)
  language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_row public.shop_domains%rowtype;
  v_used int;
  v_email text;
begin
  if not exists (select 1 from public.members m where m.tenant_id = p_tenant and m.user_id = p_uid and m.role in ('owner','admin')) then
    raise exception 'not_owner' using errcode = 'P0001';
  end if;
  perform 1 from public.tenants t where t.id = p_tenant for update;
  if (select t.address_frozen_at from public.tenants t where t.id = p_tenant) is not null then raise exception 'frozen' using errcode = 'P0001'; end if;
  if exists (select 1 from public.blocked_names b where b.kind = 'domain' and b.name in (p_host, p_apex)) then raise exception 'blocked' using errcode = 'P0001'; end if;
  -- A second press of Continue: the same claim back.
  select * into v_row from public.shop_domains d where d.tenant_id = p_tenant and d.host = p_host and d.removed_at is null;
  if found then return query select v_row.id, v_row.token; return; end if;
  if (select count(*) from public.shop_domains d where d.tenant_id = p_tenant and d.claimed_at > now() - interval '1 day') >= 10 then
    raise exception 'ten_today' using errcode = 'P0001';
  end if;
  if (select coalesce(sum(1 + d.with_www::int), 0) from public.shop_domains d where d.tenant_id = p_tenant and (d.removed_at is null or d.parked_at is not null))
     + 1 + p_with_www::int > 4 then
    raise exception 'four_hosts' using errcode = 'P0001';
  end if;
  -- The project's room: hosts on Vercel now (live or parked) plus proven claims about to be added. One lock for all shops.
  perform pg_advisory_xact_lock(hashtext('shop_domains_capacity'));
  select coalesce(sum(1 + d.with_www::int), 0) into v_used from public.shop_domains d
   where (d.added_at is not null or d.proved_at is not null) and (d.removed_at is null or d.parked_at is not null);
  if v_used + 1 + p_with_www::int > p_capacity - 4 then raise exception 'capacity' using errcode = 'P0001'; end if;
  insert into public.shop_domains (tenant_id, host, apex, with_www, claimed_by) values (p_tenant, p_host, p_apex, p_with_www, p_uid)
    returning * into v_row;
  select u.email into v_email from auth.users u where u.id = p_uid;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    values (p_tenant, p_uid, v_email, 'member', 'domain.claimed', p_host, jsonb_build_object('with_www', p_with_www));
  return query select v_row.id, v_row.token;
end;
$$;

--> statement-breakpoint
-- ── The check's lease: one check of a row at a time, at most every 10 s (the dialog's 15 s poll, tabs and the cron
--    collapse into one). Returns what the check needs, or nothing when the row isn't this shop's or was just checked. ──
create or replace function app_domain_lease(p_id uuid)
  returns table (host text, apex text, with_www boolean, token text, proved boolean, added boolean, main boolean)
  language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
begin
  return query
    with u as (
      update public.shop_domains d set checked_at = now()
       where d.id = p_id and d.tenant_id = public.app_current_tenant() and d.removed_at is null
         and (d.checked_at is null or d.checked_at < now() - interval '10 seconds')
      returning d.host as h, d.apex as a, d.with_www as w, d.token as t, d.proved_at is not null as p, d.added_at is not null as ad, d.main_at is not null as m)
    select u.h, u.a, u.w, u.t, u.p, u.ad, u.m from u;
end;
$$;

--> statement-breakpoint
-- ── What the check saw. p_seen: the TXT values BOTH resolvers agree on at _frrata.<apex> (null: they couldn't
--    answer). p_points / p_cert / p_on_project: 'yes' | 'no' | 'unknown'. Returns whether Vercel must add it now. ──
create or replace function app_domain_record(p_id uuid, p_seen text[], p_points text, p_cert text, p_on_project text)
  returns table (state text, add_now boolean)
  language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  r public.shop_domains%rowtype;
  o public.shop_domains%rowtype;
begin
  select * into r from public.shop_domains d where d.id = p_id and d.tenant_id = public.app_current_tenant() and d.removed_at is null for update;
  if not found then return query select 'gone'::text, false; return; end if;
  if p_points not in ('yes','no','unknown') or p_cert not in ('yes','no','unknown') or p_on_project not in ('yes','no','unknown') then
    raise exception 'bad_facts' using errcode = 'P0001';
  end if;

  if r.proved_at is null then
    if p_seen is null or not (('frrata-verify=' || r.token) = any (p_seen)) then
      -- Not proved: let go after 48 h.
      if r.claimed_at < now() - interval '48 hours' then
        update public.shop_domains d set removed_at = now(), removed_reason = 'unproven' where d.id = r.id;
        return query select 'let_go'::text, false; return;
      end if;
      return query select (case when p_seen is null then 'unknown' else 'waiting' end)::text, false; return;
    end if;
    -- Our token is there. Is the apex held live by another shop?
    select * into o from public.shop_domains d where d.apex = r.apex and d.proved_at is not null and d.removed_at is null and d.id <> r.id for update;
    if found then
      if ('frrata-verify=' || o.token) = any (p_seen) then
        update public.shop_domains d set contest_at = null where d.id = r.id;
        return query select 'dispute'::text, false; return;
      end if;
      if o.main_at is not null then
        if r.contest_at is null then update public.shop_domains d set contest_at = now() where d.id = r.id; end if;
        if coalesce(r.contest_at, now()) > now() - interval '72 hours' then return query select 'held'::text, false; return; end if;
      end if;
      -- Two statements, in this order: the old row leaves (removed_reason 'moved' is its record; the host stays on our
      -- project for its new shop), then ours is proved.
      update public.shop_domains d set removed_at = now(), removed_reason = 'moved', main_at = null where d.id = o.id;
    end if;
    update public.shop_domains d set proved_at = now(), contest_at = null where d.id = r.id returning * into r;
  end if;

  update public.shop_domains d set
      -- Proved and already on our project (a move, or an add whose answer was lost): it is this shop's now (one live
      -- shop per apex), so it counts as added.
      added_at = case when p_on_project = 'yes' then coalesce(d.added_at, now()) else d.added_at end,
      dns_ok_at = case p_points when 'yes' then coalesce(d.dns_ok_at, now()) when 'no' then null else d.dns_ok_at end,
      -- A main domain keeps its certificate fact (main needs one): its trouble shows as failing_since instead.
      cert_ok_at = case when p_cert = 'yes' and p_points = 'yes' then coalesce(d.cert_ok_at, now()) when p_cert = 'no' and d.main_at is null then null else d.cert_ok_at end,
      failing_since = case
        when d.main_at is not null and (p_points = 'no' or p_on_project = 'no' or p_cert = 'no') then coalesce(d.failing_since, now())
        when p_points = 'yes' and p_on_project <> 'no' and p_cert <> 'no' then null else d.failing_since end
    where d.id = r.id
    returning * into r;
  return query select (case
      when r.main_at is not null and r.failing_since is not null then 'not_working'
      when r.cert_ok_at is not null then 'connected'
      when r.dns_ok_at is not null then 'securing'
      else 'waiting' end)::text,
    (r.added_at is null and p_on_project <> 'yes');
end;
$$;

--> statement-breakpoint
-- ── The add's outcome (the outbox sender, inside the shop's transaction): on our project now, or Vercel's own TXT. ──
create or replace function app_domain_added(p_id uuid, p_ok boolean, p_vercel_txt text)
  returns void
  language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
begin
  update public.shop_domains d set
      added_at = case when p_ok then coalesce(d.added_at, now()) else d.added_at end,
      vercel_txt = case when not p_ok and p_vercel_txt is not null and d.vercel_txt is null then left(p_vercel_txt, 255) else d.vercel_txt end
   where d.id = p_id and d.tenant_id = public.app_current_tenant() and d.proved_at is not null;
end;
$$;

--> statement-breakpoint
-- ── Make main (and back): proof, certificate and the project needed; Razorpay's approval when the shop takes live payments. ──
create or replace function app_make_domain_main(p_tenant uuid, p_uid uuid, p_id uuid)
  returns void
  language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  r public.shop_domains%rowtype;
  v_email text;
begin
  if not exists (select 1 from public.members m where m.tenant_id = p_tenant and m.user_id = p_uid and m.role in ('owner','admin')) then
    raise exception 'not_owner' using errcode = 'P0001';
  end if;
  select * into r from public.shop_domains d where d.id = p_id and d.tenant_id = p_tenant and d.removed_at is null for update;
  if not found then raise exception 'no_domain' using errcode = 'P0001'; end if;
  if r.proved_at is null or r.cert_ok_at is null or r.added_at is null then raise exception 'not_ready' using errcode = 'P0001'; end if;
  if r.razorpay_ok_at is null and exists (select 1 from public.payment_keys k where k.tenant_id = p_tenant and k.mode = 'live' and k.webhook_seen_at is not null) then
    raise exception 'razorpay' using errcode = 'P0001';
  end if;
  update public.shop_domains d set main_at = null where d.tenant_id = p_tenant and d.main_at is not null and d.id <> p_id;
  update public.shop_domains d set main_at = coalesce(d.main_at, now()) where d.id = p_id;
  select u.email into v_email from auth.users u where u.id = p_uid;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target)
    values (p_tenant, p_uid, v_email, 'member', 'domain.made_main', r.host);
end;
$$;

--> statement-breakpoint
create or replace function app_unmake_domain_main(p_tenant uuid, p_uid uuid)
  returns void
  language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_host text;
  v_email text;
begin
  if not exists (select 1 from public.members m where m.tenant_id = p_tenant and m.user_id = p_uid and m.role in ('owner','admin')) then
    raise exception 'not_owner' using errcode = 'P0001';
  end if;
  update public.shop_domains d set main_at = null where d.tenant_id = p_tenant and d.main_at is not null returning d.host into v_host;
  if v_host is null then return; end if;
  select u.email into v_email from auth.users u where u.id = p_uid;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target)
    values (p_tenant, p_uid, v_email, 'member', 'domain.main_back_to_name', v_host);
end;
$$;

--> statement-breakpoint
-- ── "Razorpay approved it" on a domain row: owner or admin, audited; the merchant's word (no Razorpay API exists). ──
create or replace function app_domain_razorpay_ok(p_tenant uuid, p_uid uuid, p_id uuid, p_ok boolean)
  returns void
  language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_host text;
  v_email text;
begin
  if not exists (select 1 from public.members m where m.tenant_id = p_tenant and m.user_id = p_uid and m.role in ('owner','admin')) then
    raise exception 'not_owner' using errcode = 'P0001';
  end if;
  update public.shop_domains d set razorpay_ok_at = case when p_ok then coalesce(d.razorpay_ok_at, now()) end, razorpay_ok_by = case when p_ok then coalesce(d.razorpay_ok_by, p_uid) end
   where d.id = p_id and d.tenant_id = p_tenant and d.removed_at is null and d.proved_at is not null and (p_ok or d.main_at is null)
   returning d.host into v_host;
  if v_host is null then raise exception 'not_ready' using errcode = 'P0001'; end if;
  select u.email into v_email from auth.users u where u.id = p_uid;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target)
    values (p_tenant, p_uid, v_email, 'member', case when p_ok then 'domain.razorpay_ok' else 'domain.razorpay_unset' end, v_host);
end;
$$;

--> statement-breakpoint
-- ── Remove: the row leaves; a host on Vercel parks there serving nothing until it points away (D2·7 removes it). ──
create or replace function app_remove_domain(p_tenant uuid, p_uid uuid, p_id uuid)
  returns void
  language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_host text;
  v_email text;
begin
  if not exists (select 1 from public.members m where m.tenant_id = p_tenant and m.user_id = p_uid and m.role in ('owner','admin')) then
    raise exception 'not_owner' using errcode = 'P0001';
  end if;
  update public.shop_domains d set removed_at = now(), removed_reason = 'owner', removed_by = p_uid, main_at = null,
      parked_at = case when d.added_at is not null then now() end
   where d.id = p_id and d.tenant_id = p_tenant and d.removed_at is null
   returning d.host into v_host;
  if v_host is null then return; end if;
  select u.email into v_email from auth.users u where u.id = p_uid;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target)
    values (p_tenant, p_uid, v_email, 'member', 'domain.removed', v_host);
end;
$$;

--> statement-breakpoint
-- ── The lookup (the middleware's host → shop, beside app_tenant_for_host until the code has moved: B3).
--    Only a proved, live row on our project serves; www.<host> is Vercel's own redirect to it. ──
create or replace function app_shop_for_domain(p_host text)
  returns table (id uuid, name text, slug text, main boolean)
  language sql stable security definer set search_path = '' as $$
    select t.id, t.name, t.slug, d.main_at is not null
      from public.shop_domains d join public.tenants t on t.id = d.tenant_id
     where d.host = lower(p_host) and d.proved_at is not null and d.added_at is not null and d.removed_at is null
$$;

--> statement-breakpoint
revoke all on function app_claim_domain(uuid, uuid, text, text, boolean, int), app_domain_lease(uuid), app_domain_record(uuid, text[], text, text, text),
  app_domain_added(uuid, boolean, text), app_make_domain_main(uuid, uuid, uuid), app_unmake_domain_main(uuid, uuid),
  app_domain_razorpay_ok(uuid, uuid, uuid, boolean), app_remove_domain(uuid, uuid, uuid), app_shop_for_domain(text)
  from public, anon, authenticated, service_role;

--> statement-breakpoint
grant execute on function app_claim_domain(uuid, uuid, text, text, boolean, int), app_domain_lease(uuid), app_domain_record(uuid, text[], text, text, text),
  app_domain_added(uuid, boolean, text), app_make_domain_main(uuid, uuid, uuid), app_unmake_domain_main(uuid, uuid),
  app_domain_razorpay_ok(uuid, uuid, uuid, boolean), app_remove_domain(uuid, uuid, uuid), app_shop_for_domain(text)
  to frata_app;
