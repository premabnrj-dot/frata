-- Security review 2026-11-08 (docs/research/2026-11-08-performance-security-motion-review.md).
--
-- S4: a webhook row is readable and writable only inside its own shop. The Razorpay receiver now stores inside the
-- shop its URL key names (withTenant), so the no-shop branch (drizzle/0030) is gone for every provider. The daily
-- sweep still learns WHICH shops have work from app_pending_event_shops (a definer that returns ids only).
alter policy webhook_read on webhook_events using (tenant_id = app_current_tenant());
--> statement-breakpoint
alter policy webhook_insert on webhook_events with check (tenant_id = app_current_tenant());
--> statement-breakpoint
-- S4: processed Razorpay events keep only what reconciliation reads (src/lib/webhooks/razorpay.ts KEPT_PAYMENT_FIELDS);
-- the shopper's email, phone, VPA and card details go. Rows processed from now on are trimmed by processEvents.
update webhook_events e set payload = jsonb_strip_nulls(jsonb_build_object(
    'event', e.payload -> 'event',
    'payload', case when e.payload #> '{payload,payment,entity}' is null then null else jsonb_build_object('payment', jsonb_build_object('entity',
      (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each(e.payload #> '{payload,payment,entity}') as f(k, v)
        where k in ('id', 'order_id', 'amount', 'currency', 'status', 'method', 'fee', 'tax')))) end))
  where e.provider = 'razorpay' and e.processed_at is not null;
--> statement-breakpoint
-- S12: Supabase gives service_role EXECUTE on new functions by default privileges, and the early migrations revoked
-- only public, anon and authenticated. No Frrata function is for service_role (it is reachable only through the
-- Data API, which stays off): revoke every function in public from it, and stop future ones getting it.
do $$
declare f record;
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.prokind = 'f' loop
      execute format('revoke execute on function %s from service_role', f.sig);
    end loop;
  end if;
end $$;
--> statement-breakpoint
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    alter default privileges in schema public revoke execute on functions from service_role;
  end if;
end $$;
