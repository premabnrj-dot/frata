-- =============================================================================
-- EMAIL E·1 — NOTICES (plan docs/plans/2026-11-11-email.md, tasks 8–10). Hand-written. A notice and its outbox row
-- are written in the SAME transaction as their cause (ADR-0006; architecture review A8), by definers only: frata_app
-- has no insert on notices (a shop can't forge "Frrata, required"), frata_admin has no outbox grant. The outbox row
-- carries the notice id only; recipients, preferences and the 10-minute read rule are resolved when it sends.
-- =============================================================================
create or replace function notice_write(p_tenant uuid, p_type text, p_source_kind text, p_source uuid, p_title text, p_body text, p_href text,
  p_required boolean, p_email boolean, p_batch uuid, p_by uuid) returns uuid
  language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  insert into public.notices (tenant_id, type, source_kind, source_id, title, body, href, required, email, batch_id, by)
    values (p_tenant, p_type, p_source_kind, p_source, p_title, p_body, p_href, p_required, p_email, p_batch, p_by) returning id into v_id;
  if p_email then
    insert into public.outbox (tenant_id, kind, dedupe_key, payload, next_attempt_at)
      values (p_tenant, 'email.notice', 'notice:' || v_id, jsonb_build_object('noticeId', v_id),
              -- Optional notices wait 10 minutes: one read in the console by then and that person is not emailed (Linear).
              now() + case when p_required then interval '0' else interval '10 minutes' end);
  end if;
  return v_id;
end $$;--> statement-breakpoint
revoke all on function notice_write(uuid, text, text, uuid, text, text, text, boolean, boolean, uuid, uuid) from public, anon, authenticated, service_role, frata_app, frata_admin;--> statement-breakpoint
-- ── Billing: a debit notice, a failed debit or an acknowledgement is also a required notice (worded from its row).
create or replace function app_billing_notice(p_invoice uuid, p_kind text, p_amount bigint, p_debit_at timestamptz) returns void
  language plpgsql security definer set search_path = '' as $$
declare inv record; v_id uuid;
begin
  select id, tenant_id from public.frrata_invoices where id = p_invoice and number is not null into inv;
  if inv.id is null then return; end if;
  if p_kind = 'acknowledge' and exists (select 1 from public.billing_notices where invoice_id = p_invoice and kind = 'acknowledge') then return; end if;
  insert into public.billing_notices (tenant_id, invoice_id, kind, amount, debit_at) values (inv.tenant_id, p_invoice, p_kind, p_amount, p_debit_at) returning id into v_id;
  perform public.notice_write(inv.tenant_id, 'billing', 'billing_notice', v_id, null, null, '/console/settings/billing', true, true, null, null);
end $$;--> statement-breakpoint
-- ── A support visit opened: a required security notice to the shop, from the visit's own row (tenant from it, never
--    an argument), called in the same transaction that starts the visit, by the staffer who started it.
create or replace function app_support_notice(p_session uuid, p_staff uuid) returns void
  language plpgsql volatile security definer set search_path = '' as $$
declare s record;
begin
  select id, tenant_id from public.support_sessions where id = p_session and staff_user_id = p_staff and ended_at is null
     and started_at > now() - interval '5 minutes' into s;
  if s.id is null then raise exception 'support: no such visit' using errcode = 'P0001'; end if;
  perform public.notice_write(s.tenant_id, 'security', 'support_session', s.id, null, null, '/console/activity', true, true, null, null);
end $$;--> statement-breakpoint
-- ── Admin writes to shops: every shop, every shop on a plan, or one shop. Plain text; a /console/ link; required only
--    for billing, security and Frrata-action notices (the CHECK on notices); audited; returns the batch and the count.
create or replace function app_admin_notice_fanout(p_uid uuid, p_audience text, p_plan text, p_tenant uuid, p_type text, p_title text, p_body text,
  p_href text, p_required boolean, p_email boolean) returns table (batch uuid, n int)
  language plpgsql volatile security definer set search_path = '' as $$
declare v_email text; v_batch uuid := gen_random_uuid(); v_n int := 0; t uuid;
begin
  select s.email into v_email from public.platform_staff s where s.user_id = p_uid and s.role = 'admin';
  if v_email is null then raise exception 'not_staff' using errcode = 'P0001'; end if;
  if p_audience not in ('all', 'plan', 'shop') or length(btrim(coalesce(p_title, ''))) not between 3 and 120 or length(coalesce(p_body, '')) > 1000 then
    raise exception 'notice: bad input' using errcode = 'P0001'; end if;
  for t in
    select x.id from public.tenants x
     where (p_audience = 'all')
        or (p_audience = 'shop' and x.id = p_tenant)
        or (p_audience = 'plan' and exists (select 1 from public.tenant_plans tp join public.plan_versions pv on pv.id = tp.plan_version_id join public.plans p on p.id = pv.plan_id
                                             where tp.tenant_id = x.id and p.code = p_plan and tp.starts_at <= now()
                                               and not exists (select 1 from public.tenant_plans later where later.tenant_id = x.id and later.starts_at > tp.starts_at and later.starts_at <= now())))
  loop
    perform public.notice_write(t, p_type, 'admin', null, btrim(p_title), nullif(btrim(coalesce(p_body, '')), ''), p_href, p_required, p_email, v_batch, p_uid);
    v_n := v_n + 1;
  end loop;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    values (case when p_audience = 'shop' then p_tenant end, p_uid, v_email, 'staff', 'notice.send', btrim(p_title),
            jsonb_build_object('audience', p_audience, 'plan', p_plan, 'type', p_type, 'required', p_required, 'email', p_email, 'shops', v_n, 'batch', v_batch));
  return query select v_batch, v_n;
end $$;--> statement-breakpoint
-- What Admin sent, by batch (counts only).
create or replace function app_admin_notice_batches(p_uid uuid) returns table (batch uuid, title text, type text, required boolean, shops bigint, at timestamptz)
  language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.platform_staff s where s.user_id = p_uid) then raise exception 'not_staff' using errcode = 'P0001'; end if;
  return query select n.batch_id, min(n.title), min(n.type), bool_or(n.required), count(*), min(n.created_at)
    from public.notices n where n.batch_id is not null group by n.batch_id order by min(n.created_at) desc limit 100;
end $$;--> statement-breakpoint
revoke all on function app_support_notice(uuid, uuid), app_admin_notice_fanout(uuid, text, text, uuid, text, text, text, text, boolean, boolean),
  app_admin_notice_batches(uuid) from public, anon, authenticated, service_role, frata_app;--> statement-breakpoint
grant execute on function app_support_notice(uuid, uuid), app_admin_notice_fanout(uuid, text, text, uuid, text, text, text, text, boolean, boolean),
  app_admin_notice_batches(uuid) to frata_admin;
