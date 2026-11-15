-- Neel N4 (plan docs/plans/2026-11-15-neel-n4-admin.md; security and architecture reviews on the plan, 2026-11-15).
-- 1. admin_waiting_passkeys: the passkey requests that wait on a master admin, across partners and staff, for Admin ›
--    Today and the nav counts. Names and ages only, never a code or a device; a master admin only (checked here); never
--    the caller's own request (another master admin approves it).
-- 2. app_record_frrata_refund: an over-payment Frrata sent back from its bank, recorded once. frata_admin only reads
--    frrata_payments (0055): this definer is the one writer of the refund columns.

create or replace function admin_waiting_passkeys(p_staff uuid)
  returns table (kind text, ref uuid, name text, since timestamptz)
  language plpgsql stable security definer set search_path = '' as $$
begin
  if (select ps.role from public.platform_staff ps where ps.user_id = p_staff) is distinct from 'admin' then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  return query
    select 'partner'::text, pa.id, coalesce(nullif(pa.business_name, ''), pa.name)::text, r.created_at
      from public.partner_passkey_requests r
      join public.partner_members pm on pm.id = r.partner_member_id and pm.role = 'owner' and pm.removed_at is null
      join public.partners pa on pa.id = pm.partner_id
     where r.used_at is null and r.declined_at is null and r.approved_at is null and r.expires_at > now()
       and r.user_id is distinct from p_staff
    union all
    select 'staff'::text, ps.user_id, ps.email::text, e.created_at
      from public.staff_enrolment_requests e
      join public.platform_staff ps on ps.user_id = e.user_id
     where e.used_at is null and e.approved_at is null and e.expires_at > now() and e.user_id <> p_staff
    order by 4;
end $$;--> statement-breakpoint

create or replace function app_record_frrata_refund(p_payment uuid, p_utr text, p_sent_on date, p_staff uuid) returns bigint
  language plpgsql security definer set search_path = '' as $$
declare pay record; inv_test boolean;
begin
  if (select ps.role from public.platform_staff ps where ps.user_id = p_staff) is distinct from 'admin' then
    raise exception 'refund: a master admin records it' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(p_utr), '') = '' or p_sent_on is null or p_sent_on > (now() at time zone 'Asia/Kolkata')::date
     or p_sent_on < (now() at time zone 'Asia/Kolkata')::date - 90 then
    raise exception 'refund: a reference and the day it was sent are needed' using errcode = 'invalid_parameter_value';
  end if;
  select p.id, p.invoice_id, p.captured_at, p.over_paid, p.refunded_at into pay from public.frrata_payments p where p.id = p_payment for update;
  if pay.id is null or pay.captured_at is null then raise exception 'refund: no such payment' using errcode = 'invalid_parameter_value'; end if;
  if p_sent_on < (pay.captured_at at time zone 'Asia/Kolkata')::date then
    raise exception 'refund: it can’t be sent before the payment arrived' using errcode = 'invalid_parameter_value';
  end if;
  if pay.over_paid <= 0 then raise exception 'refund: nothing was over-paid' using errcode = 'check_violation'; end if;
  if pay.refunded_at is not null then raise exception 'refund: already recorded' using errcode = 'check_violation'; end if;
  select i.test_mode into inv_test from public.frrata_invoices i where i.id = pay.invoice_id;
  if inv_test then raise exception 'refund: a test invoice is never refunded by hand' using errcode = 'check_violation'; end if;
  update public.frrata_payments
     set refund_amount = pay.over_paid, refund_utr = upper(btrim(p_utr)),
         refunded_at = (p_sent_on::timestamp at time zone 'Asia/Kolkata'), refunded_by = p_staff
   where id = p_payment;
  return pay.over_paid;
end $$;--> statement-breakpoint

revoke all on function admin_waiting_passkeys(uuid), app_record_frrata_refund(uuid, text, date, uuid)
  from public, anon, authenticated, service_role, frata_app;--> statement-breakpoint
grant execute on function admin_waiting_passkeys(uuid), app_record_frrata_refund(uuid, text, date, uuid) to frata_admin;
