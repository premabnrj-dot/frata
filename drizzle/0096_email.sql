CREATE TABLE "email_daily" (
	"day" date NOT NULL,
	"tenant_id" uuid NOT NULL,
	"sent" integer DEFAULT 0 NOT NULL,
	"delivered" integer DEFAULT 0 NOT NULL,
	"bounced" integer DEFAULT 0 NOT NULL,
	"complained" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "email_daily_pk" PRIMARY KEY("tenant_id","day")
);
--> statement-breakpoint
CREATE TABLE "email_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"order_id" uuid,
	"event_id" uuid,
	"notice_id" uuid,
	"user_id" uuid,
	"provider_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempted_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"bounced_at" timestamp with time zone,
	"bounce_kind" text,
	"complained_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"failed_code" text,
	"skipped_at" timestamp with time zone,
	"skip_code" text,
	CONSTRAINT "email_messages_kind" CHECK ("email_messages"."kind" in ('confirmed','finish_paying','shipped','delivered','cancelled','test','invoice','notice','sign_in')),
	CONSTRAINT "email_messages_codes" CHECK (("email_messages"."failed_code" is null or "email_messages"."failed_code" ~ '^[a-z0-9_]{1,48}$') and ("email_messages"."skip_code" is null or "email_messages"."skip_code" ~ '^[a-z_]{1,24}$') and ("email_messages"."bounce_kind" is null or "email_messages"."bounce_kind" in ('permanent','transient','undetermined'))),
	CONSTRAINT "email_messages_provider" CHECK ("email_messages"."provider_id" is null or length("email_messages"."provider_id") <= 200)
);
--> statement-breakpoint
CREATE TABLE "email_shops" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"ses_ready_at" timestamp with time zone,
	"daily_cap" integer DEFAULT 500 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_shops_cap" CHECK ("email_shops"."daily_cap" between 0 and 1000000)
);
--> statement-breakpoint
CREATE TABLE "email_suppressions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"address_hash" text NOT NULL,
	"reason" text NOT NULL,
	"message_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"lifted_at" timestamp with time zone,
	CONSTRAINT "email_suppressions_reason" CHECK ("email_suppressions"."reason" in ('bounce','complaint')),
	CONSTRAINT "email_suppressions_hash" CHECK ("email_suppressions"."address_hash" ~ '^[a-z][a-z0-9]{0,7}:[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "notice_prefs" (
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"email" boolean NOT NULL,
	CONSTRAINT "notice_prefs_pk" PRIMARY KEY("tenant_id","user_id","type"),
	CONSTRAINT "notice_prefs_type" CHECK ("notice_prefs"."type" in ('needs_you','product_update','new_order'))
);
--> statement-breakpoint
CREATE TABLE "notice_reads" (
	"tenant_id" uuid NOT NULL,
	"notice_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notice_reads_pk" PRIMARY KEY("notice_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"type" text NOT NULL,
	"source_kind" text NOT NULL,
	"source_id" uuid,
	"title" text,
	"body" text,
	"href" text,
	"required" boolean DEFAULT false NOT NULL,
	"email" boolean DEFAULT true NOT NULL,
	"batch_id" uuid,
	"by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notices_type" CHECK ("notices"."type" in ('billing','security','frrata_action','needs_you','product_update')),
	CONSTRAINT "notices_source" CHECK ("notices"."source_kind" in ('billing_notice','support_session','handover','admin')),
	CONSTRAINT "notices_href" CHECK ("notices"."href" is null or "notices"."href" ~ '^/console(/[A-Za-z0-9/_?=&.-]*)?$'),
	CONSTRAINT "notices_words" CHECK (coalesce(length("notices"."title"),0) <= 120 and coalesce(length("notices"."body"),0) <= 1000),
	CONSTRAINT "notices_required" CHECK (not "notices"."required" or "notices"."type" in ('billing','security','frrata_action'))
);
--> statement-breakpoint
CREATE TABLE "shop_emails" (
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"off_at" timestamp with time zone,
	"subject" text,
	"preview" text,
	"heading" text,
	"message" text,
	"button" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_emails_pk" PRIMARY KEY("tenant_id","kind"),
	CONSTRAINT "shop_emails_kind" CHECK ("shop_emails"."kind" in ('confirmed','finish_paying','shipped','delivered','cancelled')),
	CONSTRAINT "shop_emails_lengths" CHECK (coalesce(length("shop_emails"."subject"),0) <= 120 and coalesce(length("shop_emails"."preview"),0) <= 140 and coalesce(length("shop_emails"."heading"),0) <= 80 and coalesce(length("shop_emails"."message"),0) <= 600 and coalesce(length("shop_emails"."button"),0) <= 30)
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "email_daily" ADD CONSTRAINT "email_daily_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_order_fk" FOREIGN KEY ("tenant_id","order_id") REFERENCES "public"."orders"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_shops" ADD CONSTRAINT "email_shops_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_suppressions" ADD CONSTRAINT "email_suppressions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notice_prefs" ADD CONSTRAINT "notice_prefs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notice_reads" ADD CONSTRAINT "notice_reads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notice_reads" ADD CONSTRAINT "notice_reads_notice_id_notices_id_fk" FOREIGN KEY ("notice_id") REFERENCES "public"."notices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notices" ADD CONSTRAINT "notices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_emails" ADD CONSTRAINT "shop_emails_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_messages_order" ON "email_messages" USING btree ("tenant_id","order_id") WHERE "email_messages"."order_id" is not null;--> statement-breakpoint
CREATE INDEX "email_messages_tenant_created" ON "email_messages" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "email_messages_notice_user" ON "email_messages" USING btree ("notice_id","user_id") WHERE "email_messages"."notice_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "email_suppressions_live" ON "email_suppressions" USING btree ("tenant_id","address_hash") WHERE "email_suppressions"."lifted_at" is null;--> statement-breakpoint
CREATE INDEX "notice_reads_user" ON "notice_reads" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "notices_tenant_created" ON "notices" USING btree ("tenant_id","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_email" CHECK ("orders"."email" is null or (length("orders"."email") <= 254 and "orders"."email" ~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$'));--> statement-breakpoint
-- =============================================================================
-- EMAIL E·0 — ACCESS AND DEFINERS (plan docs/plans/2026-11-11-email.md; ADR-0011). Hand-written.
-- Tenant tables for frata_app, policies using + with check on app_current_tenant(); no delete grants; nothing for
-- anon, authenticated, service_role or frata_admin (Admin reads through definers). notices and email_daily are written
-- only by definers. The outbox claim loses its no-tenant branch: the drain claims and settles rows through definers.
-- =============================================================================
revoke all on email_messages, email_suppressions, shop_emails, email_shops, email_daily, notices, notice_reads, notice_prefs
  from public, anon, authenticated, service_role, frata_admin;--> statement-breakpoint
alter table email_messages enable row level security;--> statement-breakpoint
alter table email_suppressions enable row level security;--> statement-breakpoint
alter table shop_emails enable row level security;--> statement-breakpoint
alter table email_shops enable row level security;--> statement-breakpoint
alter table email_daily enable row level security;--> statement-breakpoint
alter table notices enable row level security;--> statement-breakpoint
alter table notice_reads enable row level security;--> statement-breakpoint
alter table notice_prefs enable row level security;--> statement-breakpoint
grant select, insert, update on email_messages, email_suppressions, shop_emails, email_shops, notice_prefs to frata_app;--> statement-breakpoint
grant select, insert on notice_reads to frata_app;--> statement-breakpoint
grant select on notices, email_daily to frata_app;--> statement-breakpoint
create policy tenant_rows on email_messages for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());--> statement-breakpoint
create policy tenant_rows on email_suppressions for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());--> statement-breakpoint
create policy tenant_rows on shop_emails for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());--> statement-breakpoint
create policy tenant_rows on email_shops for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());--> statement-breakpoint
create policy tenant_rows on email_daily for select to frata_app using (tenant_id = app_current_tenant());--> statement-breakpoint
create policy tenant_rows on notices for select to frata_app using (tenant_id = app_current_tenant());--> statement-breakpoint
create policy tenant_rows on notice_reads for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());--> statement-breakpoint
create policy tenant_rows on notice_prefs for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());--> statement-breakpoint
-- ── The outbox: no row is readable or writable without its shop set (tenancy and security reviews, setup § Later 2). ──
alter policy outbox_sweep_read on outbox using (tenant_id = app_current_tenant());--> statement-breakpoint
alter policy outbox_sweep_update on outbox using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());--> statement-breakpoint
create or replace function app_outbox_claim(p_limit int) returns setof public.outbox
  language sql volatile security definer set search_path = '' as $$
  update public.outbox set attempts = attempts + 1,
    next_attempt_at = now() + make_interval(mins => (attempts + 1) * (attempts + 1))
  where id in (select id from public.outbox where sent_at is null and dead_at is null and next_attempt_at <= now()
                order by next_attempt_at limit least(greatest(p_limit, 1), 100) for update skip locked)
  returning * $$;--> statement-breakpoint
-- sent · failed (dead at p_max attempts) · later (no attempt spent; p_minutes) · dead. Errors are our codes (≤ 500).
create or replace function app_outbox_settle(p_id uuid, p_outcome text, p_error text, p_minutes int, p_max int) returns void
  language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_outcome = 'sent' then update public.outbox set sent_at = now(), last_error = null where id = p_id;
  elsif p_outcome = 'failed' then update public.outbox set last_error = left(p_error, 500), dead_at = case when attempts >= p_max then now() end where id = p_id;
  elsif p_outcome = 'later' then update public.outbox set attempts = greatest(attempts - 1, 0), next_attempt_at = now() + make_interval(mins => least(greatest(p_minutes, 1), 1440)), last_error = left(p_error, 500) where id = p_id;
  elsif p_outcome = 'dead' then update public.outbox set dead_at = now(), last_error = left(p_error, 500) where id = p_id;
  else raise exception 'outbox: bad outcome' using errcode = 'invalid_parameter_value'; end if;
end $$;--> statement-breakpoint
-- ── An SES event (verified by the route) → its message, routed ONLY by our id `m` (tenancy H1). `t` is a cross-check:
--    an unknown m or a mismatch stores nothing. The payload is trimmed: type, m, bounce kind, time, and for a permanent
--    bounce or a complaint the per-shop address hash the route computed with t. Applied in the same call (two updates).
create or replace function app_store_ses_event(p_sns_id text, p_m uuid, p_t uuid, p_type text, p_provider text, p_bounce text, p_hash text, p_at timestamptz)
  returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare msg public.email_messages%rowtype; inserted uuid;
begin
  if p_sns_id !~ '^[A-Za-z0-9-]{1,80}$' or p_type not in ('Delivery', 'Bounce', 'Complaint', 'Reject')
     or (p_provider is not null and length(p_provider) > 200) or (p_bounce is not null and p_bounce not in ('permanent', 'transient', 'undetermined'))
     or (p_hash is not null and p_hash !~ '^[a-z][a-z0-9]{0,7}:[0-9a-f]{64}$') then return false; end if;
  select * into msg from public.email_messages where id = p_m for update;
  if msg.id is null or msg.tenant_id <> p_t then return false; end if;
  if msg.provider_id is not null and p_provider is not null and msg.provider_id <> p_provider then return false; end if;
  insert into public.webhook_events (provider, event_key, tenant_id, payload, processed_at)
    values ('ses', 'ses:' || p_sns_id, msg.tenant_id, jsonb_build_object('type', p_type, 'm', p_m, 'bounce', p_bounce, 'at', p_at), now())
    on conflict (event_key) do nothing returning tenant_id into inserted;
  if inserted is null then return true; end if;
  update public.email_messages set provider_id = coalesce(provider_id, p_provider), sent_at = coalesce(sent_at, attempted_at),
    delivered_at = case when p_type = 'Delivery' then coalesce(delivered_at, p_at) else delivered_at end,
    bounced_at = case when p_type = 'Bounce' then coalesce(bounced_at, p_at) else bounced_at end,
    bounce_kind = case when p_type = 'Bounce' then p_bounce else bounce_kind end,
    complained_at = case when p_type = 'Complaint' then coalesce(complained_at, p_at) else complained_at end,
    failed_at = case when p_type = 'Reject' then coalesce(failed_at, p_at) else failed_at end,
    failed_code = case when p_type = 'Reject' then 'ses_reject' else failed_code end
  where id = msg.id;
  if p_hash is not null and (p_type = 'Complaint' or (p_type = 'Bounce' and p_bounce = 'permanent')) then
    insert into public.email_suppressions (tenant_id, address_hash, reason, message_id)
      values (msg.tenant_id, p_hash, case when p_type = 'Complaint' then 'complaint' else 'bounce' end, msg.id)
      on conflict do nothing;
  end if;
  return true;
end $$;--> statement-breakpoint
-- ── One member's address, for a notice: only a current member of THIS shop (bound to app_current_tenant(); tenancy
--    H2). Billing and security go to owners and admins only (p_owner_admin).
create or replace function app_member_email(p_user uuid, p_owner_admin boolean) returns text
  language sql stable security definer set search_path = '' as $$
  select u.email::text from public.members m join auth.users u on u.id = m.user_id
   where m.tenant_id = public.app_current_tenant() and m.user_id = p_user
     and (not p_owner_admin or m.role in ('owner', 'admin')) and u.email is not null $$;--> statement-breakpoint
-- The members a notice may reach (ids and roles; no addresses), this shop only.
create or replace function app_notice_members() returns table (user_id uuid, role text)
  language sql stable security definer set search_path = '' as $$
  select m.user_id, m.role from public.members m where m.tenant_id = public.app_current_tenant() and m.role <> 'accountant' $$;--> statement-breakpoint
-- ── The daily roll-up and retention (cron): yesterday's and today's counts into email_daily; messages after 180 days,
--    sent or dead outbox rows and processed SES events after 30 (speed review P5/P6).
create or replace function app_email_daily() returns void
  language plpgsql volatile security definer set search_path = '' as $$
declare v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  insert into public.email_daily (day, tenant_id, sent, delivered, bounced, complained, skipped)
    select (m.created_at at time zone 'Asia/Kolkata')::date, m.tenant_id, count(m.sent_at), count(m.delivered_at), count(m.bounced_at), count(m.complained_at), count(m.skipped_at)
      from public.email_messages m where m.created_at >= (v_today - 1)::timestamp at time zone 'Asia/Kolkata'
     group by 1, 2
  on conflict (tenant_id, day) do update set sent = excluded.sent, delivered = excluded.delivered, bounced = excluded.bounced,
    complained = excluded.complained, skipped = excluded.skipped;
  delete from public.email_messages where created_at < now() - interval '180 days';
  delete from public.outbox where (sent_at is not null or dead_at is not null) and created_at < now() - interval '30 days';
  delete from public.webhook_events where provider = 'ses' and processed_at is not null and received_at < now() - interval '30 days';
end $$;--> statement-breakpoint
-- ── Admin: counts only, from the roll-up; and the queue's age (frata_admin has no outbox grant).
create or replace function app_admin_email_health(p_uid uuid, p_days int)
  returns table (tenant_id uuid, shop text, sent bigint, delivered bigint, bounced bigint, complained bigint, skipped bigint)
  language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.platform_staff s where s.user_id = p_uid) then raise exception 'not_staff' using errcode = 'P0001'; end if;
  if p_days not in (1, 7, 30) then raise exception 'email: bad period' using errcode = 'invalid_parameter_value'; end if;
  return query select t.id, t.name, sum(d.sent)::bigint, sum(d.delivered)::bigint, sum(d.bounced)::bigint, sum(d.complained)::bigint, sum(d.skipped)::bigint
    from public.email_daily d join public.tenants t on t.id = d.tenant_id
   where d.day >= (now() at time zone 'Asia/Kolkata')::date - (p_days - 1)
   group by t.id, t.name order by sum(d.sent) desc limit 500;
end $$;--> statement-breakpoint
create or replace function app_admin_email_queue(p_uid uuid) returns table (waiting bigint, oldest timestamptz, dead_today bigint)
  language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.platform_staff s where s.user_id = p_uid) then raise exception 'not_staff' using errcode = 'P0001'; end if;
  return query select count(*) filter (where o.sent_at is null and o.dead_at is null and o.next_attempt_at <= now()),
    min(o.next_attempt_at) filter (where o.sent_at is null and o.dead_at is null and o.next_attempt_at <= now()),
    count(*) filter (where o.dead_at >= now() - interval '1 day')
    from public.outbox o where o.kind like 'email.%';
end $$;--> statement-breakpoint
revoke all on function app_outbox_claim(int), app_outbox_settle(uuid, text, text, int, int),
  app_store_ses_event(text, uuid, uuid, text, text, text, text, timestamptz), app_member_email(uuid, boolean), app_notice_members(),
  app_email_daily(), app_admin_email_health(uuid, int), app_admin_email_queue(uuid) from public, anon, authenticated, service_role;--> statement-breakpoint
grant execute on function app_outbox_claim(int), app_outbox_settle(uuid, text, text, int, int),
  app_store_ses_event(text, uuid, uuid, text, text, text, text, timestamptz), app_member_email(uuid, boolean), app_notice_members(),
  app_email_daily() to frata_app;--> statement-breakpoint
grant execute on function app_admin_email_health(uuid, int), app_admin_email_queue(uuid) to frata_admin;
