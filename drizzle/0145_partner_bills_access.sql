-- =============================================================================
-- 0145 · P2 Clients: who reaches the partner's own bills, and the share figures (plan docs/plans/2026-11-16-p2-clients.md;
-- tenancy-auditor, security-reviewer, architecture-reviewer, speed-reviewer, unit-economics-reviewer 2026-11-16).
-- partner_client_deals / partner_client_bills / partner_bill_tries: platform scope, no Frrata role reads them
-- (owner, 2026-11-15: Frrata Admin gets a count and a first-bill date only). Every definer takes the partner from the
-- caller's own live partner_members row (app_pm_live) and re-checks the browser session's passkey check
-- (app_partner_need); a link or bill id from a form is matched on the caller's partner, else 'not_found'.
-- Proof: scripts/verify/tenancy.sql § 85.
-- =============================================================================

-- The tables' locks (RLS, revokes, definer_only policies) ship with the tables in 0144.

-- ── Clients: as 0131, plus the link's id (a client page's key: a store relinked to the same partner has two rows),
--    the owner's join and the invite's day (the next step's "Waiting N days"). Both new columns are null for a Builder
--    and once the link is removed (the removed-link rule, § 77). The owner's email, join and has_owner come from one
--    lateral over members. Called on every console page a partner opens (the building banner): no invoice work here. ──
drop function if exists app_partner_clients(uuid, uuid, text);--> statement-breakpoint
create function app_partner_clients(p_uid uuid, p_session uuid, p_stepup text) returns table (
  tenant_id uuid, name text, slug text, linked_at timestamptz, share_starts_at timestamptz, removed_at timestamptz,
  share_months integer, notice_days integer, owner_email text, invite_email text, invite_expires_at timestamptz, plan_name text,
  has_owner boolean, link_id uuid, owner_since timestamptz, invite_sent_at timestamptz)
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
    case when me.role = 'owner' and l.removed_at is null then o.email end,
    case when me.role = 'owner' and l.removed_at is null then i.email end,
    case when l.removed_at is null then i.expires_at end,
    case when me.role = 'owner' and l.removed_at is null then (select p.name from public.tenant_plans tp
                                           join public.plan_versions pv on pv.id = tp.plan_version_id
                                           join public.plans p on p.id = pv.plan_id
                                          where tp.tenant_id = l.tenant_id and tp.starts_at <= now()
                                          order by tp.starts_at desc limit 1) end,
    o.member_since is not null,
    l.id,
    case when me.role <> 'builder' and l.removed_at is null then o.member_since end,
    case when me.role <> 'builder' and l.removed_at is null then i.created_at end
  from public.app_pm_live(p_uid) me
  join public.partner_links l on l.partner_id = me.partner_id
  join public.tenants t on t.id = l.tenant_id
  left join lateral (select u.email::text as email, m.created_at as member_since from public.members m join auth.users u on u.id = m.user_id
                      where m.tenant_id = l.tenant_id and m.role = 'owner' order by m.created_at limit 1) o on true
  left join lateral (select i.email, i.expires_at, i.created_at from public.invites i
                      where i.tenant_id = l.tenant_id and i.role = 'owner' and i.accepted_at is null
                        and i.revoked_at is null and i.expires_at > now()
                      order by i.created_at desc limit 1) i on true
  where me.role = 'owner'
     or (me.role in ('lead', 'builder') and l.removed_at is null
         and exists (select 1 from public.partner_assignments a where a.partner_member_id = me.member_id and a.tenant_id = l.tenant_id))
  order by l.removed_at nulls first, t.name;
end $$;
--> statement-breakpoint

-- ── The share's month (owner only; called by /partner alone). For each of the partner's links: the link's own
--    snapshotted terms and the previous IST month's Frrata invoice for that store, ONLY when that month overlaps the
--    link's window — from its first opening, for share_months, ending notice_days after a removal if sooner; nothing for
--    a store removed before it opened. The window is decided here, per link (a store relinked to another partner never
--    shows this partner that partner's months). Returned: what invoiceState takes and the net taxable (taxable less
--    the month's non-test credit notes' taxable). Never the number, buyer, GSTIN or lines. ──
create or replace function app_partner_client_shares(p_uid uuid, p_session uuid, p_stepup text) returns table (
  link_id uuid, share_bps integer, issued_at timestamptz, has_number boolean, total bigint, paid bigint, credited bigint,
  net_taxable bigint)
  language plpgsql stable security definer set search_path = '' as $$
declare me record;
  v_month timestamptz := (date_trunc('month', now() at time zone 'Asia/Kolkata') - interval '1 month') at time zone 'Asia/Kolkata';
begin
  select x.* into me from public.app_pm_live(p_uid) x where x.role = 'owner';
  if me.member_id is null then return; end if;
  perform public.app_partner_need(p_uid, p_session, p_stepup, false);
  -- One link a store: a store that left and came back to this partner counts its month once (the latest opening).
  return query
  select distinct on (l.tenant_id) l.id, l.share_bps, f.issued_at, f.number is not null, f.total,
    coalesce((select sum(p.amount) from public.frrata_payments p where p.tenant_id = f.tenant_id and p.invoice_id = f.id and p.captured_at is not null), 0)::bigint,
    coalesce((select sum(c.total) from public.frrata_credit_notes c where c.tenant_id = f.tenant_id and c.invoice_id = f.id and not c.test_mode), 0)::bigint,
    (f.taxable - coalesce((select sum(c.taxable) from public.frrata_credit_notes c where c.tenant_id = f.tenant_id and c.invoice_id = f.id and not c.test_mode), 0))::bigint
  from public.partner_links l
  join lateral (select l.share_starts_at as starts_at,
                       least(l.share_starts_at + make_interval(months => l.share_months),
                             coalesce(l.removed_at + make_interval(days => l.notice_days), 'infinity'::timestamptz)) as ends_at) w on true
  join public.frrata_invoices f on f.tenant_id = l.tenant_id and f.period_start = v_month
  where l.partner_id = me.partner_id
    and l.share_starts_at is not null and (l.removed_at is null or l.removed_at >= l.share_starts_at)
    and f.period_end > w.starts_at and f.period_start < w.ends_at
    and f.issued_at is not null and not f.test_mode and not f.rolled
  order by l.tenant_id, l.share_starts_at desc;
end $$;
--> statement-breakpoint

-- ── The list's billing facts (owner only): every deal, and every UNPAID bill (amount and due day; at most 500 a
--    client, the most a client holds, oldest due first). Paid bills and labels stay on the client's page. ──
create or replace function app_partner_bill_summary(p_uid uuid, p_session uuid, p_stepup text) returns table (
  tenant_id uuid, kind text, amount bigint, renews_on date, open_bills jsonb, bills integer)
  language plpgsql stable security definer set search_path = '' as $$
declare me record;
begin
  select x.* into me from public.app_pm_live(p_uid) x where x.role = 'owner';
  if me.member_id is null then return; end if;
  perform public.app_partner_need(p_uid, p_session, p_stepup, false);
  return query
  with t as (select d.tenant_id from public.partner_client_deals d where d.partner_id = me.partner_id
             union select b.tenant_id from public.partner_client_bills b where b.partner_id = me.partner_id)
  select t.tenant_id, d.kind, d.amount, d.renews_on,
    coalesce((select jsonb_agg(jsonb_build_array(o.amount, o.due_on) order by o.due_on)
                from (select b.amount, b.due_on from public.partner_client_bills b
                       where b.partner_id = me.partner_id and b.tenant_id = t.tenant_id and b.paid_at is null
                       order by b.due_on limit 500) o), '[]'::jsonb),
    (select count(*)::integer from public.partner_client_bills b where b.partner_id = me.partner_id and b.tenant_id = t.tenant_id)
  from t left join public.partner_client_deals d on d.partner_id = me.partner_id and d.tenant_id = t.tenant_id;
end $$;
--> statement-breakpoint

-- ── One client's bills (owner only), for its page: the link must be the caller's partner's. The last 13 months by due
--    day and every unpaid one, newest first, at most 200. ──
create or replace function app_partner_client_bills(p_uid uuid, p_session uuid, p_stepup text, p_link uuid) returns table (
  id uuid, label text, number text, amount bigint, due_on date, paid_at timestamptz)
  language plpgsql stable security definer set search_path = '' as $$
declare me record; v_tenant uuid;
begin
  select x.* into me from public.app_pm_live(p_uid) x where x.role = 'owner';
  if me.member_id is null then raise exception 'not_owner' using errcode = 'P0001'; end if;
  perform public.app_partner_need(p_uid, p_session, p_stepup, false);
  select l.tenant_id into v_tenant from public.partner_links l where l.id = p_link and l.partner_id = me.partner_id;
  if v_tenant is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  return query
  select b.id, b.label, b.number, b.amount, b.due_on, b.paid_at from public.partner_client_bills b
   where b.partner_id = me.partner_id and b.tenant_id = v_tenant
     and (b.paid_at is null or b.due_on >= (now() at time zone 'Asia/Kolkata')::date - interval '13 months')
   order by b.due_on desc, b.created_at desc limit 200;
end $$;
--> statement-breakpoint

-- ── Bill writes are counted first, in their own statement (a refused write still counts): 60 a person a minute,
--    failing closed. Its own table: app_partner_try and the passkey limits are untouched. ──
create or replace function app_partner_bill_try(p_uid uuid, p_session uuid, p_stepup text) returns void
  language plpgsql volatile security definer set search_path = '' as $$
declare me record;
begin
  select x.* into me from public.app_pm_live(p_uid) x where x.role = 'owner';
  if me.member_id is null then raise exception 'not_owner' using errcode = 'P0001'; end if;
  perform public.app_partner_need(p_uid, p_session, p_stepup, false);
  perform pg_advisory_xact_lock(hashtextextended(p_uid::text || ':bill-try', 0));
  delete from public.partner_bill_tries where at < now() - interval '1 minute';
  if (select count(*) from public.partner_bill_tries t where t.user_id = p_uid and t.at > now() - interval '1 minute') >= 60 then
    raise exception 'too_many' using errcode = 'P0001';
  end if;
  insert into public.partner_bill_tries (user_id) values (p_uid);
end $$;
--> statement-breakpoint

-- The owner and the store behind a link, for the writes (no grant of its own: called inside the definers below).
create or replace function app_partner_bill_owner(p_uid uuid, p_session uuid, p_stepup text, p_link uuid,
  out member_id uuid, out partner_id uuid, out tenant_id uuid)
  language plpgsql stable security definer set search_path = '' as $$
begin
  select x.member_id, x.partner_id into member_id, partner_id from public.app_pm_live(p_uid) x where x.role = 'owner';
  if member_id is null then raise exception 'not_owner' using errcode = 'P0001'; end if;
  perform public.app_partner_need(p_uid, p_session, p_stepup, false);
  if p_link is not null then
    select l.tenant_id into tenant_id from public.partner_links l where l.id = p_link and l.partner_id = app_partner_bill_owner.partner_id;
    if tenant_id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  end if;
end $$;
--> statement-breakpoint

create or replace function app_partner_deal_set(p_uid uuid, p_session uuid, p_stepup text, p_link uuid,
  p_kind text, p_amount bigint, p_renews_on date) returns void
  language plpgsql volatile security definer set search_path = '' as $$
declare o record;
begin
  select * into o from public.app_partner_bill_owner(p_uid, p_session, p_stepup, p_link);
  if p_kind not in ('project', 'retainer') or p_amount is null or p_amount < 100 or p_amount > 10000000000
     or (p_kind = 'project' and p_renews_on is not null)
     or (p_renews_on is not null and (p_renews_on < date '2020-01-01' or p_renews_on > date '2100-12-31')) then
    raise exception 'bad_input' using errcode = 'P0001';
  end if;
  insert into public.partner_client_deals (partner_id, tenant_id, kind, amount, renews_on, updated_at, updated_by)
    values (o.partner_id, o.tenant_id, p_kind, p_amount, p_renews_on, now(), o.member_id)
  on conflict (partner_id, tenant_id) do update
    set kind = excluded.kind, amount = excluded.amount, renews_on = excluded.renews_on, updated_at = now(), updated_by = excluded.updated_by;
end $$;
--> statement-breakpoint

-- Recording a retainer's bill due on or after its next bill moves that day a month on (owner, 2026-11-15, mockup v2).
create or replace function app_partner_bill_add(p_uid uuid, p_session uuid, p_stepup text, p_link uuid,
  p_label text, p_number text, p_amount bigint, p_due_on date) returns uuid
  language plpgsql volatile security definer set search_path = '' as $$
declare o record; v_id uuid; v_label text := btrim(coalesce(p_label, '')); v_number text := nullif(btrim(coalesce(p_number, '')), '');
begin
  select * into o from public.app_partner_bill_owner(p_uid, p_session, p_stepup, p_link);
  if length(v_label) not between 1 and 60 or p_amount is null or p_amount < 100 or p_amount > 10000000000
     or p_due_on is null or p_due_on < date '2020-01-01' or p_due_on > date '2100-12-31'
     or (v_number is not null and v_number !~ '^[A-Za-z0-9/-]{1,20}$') then
    raise exception 'bad_input' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(o.partner_id::text || o.tenant_id::text, 0));
  if (select count(*) from public.partner_client_bills b where b.partner_id = o.partner_id and b.tenant_id = o.tenant_id) >= 500 then
    raise exception 'too_many_bills' using errcode = 'P0001';
  end if;
  insert into public.partner_client_bills (partner_id, tenant_id, label, number, amount, due_on, created_by)
    values (o.partner_id, o.tenant_id, v_label, v_number, p_amount, p_due_on, o.member_id) returning id into v_id;
  update public.partner_client_deals d set renews_on = (p_due_on + interval '1 month')::date, updated_at = now(), updated_by = o.member_id
   where d.partner_id = o.partner_id and d.tenant_id = o.tenant_id and d.kind = 'retainer' and d.renews_on is not null and p_due_on >= d.renews_on;
  return v_id;
end $$;
--> statement-breakpoint

create or replace function app_partner_bill_paid(p_uid uuid, p_session uuid, p_stepup text, p_bill uuid, p_paid boolean) returns void
  language plpgsql volatile security definer set search_path = '' as $$
declare o record; n int;
begin
  select * into o from public.app_partner_bill_owner(p_uid, p_session, p_stepup, null);
  update public.partner_client_bills b
     set paid_at = case when p_paid then coalesce(b.paid_at, now()) end,
         paid_by = case when p_paid then coalesce(b.paid_by, o.member_id) end
   where b.id = p_bill and b.partner_id = o.partner_id;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'not_found' using errcode = 'P0001'; end if;
end $$;
--> statement-breakpoint

create or replace function app_partner_bill_delete(p_uid uuid, p_session uuid, p_stepup text, p_bill uuid) returns void
  language plpgsql volatile security definer set search_path = '' as $$
declare o record; n int;
begin
  select * into o from public.app_partner_bill_owner(p_uid, p_session, p_stepup, null);
  delete from public.partner_client_bills b where b.id = p_bill and b.partner_id = o.partner_id;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'not_found' using errcode = 'P0001'; end if;
end $$;
--> statement-breakpoint

-- ── Frrata Admin: a count and the first bill's day per partner, never a bill (owner, 2026-11-15, Q2). ──
create or replace function admin_partner_bill_stats() returns table (partner_id uuid, first_bill_at timestamptz, bills bigint)
  language sql stable security definer set search_path = '' as $$
  select b.partner_id, min(b.created_at), count(*) from public.partner_client_bills b group by b.partner_id
$$;
--> statement-breakpoint

-- ── Grants: every function here revoked from everyone (Supabase grants new functions to anon, authenticated and
--    service_role by default; frata_builder may execute no definer, § 82), then one grant each. ──
revoke all on function app_partner_clients(uuid, uuid, text), app_partner_client_shares(uuid, uuid, text),
  app_partner_bill_summary(uuid, uuid, text), app_partner_client_bills(uuid, uuid, text, uuid),
  app_partner_bill_try(uuid, uuid, text), app_partner_bill_owner(uuid, uuid, text, uuid),
  app_partner_deal_set(uuid, uuid, text, uuid, text, bigint, date), app_partner_bill_add(uuid, uuid, text, uuid, text, text, bigint, date),
  app_partner_bill_paid(uuid, uuid, text, uuid, boolean), app_partner_bill_delete(uuid, uuid, text, uuid), admin_partner_bill_stats()
  from public, anon, authenticated, service_role, frata_builder, frata_app, frata_admin;
--> statement-breakpoint
grant execute on function app_partner_clients(uuid, uuid, text), app_partner_client_shares(uuid, uuid, text),
  app_partner_bill_summary(uuid, uuid, text), app_partner_client_bills(uuid, uuid, text, uuid),
  app_partner_bill_try(uuid, uuid, text),
  app_partner_deal_set(uuid, uuid, text, uuid, text, bigint, date), app_partner_bill_add(uuid, uuid, text, uuid, text, text, bigint, date),
  app_partner_bill_paid(uuid, uuid, text, uuid, boolean), app_partner_bill_delete(uuid, uuid, text, uuid)
  to frata_app;
--> statement-breakpoint
grant execute on function admin_partner_bill_stats() to frata_admin;
