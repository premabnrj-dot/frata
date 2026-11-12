-- =============================================================================
-- ORDER EDIT OE·2 — ACCESS (paid online; docs/plans/2026-11-12-order-edit.md § Increase on a paid order, § Razorpay
-- facts that shape OE·2). Hand-written.
--
-- order_refunds: the shop reads and appends its OWN attempts and marks each one's moments as it goes (cancelled by an
--   Undo, claimed by the sender, sent, processed, failed); its order, edit, payment, amount and cause never change, and
--   no attempt is ever deleted (a failed one is tried again as a new row). Each moment is written once (a trigger).
--   frata_admin: none. anon, authenticated, service_role: none.
-- order_edits: a paid order's edit that waits for the shopper's payment is settled later — its second Razorpay order,
--   the payment, when it was paid or dropped, the fee, and the offers it took off and added (known only once applied).
--   Each of those is written once (a trigger). Totals, lines and who did it never change (0118).
-- order_edit_lines: an `after` line of a waiting edit names the order line it became once it is paid, once.
-- app_edit_payment_notice: a request still waiting after 24 hours tells the shop (Notices, needs_you), once per edit,
--   from the edit's own row inside the shop that is set (never another shop's edit, never a forged one).
-- =============================================================================
revoke all on order_refunds from anon, authenticated, service_role;
--> statement-breakpoint
alter table order_refunds enable row level security;
--> statement-breakpoint
create policy tenant_rows on order_refunds for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint
grant select, insert on order_refunds to frata_app;
--> statement-breakpoint
grant update (cancelled_at, sending_at, razorpay_refund_id, sent_at, processed_at, failed_at, failure) on order_refunds to frata_app;
--> statement-breakpoint
grant update (razorpay_order_id, razorpay_payment_id, paid_at, dropped_at, dropped_reason, gateway_fee, gateway_tax, offers_removed, offers_added) on order_edits to frata_app;
--> statement-breakpoint
grant update (order_line_id) on order_edit_lines to frata_app;
--> statement-breakpoint
create or replace function app_refund_moments_once() returns trigger language plpgsql set search_path = '' as $$
begin
  if (old.cancelled_at is not null and new.cancelled_at is distinct from old.cancelled_at)
     or (old.sending_at is not null and new.sending_at is distinct from old.sending_at)
     or (old.razorpay_refund_id is not null and new.razorpay_refund_id is distinct from old.razorpay_refund_id)
     or (old.sent_at is not null and new.sent_at is distinct from old.sent_at)
     or (old.processed_at is not null and new.processed_at is distinct from old.processed_at)
     or (old.failed_at is not null and (new.failed_at is distinct from old.failed_at or new.failure is distinct from old.failure)) then
    raise exception 'order_refunds: a moment is written once' using errcode = '23514';
  end if;
  return new;
end $$;
--> statement-breakpoint
create trigger order_refunds_once before update on order_refunds for each row execute function app_refund_moments_once();
--> statement-breakpoint
create or replace function app_edit_settled_once() returns trigger language plpgsql set search_path = '' as $$
begin
  if (old.razorpay_order_id is not null and new.razorpay_order_id is distinct from old.razorpay_order_id)
     or (old.razorpay_payment_id is not null and new.razorpay_payment_id is distinct from old.razorpay_payment_id)
     or (old.paid_at is not null and new.paid_at is distinct from old.paid_at)
     or (old.dropped_at is not null and (new.dropped_at is distinct from old.dropped_at or new.dropped_reason is distinct from old.dropped_reason))
     or (old.gateway_fee is not null and new.gateway_fee is distinct from old.gateway_fee)
     or (old.gateway_tax is not null and new.gateway_tax is distinct from old.gateway_tax)
     -- The offers it took off and added are written as it is applied, never after (nor on an edit that never waited).
     or ((old.offers_removed is distinct from new.offers_removed or old.offers_added is distinct from new.offers_added)
         and (old.asked is null or old.paid_at is not null or old.dropped_at is not null)) then
    raise exception 'order_edits: a settled edit is written once' using errcode = '23514';
  end if;
  return new;
end $$;
--> statement-breakpoint
create trigger order_edits_settled_once before update on order_edits for each row execute function app_edit_settled_once();
--> statement-breakpoint
create or replace function app_edit_line_once() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.order_line_id is not null and new.order_line_id is distinct from old.order_line_id then
    raise exception 'order_edit_lines: a line is named once' using errcode = '23514';
  end if;
  return new;
end $$;
--> statement-breakpoint
create trigger order_edit_lines_once before update on order_edit_lines for each row execute function app_edit_line_once();
--> statement-breakpoint
revoke all on function app_refund_moments_once(), app_edit_settled_once(), app_edit_line_once() from public, anon, authenticated, service_role, frata_admin;
--> statement-breakpoint
create or replace function app_edit_payment_notice(p_edit uuid) returns boolean
  language plpgsql volatile security definer set search_path = '' as $$
declare e record;
begin
  select x.id, x.tenant_id, o.number into e from public.order_edits x join public.orders o on o.tenant_id = x.tenant_id and o.id = x.order_id
   where x.id = p_edit and x.tenant_id = public.app_current_tenant() and x.asked is not null and x.paid_at is null and x.dropped_at is null
     and x.created_at <= now() - interval '24 hours' and o.cancelled_at is null and o.packed_at is null;
  if e.id is null then return false; end if;
  if exists (select 1 from public.notices n where n.tenant_id = e.tenant_id and n.source_kind = 'edit_payment' and n.source_id = e.id) then return false; end if;
  perform public.notice_write(e.tenant_id, 'needs_you', 'edit_payment', e.id, null, null, '/console/orders/' || e.number, false, true, null, null);
  return true;
end $$;
--> statement-breakpoint
revoke all on function app_edit_payment_notice(uuid) from public, anon, authenticated, service_role, frata_admin;
--> statement-breakpoint
grant execute on function app_edit_payment_notice(uuid) to frata_app;
