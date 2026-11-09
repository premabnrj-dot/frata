-- =============================================================================
-- OWN DOMAINS D2·6 DEFINERS (plan docs/plans/2026-11-08-shop-addresses.md § D·2 and its Review 2026-11-09). Hand-written.
--
-- Every write to shop_domains is one of these. The rules:
--   · who: owners and admins (CAN_MANAGE), re-checked here from members; the check's writers run inside the shop's
--     own transaction and match `id = p_id and tenant_id = app_current_tenant()` together (definers bypass RLS);
--   · a claim is the shop's alone; a host and its apex are live for one shop at most (unique indexes, 0082);
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
  -- One live host per apex (0082): a second host of the same apex for this shop is refused, not "moved" from itself.
  if exists (select 1 from public.shop_domains d where d.tenant_id = p_tenant and d.apex = p_apex and d.host <> p_host and d.removed_at is null) then
    raise exception 'same_apex' using errcode = 'P0001';
  end if;
  if (select count(*) from public.shop_domains d where d.tenant_id = p_tenant and d.claimed_at > now() - interval '1 day') >= 10 then
    raise exception 'ten_today' using errcode = 'P0001';
  end if;
  if (select coalesce(sum(1 + d.with_www::int), 0) from public.shop_domains d where d.tenant_id = p_tenant and (d.removed_at is null or d.parked_at is not null))
     + 1 + p_with_www::int > 4 then
    raise exception 'four_hosts' using errcode = 'P0001';
  end if;
  -- The project's room: hosts on Vercel now (live or parked) plus proven claims about to be added. One lock for all shops.
  perform pg_advisory_xact_lock(hashtext('shop_domains_capacity'));
  -- And a platform-wide day's claims (security review D2·10 H1): free trial shops can't queue up the room between them.
  if (select count(*) from public.shop_domains d where d.claimed_at > now() - interval '1 day') >= greatest(10, p_capacity) then
    raise exception 'capacity' using errcode = 'P0001';
  end if;
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
-- ── What the check saw. p_seen: the TXT values BOTH resolvers agree on at _frrata.<apex> (a proof reads only these);
--    p_any: every value EITHER returned (an old owner's token still in one is enough to hold a move); null: couldn't
--    answer. p_points / p_cert / p_on_project: 'yes' | 'no' | 'unknown'. p_room: hosts the project may hold for shops.
--    Returns whether Vercel must add it now; 'paused' when the project is full (our failure, never the merchant's). ──
create or replace function app_domain_record(p_id uuid, p_seen text[], p_any text[], p_points text, p_cert text, p_on_project text, p_room int)
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
      -- Not proved: our token isn't there, so any hold we were counting starts again.
      if r.contest_at is not null and p_seen is not null then update public.shop_domains d set contest_at = null where d.id = r.id; end if;
      -- Let go after 48 h, but only on an answer (a resolver that couldn't answer never starts a clock).
      if p_seen is not null and r.claimed_at < now() - interval '48 hours' then
        update public.shop_domains d set removed_at = now(), removed_reason = 'unproven' where d.id = r.id;
        return query select 'let_go'::text, false; return;
      end if;
      return query select (case when p_seen is null then 'unknown' else 'waiting' end)::text, false; return;
    end if;
    -- Our token is there. Is the apex held live by another shop?
    select * into o from public.shop_domains d where d.apex = r.apex and d.proved_at is not null and d.removed_at is null and d.id <> r.id for update;
    if found then
      if p_any is null or ('frrata-verify=' || o.token) = any (p_any) then
        update public.shop_domains d set contest_at = null where d.id = r.id;
        return query select 'dispute'::text, false; return;
      end if;
      -- A MAIN domain never moves by itself until its owner can be told (owner call 3's "told"; notifications, E plan):
      -- it waits for Admin (D2·11), with contest_at recording since when. A non-main one moves to whoever proves DNS.
      if o.main_at is not null then
        if r.contest_at is null then update public.shop_domains d set contest_at = now() where d.id = r.id; end if;
        return query select 'held'::text, false; return;
      end if;
      -- Two statements, in this order: the old row leaves (removed_reason 'moved' is its record; the host stays on our
      -- project for its new shop), then ours is proved.
      -- A different host of the same apex leaves the old one on Vercel: it parks (counted, and D2·7 removes it).
      update public.shop_domains d set removed_at = now(), removed_reason = 'moved', main_at = null,
          parked_at = case when d.added_at is not null and d.host <> r.host then now() end
       where d.id = o.id;
    end if;
    -- The project's room, counted again at the proof (claims pass the claim check together): full → paused, no add.
    perform pg_advisory_xact_lock(hashtext('shop_domains_capacity'));
    if (select coalesce(sum(1 + d.with_www::int), 0) from public.shop_domains d
         where d.id <> r.id and (d.added_at is not null or d.proved_at is not null) and (d.removed_at is null or d.parked_at is not null))
       + 1 + r.with_www::int > p_room then
      return query select 'paused'::text, false; return;
    end if;
    begin
      update public.shop_domains d set proved_at = now(), contest_at = null where d.id = r.id returning * into r;
    exception when unique_violation then
      -- Another shop proved the same apex at the same moment: a dispute, never a silent loss.
      return query select 'dispute'::text, false; return;
    end;
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
  -- Removed while the add was on its way: it is on Vercel now, so it parks (counted; D2·7 takes it off).
  update public.shop_domains d set
      added_at = case when p_ok then coalesce(d.added_at, now()) else d.added_at end,
      parked_at = case when p_ok and d.removed_at is not null then coalesce(d.parked_at, now()) else d.parked_at end,
      vercel_txt = case when not p_ok and p_vercel_txt is not null and d.vercel_txt is null and d.removed_at is null then left(p_vercel_txt, 255) else d.vercel_txt end
   where d.id = p_id and d.tenant_id = public.app_current_tenant() and d.proved_at is not null;
end;
$$;

--> statement-breakpoint
-- ── The sender's re-read: the host to add, only while the row is this shop's, proved, live and not yet added. ──
create or replace function app_domain_add_due(p_id uuid)
  returns table (host text, www text)
  language sql stable security definer set search_path = '' as $$
    select d.host, case when d.with_www then 'www.' || d.apex end
      from public.shop_domains d
     where d.id = p_id and d.tenant_id = public.app_current_tenant() and d.proved_at is not null and d.removed_at is null and d.added_at is null
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
-- ── D2·8: which rows are due a check (the background job; ids only, never a host or a token). The pace is here, not in
--    the schedule: every 10 min the first day after a claim, hourly after; parked rows hourly. On Hobby the job wakes
--    once a day, so everything is due; on Pro the schedule line changes and nothing else. ──
create or replace function app_domains_due(p_limit int)
  returns table (tenant_id uuid, id uuid, parked boolean)
  language sql stable security definer set search_path = '' as $$
    select d.tenant_id, d.id, d.parked_at is not null
      from public.shop_domains d
     where (d.removed_at is null or d.parked_at is not null)
       and (d.checked_at is null or d.checked_at < now() - case
              when d.parked_at is null and d.claimed_at > now() - interval '1 day' then interval '10 minutes'
              else interval '1 hour' end)
     order by d.checked_at nulls first
     limit greatest(1, least(p_limit, 500))
$$;

--> statement-breakpoint
-- ── D2·7: a parked row's lease (its shop's own, every 10 s at most): the host to look at. ──
create or replace function app_parked_lease(p_id uuid)
  returns table (host text, apex text, with_www boolean)
  language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
begin
  return query
    with u as (
      update public.shop_domains d set checked_at = now()
       where d.id = p_id and d.tenant_id = public.app_current_tenant() and d.parked_at is not null
         and (d.checked_at is null or d.checked_at < now() - interval '10 seconds')
      returning d.host as h, d.apex as a, d.with_www as w)
    select u.h, u.a, u.w from u;
end;
$$;

--> statement-breakpoint
-- ── D2·7: what a parked host points at. Away 3 days in a row, or parked 30 days: time to take it off Vercel. ──
create or replace function app_parked_record(p_id uuid, p_points text)
  returns boolean
  language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  r public.shop_domains%rowtype;
begin
  if p_points not in ('yes','no','unknown') then raise exception 'bad_facts' using errcode = 'P0001'; end if;
  update public.shop_domains d set away_since = case p_points when 'no' then coalesce(d.away_since, now()) when 'yes' then null else d.away_since end
   where d.id = p_id and d.tenant_id = public.app_current_tenant() and d.parked_at is not null
   returning * into r;
  if not found then return false; end if;
  return (r.away_since is not null and r.away_since < now() - interval '3 days') or r.parked_at < now() - interval '30 days';
end;
$$;

--> statement-breakpoint
-- ── D2·7's sender: what to take off Vercel, re-read in the database. keep_host / keep_www: another row now holds that
--    exact host (or www of that apex) live, so it stays on the project; everything else comes off (tenancy C2). ──
create or replace function app_domain_remove_due(p_id uuid)
  returns table (host text, www text, keep_host boolean, keep_www boolean)
  language sql stable security definer set search_path = '' as $$
    select d.host, case when d.with_www then 'www.' || d.apex end,
           exists (select 1 from public.shop_domains o where o.id <> d.id and o.host = d.host and o.proved_at is not null and o.removed_at is null),
           exists (select 1 from public.shop_domains o where o.id <> d.id and o.apex = d.apex and o.with_www and o.proved_at is not null and o.removed_at is null)
      from public.shop_domains d
     where d.id = p_id and d.tenant_id = public.app_current_tenant() and d.parked_at is not null
$$;

--> statement-breakpoint
create or replace function app_domain_unparked(p_id uuid)
  returns void
  language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
begin
  update public.shop_domains d set parked_at = null, away_since = null
   where d.id = p_id and d.tenant_id = public.app_current_tenant() and d.parked_at is not null;
end;
$$;

--> statement-breakpoint
-- ── D2·11 Admin (admin role, a reason, audited): disconnect a shop's domain; settle a held claim (move or refuse). ──
create or replace function app_admin_disconnect_domain(p_staff uuid, p_id uuid, p_reason text)
  returns uuid
  language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_email text;
  r public.shop_domains%rowtype;
begin
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then raise exception 'reason' using errcode = 'P0001'; end if;
  select s.email into v_email from public.platform_staff s where s.user_id = p_staff and s.role = 'admin';
  if v_email is null then raise exception 'not_staff' using errcode = 'P0001'; end if;
  update public.shop_domains d set removed_at = now(), removed_reason = 'frrata', removed_by = p_staff, main_at = null,
      parked_at = case when d.added_at is not null then now() end
   where d.id = p_id and d.removed_at is null returning * into r;
  if not found then raise exception 'no_domain' using errcode = 'P0001'; end if;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    values (r.tenant_id, p_staff, v_email, 'staff', 'domain.disconnected', r.host, jsonb_build_object('reason', btrim(p_reason)));
  return r.tenant_id;
end;
$$;

--> statement-breakpoint
-- A held claim (another shop holds the apex as its main): move it to the claimant, or refuse the claim. Returns the
-- shops whose hosts must be refreshed.
create or replace function app_admin_settle_domain(p_staff uuid, p_claim uuid, p_move boolean, p_reason text)
  returns table (tenant_id uuid)
  language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_email text;
  c public.shop_domains%rowtype;
  o public.shop_domains%rowtype;
begin
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then raise exception 'reason' using errcode = 'P0001'; end if;
  select s.email into v_email from public.platform_staff s where s.user_id = p_staff and s.role = 'admin';
  if v_email is null then raise exception 'not_staff' using errcode = 'P0001'; end if;
  select * into c from public.shop_domains d where d.id = p_claim and d.removed_at is null and d.proved_at is null and d.contest_at is not null for update;
  if not found then raise exception 'no_claim' using errcode = 'P0001'; end if;
  select * into o from public.shop_domains d where d.apex = c.apex and d.proved_at is not null and d.removed_at is null for update;
  if not p_move then
    update public.shop_domains d set removed_at = now(), removed_reason = 'refused', removed_by = p_staff where d.id = c.id;
    insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
      values (c.tenant_id, p_staff, v_email, 'staff', 'domain.claim_refused', c.host, jsonb_build_object('reason', btrim(p_reason)));
    return query select c.tenant_id; return;
  end if;
  if found then
    update public.shop_domains d set removed_at = now(), removed_reason = 'moved', main_at = null, removed_by = p_staff,
        parked_at = case when d.added_at is not null and d.host <> c.host then now() end
     where d.id = o.id;
    insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
      values (o.tenant_id, p_staff, v_email, 'staff', 'domain.moved_away', o.host, jsonb_build_object('reason', btrim(p_reason)));
  end if;
  -- The same host already on our project (the old holder's): it serves the claimant at once; any other host is added by
  -- the next check (Admin's action runs one at once).
  update public.shop_domains d set proved_at = now(), contest_at = null,
      added_at = case when o.host = c.host and o.added_at is not null then now() end
   where d.id = c.id;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    values (c.tenant_id, p_staff, v_email, 'staff', 'domain.moved_here', c.host, jsonb_build_object('reason', btrim(p_reason)));
  return query select c.tenant_id union select o.tenant_id where o.tenant_id is not null;
end;
$$;

--> statement-breakpoint
revoke all on function app_admin_disconnect_domain(uuid, uuid, text), app_admin_settle_domain(uuid, uuid, boolean, text) from public, anon, authenticated, service_role;

--> statement-breakpoint
grant execute on function app_admin_disconnect_domain(uuid, uuid, text), app_admin_settle_domain(uuid, uuid, boolean, text) to frata_admin;

--> statement-breakpoint
revoke all on function app_claim_domain(uuid, uuid, text, text, boolean, int), app_domain_lease(uuid), app_domain_record(uuid, text[], text[], text, text, text, int),
  app_domain_added(uuid, boolean, text), app_domain_add_due(uuid), app_make_domain_main(uuid, uuid, uuid), app_unmake_domain_main(uuid, uuid),
  app_domain_razorpay_ok(uuid, uuid, uuid, boolean), app_remove_domain(uuid, uuid, uuid), app_shop_for_domain(text),
  app_domains_due(int), app_parked_lease(uuid), app_parked_record(uuid, text), app_domain_remove_due(uuid), app_domain_unparked(uuid)
  from public, anon, authenticated, service_role;

--> statement-breakpoint
grant execute on function app_claim_domain(uuid, uuid, text, text, boolean, int), app_domain_lease(uuid), app_domain_record(uuid, text[], text[], text, text, text, int),
  app_domain_added(uuid, boolean, text), app_domain_add_due(uuid), app_make_domain_main(uuid, uuid, uuid), app_unmake_domain_main(uuid, uuid),
  app_domain_razorpay_ok(uuid, uuid, uuid, boolean), app_remove_domain(uuid, uuid, uuid), app_shop_for_domain(text),
  app_domains_due(int), app_parked_lease(uuid), app_parked_record(uuid, text), app_domain_remove_due(uuid), app_domain_unparked(uuid)
  to frata_app;
