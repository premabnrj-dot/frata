CREATE TABLE "ekcode_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_key" text NOT NULL,
	"phone_sealed" text NOT NULL,
	"name_sealed" text NOT NULL,
	"seal_ref" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "ekcode_accounts_phone_key" CHECK ("ekcode_accounts"."phone_key" ~ '^[a-z][a-z0-9]{0,7}:[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "ekcode_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"label" text NOT NULL,
	"sealed" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "ekcode_addresses_label" CHECK (length("ekcode_addresses"."label") between 1 and 20)
);
--> statement-breakpoint
CREATE TABLE "ekcode_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"key_hash" text NOT NULL,
	"reason" text NOT NULL,
	"by" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"lifted_at" timestamp with time zone,
	CONSTRAINT "ekcode_blocks_kind" CHECK ("ekcode_blocks"."kind" in ('phone', 'net'))
);
--> statement-breakpoint
CREATE TABLE "ekcode_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flow_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"phone_key" text NOT NULL,
	"account_id" uuid,
	"code_hmac" text NOT NULL,
	"net_narrow" text,
	"net_wide" text,
	"pow_bits" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"wamid" text,
	"delivered_at" timestamp with time zone,
	"failed_code" integer,
	"tries" smallint DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"proof_digest" text,
	"proof_expires_at" timestamp with time zone,
	"proof_used_at" timestamp with time zone,
	CONSTRAINT "ekcode_codes_tries" CHECK ("ekcode_codes"."tries" between 0 and 10),
	CONSTRAINT "ekcode_codes_phone_key" CHECK ("ekcode_codes"."phone_key" ~ '^[a-z][a-z0-9]{0,7}:[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "ekcode_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"tenant_id" uuid,
	"notice_version" text NOT NULL,
	"given_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone,
	CONSTRAINT "ekcode_consents_kind" CHECK (("ekcode_consents"."kind" = 'network' and "ekcode_consents"."tenant_id" is null) or ("ekcode_consents"."kind" = 'share' and "ekcode_consents"."tenant_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "ekcode_daily" (
	"day" date NOT NULL,
	"tenant_id" uuid NOT NULL,
	"arm" text NOT NULL,
	"visitors" integer DEFAULT 0 NOT NULL,
	"started" integer DEFAULT 0 NOT NULL,
	"codes" integer DEFAULT 0 NOT NULL,
	"delivered" integer DEFAULT 0 NOT NULL,
	"verified" integer DEFAULT 0 NOT NULL,
	"created" integer DEFAULT 0 NOT NULL,
	"continued" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ekcode_daily_pk" PRIMARY KEY("day","tenant_id","arm")
);
--> statement-breakpoint
CREATE TABLE "ekcode_disclosures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"items" text[] NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ekcode_events" (
	"event_key" text PRIMARY KEY NOT NULL,
	"wamid" text NOT NULL,
	"status" text NOT NULL,
	"error_code" integer,
	"at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ekcode_exposures" (
	"tenant_id" uuid NOT NULL,
	"day" date NOT NULL,
	"arm" text NOT NULL,
	"visitor_digest" text NOT NULL,
	CONSTRAINT "ekcode_exposures_pk" PRIMARY KEY("tenant_id","day","arm","visitor_digest"),
	CONSTRAINT "ekcode_exposures_arm" CHECK ("ekcode_exposures"."arm" in ('shown', 'held'))
);
--> statement-breakpoint
CREATE TABLE "ekcode_flows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"handle_digest" text NOT NULL,
	"tenant_id" uuid NOT NULL,
	"host" text NOT NULL,
	"state" text NOT NULL,
	"challenge" text NOT NULL,
	"arm" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"number_in_at" timestamp with time zone,
	"account_created_at" timestamp with time zone,
	CONSTRAINT "ekcode_flows_arm" CHECK ("ekcode_flows"."arm" in ('shown', 'held')),
	CONSTRAINT "ekcode_flows_challenge" CHECK ("ekcode_flows"."challenge" ~ '^[A-Za-z0-9_-]{43}$'),
	CONSTRAINT "ekcode_flows_state" CHECK ("ekcode_flows"."state" ~ '^[A-Za-z0-9_-]{43}$')
);
--> statement-breakpoint
CREATE TABLE "ekcode_grants" (
	"code_digest" text PRIMARY KEY NOT NULL,
	"flow_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"items" text[] NOT NULL,
	"address_id" uuid,
	"save_token_digest" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"save_used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ekcode_pairs" (
	"account_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"pairwise" uuid DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ekcode_pairs_pk" PRIMARY KEY("account_id","tenant_id")
);
--> statement-breakpoint
CREATE TABLE "ekcode_settings" (
	"version" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ekcode_settings_version_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"sign_in" boolean DEFAULT true NOT NULL,
	"limits" jsonb NOT NULL,
	"by" uuid,
	"reason" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ekcode_shop_controls" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"raised_cap" integer,
	"extra_pow" smallint DEFAULT 0 NOT NULL,
	"breaker_at" timestamp with time zone,
	"paused_at" timestamp with time zone,
	"pause_reason" text,
	"by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"channel" text NOT NULL,
	"sender" text NOT NULL,
	"order_id" uuid,
	"notice_version" text NOT NULL,
	"given_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone,
	CONSTRAINT "customer_consents_purpose" CHECK ("customer_consents"."purpose" in ('order_updates', 'marketing_whatsapp', 'marketing_email')),
	CONSTRAINT "customer_consents_channel" CHECK ("customer_consents"."channel" in ('whatsapp', 'email')),
	CONSTRAINT "customer_consents_sender" CHECK ("customer_consents"."sender" in ('shop', 'ekcode')),
	CONSTRAINT "customer_consents_version" CHECK ("customer_consents"."notice_version" ~ '^[a-z-]+@[0-9]+$')
);
--> statement-breakpoint
CREATE TABLE "customer_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"token_digest" text NOT NULL,
	"prefill_sealed" text,
	"prefill_expires_at" timestamp with time zone,
	"save_token_sealed" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "shop_customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"phone" text NOT NULL,
	"name" text NOT NULL,
	"pairwise" uuid,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_customers_tenant_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "shop_customers_phone" CHECK ("shop_customers"."phone" ~ '^[6-9][0-9]{9}$'),
	CONSTRAINT "shop_customers_name" CHECK (length("shop_customers"."name") between 1 and 80)
);
--> statement-breakpoint
ALTER TABLE "module_pauses" DROP CONSTRAINT "module_pauses_module";--> statement-breakpoint
ALTER TABLE "tenant_modules" DROP CONSTRAINT "tenant_modules_module";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_id" uuid;--> statement-breakpoint
ALTER TABLE "ekcode_addresses" ADD CONSTRAINT "ekcode_addresses_account_id_ekcode_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ekcode_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ekcode_codes" ADD CONSTRAINT "ekcode_codes_flow_id_ekcode_flows_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."ekcode_flows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ekcode_codes" ADD CONSTRAINT "ekcode_codes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ekcode_codes" ADD CONSTRAINT "ekcode_codes_account_id_ekcode_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ekcode_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ekcode_consents" ADD CONSTRAINT "ekcode_consents_account_id_ekcode_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ekcode_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ekcode_consents" ADD CONSTRAINT "ekcode_consents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ekcode_daily" ADD CONSTRAINT "ekcode_daily_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ekcode_disclosures" ADD CONSTRAINT "ekcode_disclosures_account_id_ekcode_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ekcode_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ekcode_disclosures" ADD CONSTRAINT "ekcode_disclosures_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ekcode_exposures" ADD CONSTRAINT "ekcode_exposures_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ekcode_flows" ADD CONSTRAINT "ekcode_flows_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ekcode_grants" ADD CONSTRAINT "ekcode_grants_flow_id_ekcode_flows_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."ekcode_flows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ekcode_grants" ADD CONSTRAINT "ekcode_grants_account_id_ekcode_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ekcode_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ekcode_grants" ADD CONSTRAINT "ekcode_grants_address_id_ekcode_addresses_id_fk" FOREIGN KEY ("address_id") REFERENCES "public"."ekcode_addresses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ekcode_pairs" ADD CONSTRAINT "ekcode_pairs_account_id_ekcode_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ekcode_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ekcode_pairs" ADD CONSTRAINT "ekcode_pairs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ekcode_shop_controls" ADD CONSTRAINT "ekcode_shop_controls_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_consents" ADD CONSTRAINT "customer_consents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_consents" ADD CONSTRAINT "customer_consents_customer_fk" FOREIGN KEY ("tenant_id","customer_id") REFERENCES "public"."shop_customers"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_consents" ADD CONSTRAINT "customer_consents_order_fk" FOREIGN KEY ("tenant_id","order_id") REFERENCES "public"."orders"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_customer_fk" FOREIGN KEY ("tenant_id","customer_id") REFERENCES "public"."shop_customers"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_customers" ADD CONSTRAINT "shop_customers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ekcode_accounts_seal_ref" ON "ekcode_accounts" USING btree ("seal_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "ekcode_accounts_phone" ON "ekcode_accounts" USING btree ("phone_key");--> statement-breakpoint
CREATE INDEX "ekcode_addresses_account" ON "ekcode_addresses" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ekcode_blocks_live" ON "ekcode_blocks" USING btree ("kind","key_hash") WHERE "ekcode_blocks"."lifted_at" is null;--> statement-breakpoint
CREATE INDEX "ekcode_codes_phone" ON "ekcode_codes" USING btree ("phone_key","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ekcode_codes_net" ON "ekcode_codes" USING btree ("net_narrow","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ekcode_codes_net_wide" ON "ekcode_codes" USING btree ("net_wide","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ekcode_codes_tenant" ON "ekcode_codes" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "ekcode_codes_created" ON "ekcode_codes" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ekcode_codes_flow" ON "ekcode_codes" USING btree ("flow_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ekcode_codes_wamid" ON "ekcode_codes" USING btree ("wamid") WHERE "ekcode_codes"."wamid" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "ekcode_codes_proof" ON "ekcode_codes" USING btree ("proof_digest") WHERE "ekcode_codes"."proof_digest" is not null;--> statement-breakpoint
CREATE INDEX "ekcode_consents_account" ON "ekcode_consents" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "ekcode_disclosures_account" ON "ekcode_disclosures" USING btree ("account_id","at");--> statement-breakpoint
CREATE INDEX "ekcode_events_unprocessed" ON "ekcode_events" USING btree ("received_at") WHERE "ekcode_events"."processed_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "ekcode_flows_handle" ON "ekcode_flows" USING btree ("handle_digest");--> statement-breakpoint
CREATE INDEX "ekcode_flows_started" ON "ekcode_flows" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "ekcode_flows_tenant_started" ON "ekcode_flows" USING btree ("tenant_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ekcode_grants_flow" ON "ekcode_grants" USING btree ("flow_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ekcode_grants_save" ON "ekcode_grants" USING btree ("save_token_digest") WHERE "ekcode_grants"."save_token_digest" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "ekcode_pairs_pairwise" ON "ekcode_pairs" USING btree ("pairwise");--> statement-breakpoint
CREATE INDEX "customer_consents_customer" ON "customer_consents" USING btree ("tenant_id","customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_sessions_tenant_token" ON "customer_sessions" USING btree ("tenant_id","token_digest");--> statement-breakpoint
CREATE INDEX "customer_sessions_expiry" ON "customer_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_customers_tenant_phone" ON "shop_customers" USING btree ("tenant_id","phone");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_customers_tenant_pairwise" ON "shop_customers" USING btree ("tenant_id","pairwise") WHERE "shop_customers"."pairwise" is not null;--> statement-breakpoint
ALTER TABLE "module_pauses" ADD CONSTRAINT "module_pauses_module" CHECK ("module_pauses"."module" in ('communication','rto_shield','ship','true_profit','reviews','marketplace_export','size_fit','cart_flows','gst','ekcode'));--> statement-breakpoint
ALTER TABLE "tenant_modules" ADD CONSTRAINT "tenant_modules_module" CHECK ("tenant_modules"."module" in ('communication','rto_shield','ship','true_profit','reviews','marketplace_export','size_fit','cart_flows','gst','ekcode'));--> statement-breakpoint
-- =============================================================================
-- EKCODE P1 — ACCESS AND DEFINERS (plan docs/plans/2026-11-09-ekcode-p1.md task 3; reviews 2026-11-09). Hand-written.
-- The vault (ekcode_*) is platform data: no grant to any role, one restrictive false policy (the 0065 pattern);
-- read and written only by the definers below, each pinned to search_path '' and executable by exactly one role.
-- The shop's own tables (shop_customers, customer_sessions, customer_consents) are ordinary tenant tables.
-- Every scope comes from a server-made flow handle, never from an argument a caller chooses (tenancy B1).
-- =============================================================================
revoke all on ekcode_accounts, ekcode_addresses, ekcode_consents, ekcode_pairs, ekcode_disclosures, ekcode_flows, ekcode_codes,
  ekcode_grants, ekcode_settings, ekcode_shop_controls, ekcode_blocks, ekcode_events, ekcode_exposures, ekcode_daily
  from public, anon, authenticated, service_role, frata_app, frata_admin;--> statement-breakpoint
alter table ekcode_accounts enable row level security;--> statement-breakpoint
alter table ekcode_addresses enable row level security;--> statement-breakpoint
alter table ekcode_consents enable row level security;--> statement-breakpoint
alter table ekcode_pairs enable row level security;--> statement-breakpoint
alter table ekcode_disclosures enable row level security;--> statement-breakpoint
alter table ekcode_flows enable row level security;--> statement-breakpoint
alter table ekcode_codes enable row level security;--> statement-breakpoint
alter table ekcode_grants enable row level security;--> statement-breakpoint
alter table ekcode_settings enable row level security;--> statement-breakpoint
alter table ekcode_shop_controls enable row level security;--> statement-breakpoint
alter table ekcode_blocks enable row level security;--> statement-breakpoint
alter table ekcode_events enable row level security;--> statement-breakpoint
alter table ekcode_exposures enable row level security;--> statement-breakpoint
alter table ekcode_daily enable row level security;--> statement-breakpoint
create policy definer_only on ekcode_accounts as restrictive for all to public using (false) with check (false);--> statement-breakpoint
create policy definer_only on ekcode_addresses as restrictive for all to public using (false) with check (false);--> statement-breakpoint
create policy definer_only on ekcode_consents as restrictive for all to public using (false) with check (false);--> statement-breakpoint
create policy definer_only on ekcode_pairs as restrictive for all to public using (false) with check (false);--> statement-breakpoint
create policy definer_only on ekcode_disclosures as restrictive for all to public using (false) with check (false);--> statement-breakpoint
create policy definer_only on ekcode_flows as restrictive for all to public using (false) with check (false);--> statement-breakpoint
create policy definer_only on ekcode_codes as restrictive for all to public using (false) with check (false);--> statement-breakpoint
create policy definer_only on ekcode_grants as restrictive for all to public using (false) with check (false);--> statement-breakpoint
create policy definer_only on ekcode_settings as restrictive for all to public using (false) with check (false);--> statement-breakpoint
create policy definer_only on ekcode_shop_controls as restrictive for all to public using (false) with check (false);--> statement-breakpoint
create policy definer_only on ekcode_blocks as restrictive for all to public using (false) with check (false);--> statement-breakpoint
create policy definer_only on ekcode_events as restrictive for all to public using (false) with check (false);--> statement-breakpoint
create policy definer_only on ekcode_exposures as restrictive for all to public using (false) with check (false);--> statement-breakpoint
create policy definer_only on ekcode_daily as restrictive for all to public using (false) with check (false);--> statement-breakpoint
-- The shop's own shoppers: tenant rows for frata_app; nothing for anon, authenticated or frata_admin.
revoke all on shop_customers, customer_sessions, customer_consents from public, anon, authenticated, service_role, frata_admin;--> statement-breakpoint
alter table shop_customers enable row level security;--> statement-breakpoint
alter table customer_sessions enable row level security;--> statement-breakpoint
alter table customer_consents enable row level security;--> statement-breakpoint
grant select, insert, update on shop_customers, customer_sessions, customer_consents to frata_app;--> statement-breakpoint
create policy tenant_rows on shop_customers for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());--> statement-breakpoint
create policy tenant_rows on customer_sessions for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());--> statement-breakpoint
create policy tenant_rows on customer_consents for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());--> statement-breakpoint
-- An order can point only at its own shop's customer (FK checks ignore RLS: composite, tenancy M4).
alter table orders add constraint orders_customer_fk foreign key (tenant_id, customer_id) references shop_customers (tenant_id, id) on delete set null (customer_id);--> statement-breakpoint
create index orders_tenant_customer on orders (tenant_id, customer_id) where customer_id is not null;--> statement-breakpoint
-- An attempt has one outcome (ADR-0008): once sent, its wamid and sent time never change.
create or replace function ekcode_codes_one_outcome() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.sent_at is not null and (new.sent_at is distinct from old.sent_at or new.wamid is distinct from old.wamid) then
    raise exception 'ekcode: a sent code keeps its outcome' using errcode = 'check_violation'; end if;
  return new;
end $$;--> statement-breakpoint
create trigger ekcode_codes_one_outcome before update on ekcode_codes for each row execute function ekcode_codes_one_outcome();--> statement-breakpoint
-- The limits in force at first (src/domains/ekcode/limits.ts DEFAULT_LIMITS); Admin adds versions with a reason.
insert into ekcode_settings (sign_in, limits, reason) values (true, '{"perNumber10m":3,"perNumberDay":10,"triesPerCode":5,"perNetworkHour":20,"perWideNetworkHour":60,"globalHour":2000,"perShopDay":{"launch":100,"growth":600,"scale":2000},"breakerMinRight":0.4,"breakerAfter":200}'::jsonb, 'EkCode P1 defaults');--> statement-breakpoint
-- ── Internal helpers (no grant): the limits in force, and a shop's plan. ──
create or replace function ekcode_limits() returns jsonb language sql stable security definer set search_path = '' as $$
  select s.limits from public.ekcode_settings s order by s.version desc limit 1 $$;--> statement-breakpoint
create or replace function ekcode_plan_of(p_tenant uuid) returns text language sql stable security definer set search_path = '' as $$
  select p.code from public.tenant_plans tp join public.plan_versions pv on pv.id = tp.plan_version_id join public.plans p on p.id = pv.plan_id
   where tp.tenant_id = p_tenant and tp.starts_at <= now() order by tp.starts_at desc limit 1 $$;--> statement-breakpoint
revoke all on function ekcode_limits(), ekcode_plan_of(uuid), ekcode_codes_one_outcome() from public, anon, authenticated, service_role;--> statement-breakpoint
-- ── A flow, made by the shop's server: tenant and host from the request's Host (requireShop), never a URL. ──
create or replace function app_ekcode_start_flow(p_tenant uuid, p_host text, p_handle_digest text, p_state text, p_challenge text, p_arm text)
  returns boolean language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_handle_digest !~ '^[0-9a-f]{64}$' or p_host !~ '^[a-z0-9.-]{3,253}$' then raise exception 'ekcode: bad flow' using errcode = 'invalid_parameter_value'; end if;
  if not (select s.sign_in from public.ekcode_settings s order by s.version desc limit 1) then return false; end if;
  if exists (select 1 from public.ekcode_shop_controls c where c.tenant_id = p_tenant and c.paused_at is not null) then return false; end if;
  insert into public.ekcode_flows (handle_digest, tenant_id, host, state, challenge, arm) values (p_handle_digest, p_tenant, p_host, p_state, p_challenge, p_arm);
  return true;
end $$;--> statement-breakpoint
-- ── What ekcode.in may show about the flow's shop: its name and host. A flow lives 15 minutes. ──
create or replace function app_ekcode_flow_view(p_handle_digest text) returns table (shop_name text, host text)
  language sql stable security definer set search_path = '' as $$
  select left(t.name, 60), f.host from public.ekcode_flows f join public.tenants t on t.id = f.tenant_id
   where f.handle_digest = p_handle_digest and f.started_at > now() - interval '15 minutes' $$;--> statement-breakpoint
-- ── Issue a code: every limit, block and count in one call, under locks (security H2; speed H4). The reply never says
--    whether an account exists (security M4). Verdicts: ok · pow (solve this many bits) · wait (until) · blocked ·
--    capped · off · expired. The row is the ADR-0008 attempt, committed before the send. ──
create or replace function app_ekcode_issue_code(p_handle_digest text, p_phone_keys text[], p_code_id uuid, p_code_hmac text,
  p_net_narrow text, p_net_wide text, p_pow_solved smallint)
  returns table (verdict text, until timestamptz, pow_bits smallint)
  language plpgsql volatile security definer set search_path = '' as $$
declare
  f public.ekcode_flows%rowtype; l jsonb := public.ekcode_limits(); c public.ekcode_shop_controls%rowtype;
  v_plan text; v_cap int; v_n int; v_net int; v_bits smallint; v_sent int; v_right int; v_nets int; v_acct uuid;
begin
  select * into f from public.ekcode_flows x where x.handle_digest = p_handle_digest and x.started_at > now() - interval '15 minutes';
  if f.id is null then return query select 'expired'::text, null::timestamptz, 0::smallint; return; end if;
  if coalesce(array_length(p_phone_keys, 1), 0) = 0 or p_code_hmac is null then raise exception 'ekcode: missing' using errcode = 'invalid_parameter_value'; end if;
  perform pg_advisory_xact_lock(hashtext('ekcode:phone:' || p_phone_keys[1]));
  perform pg_advisory_xact_lock(hashtext('ekcode:net:' || coalesce(p_net_narrow, '')));
  if not (select s.sign_in from public.ekcode_settings s order by s.version desc limit 1) then return query select 'off'::text, null::timestamptz, 0::smallint; return; end if;
  select * into c from public.ekcode_shop_controls x where x.tenant_id = f.tenant_id;
  if c.paused_at is not null then return query select 'off'::text, null::timestamptz, 0::smallint; return; end if;
  if exists (select 1 from public.ekcode_blocks b where b.lifted_at is null and ((b.kind = 'phone' and b.key_hash = any(p_phone_keys))
      or (b.kind = 'net' and b.key_hash in (p_net_narrow, p_net_wide)))) then
    return query select 'blocked'::text, null::timestamptz, 0::smallint; return; end if;
  -- Per number: 10 minutes and a day.
  select count(*) into v_n from public.ekcode_codes k where k.phone_key = any(p_phone_keys) and k.created_at > now() - interval '10 minutes';
  if v_n >= (l->>'perNumber10m')::int then return query select 'wait'::text, now() + interval '10 minutes', 0::smallint; return; end if;
  select count(*) into v_n from public.ekcode_codes k where k.phone_key = any(p_phone_keys) and k.created_at > now() - interval '1 day';
  if v_n >= (l->>'perNumberDay')::int then return query select 'wait'::text, now() + interval '1 day', 0::smallint; return; end if;
  -- Per network (narrow and wide), an hour; and every shop together, an hour.
  select count(*) into v_net from public.ekcode_codes k where k.net_narrow = p_net_narrow and k.created_at > now() - interval '1 hour';
  if v_net >= (l->>'perNetworkHour')::int then return query select 'wait'::text, now() + interval '1 hour', 0::smallint; return; end if;
  select count(*) into v_n from public.ekcode_codes k where k.net_wide = p_net_wide and k.created_at > now() - interval '1 hour';
  if v_n >= (l->>'perWideNetworkHour')::int then return query select 'wait'::text, now() + interval '1 hour', 0::smallint; return; end if;
  select count(*) into v_n from public.ekcode_codes k where k.created_at > now() - interval '1 hour';
  if v_n >= (l->>'globalHour')::int then return query select 'wait'::text, now() + interval '5 minutes', 0::smallint; return; end if;
  -- Per shop, a day, by plan (or raised by Admin).
  v_plan := coalesce(public.ekcode_plan_of(f.tenant_id), 'launch');
  v_cap := greatest(coalesce((l->'perShopDay'->>v_plan)::int, (l->'perShopDay'->>'launch')::int), coalesce(c.raised_cap, 0));
  select count(*) into v_n from public.ekcode_codes k where k.tenant_id = f.tenant_id and k.created_at > now() - interval '1 day';
  if v_n >= v_cap then return query select 'capped'::text, null::timestamptz, 0::smallint; return; end if;
  -- The breaker (24 h, from enough distinct networks): slows codes down; only Admin pauses a shop (owner call 3).
  select count(*), count(k.verified_at), count(distinct k.net_narrow) into v_sent, v_right, v_nets
    from public.ekcode_codes k where k.tenant_id = f.tenant_id and k.created_at > now() - interval '1 day';
  if v_sent >= (l->>'breakerAfter')::int and v_nets >= 10 and v_right::numeric / v_sent < (l->>'breakerMinRight')::numeric then
    insert into public.ekcode_shop_controls as s (tenant_id, extra_pow, breaker_at) values (f.tenant_id, 4, now())
      on conflict (tenant_id) do update set extra_pow = 4, breaker_at = coalesce(s.breaker_at, now()), updated_at = now();
    c.extra_pow := 4;
  elsif c.breaker_at is not null then
    update public.ekcode_shop_controls set extra_pow = 0, breaker_at = null, updated_at = now() where tenant_id = f.tenant_id;
    c.extra_pow := 0;
  end if;
  -- Proof of work from the 2nd code an hour from one network (src/domains/ekcode/limits.ts powBits).
  v_bits := case when v_net + 1 < 2 then 0 else least(24, 16 + 2 * (v_net + 1 - 2) + coalesce(c.extra_pow, 0)) end;
  if coalesce(p_pow_solved, 0) < v_bits then return query select 'pow'::text, null::timestamptz, v_bits; return; end if;
  select a.id into v_acct from public.ekcode_accounts a where a.phone_key = any(p_phone_keys) and a.deleted_at is null limit 1;
  insert into public.ekcode_codes (id, flow_id, tenant_id, phone_key, account_id, code_hmac, net_narrow, net_wide, pow_bits, expires_at)
    values (p_code_id, f.id, f.tenant_id, p_phone_keys[1], v_acct, p_code_hmac, p_net_narrow, p_net_wide, v_bits, now() + interval '10 minutes');
  update public.ekcode_flows set number_in_at = coalesce(number_in_at, now()) where id = f.id;
  return query select 'ok'::text, null::timestamptz, v_bits;
end $$;--> statement-breakpoint
-- ── The send's outcome, once (ADR-0008; the trigger guards it). ──
create or replace function app_ekcode_mark_sent(p_code uuid, p_wamid text) returns void language sql volatile security definer set search_path = '' as $$
  update public.ekcode_codes set sent_at = now(), wamid = p_wamid where id = p_code and sent_at is null and failed_code is null $$;--> statement-breakpoint
create or replace function app_ekcode_mark_failed(p_code uuid, p_error int) returns void language sql volatile security definer set search_path = '' as $$
  update public.ekcode_codes set failed_code = coalesce(p_error, 0) where id = p_code and sent_at is null and failed_code is null $$;--> statement-breakpoint
-- ── Has the flow's code arrived? Three reads after a send (speed H3). ──
create or replace function app_ekcode_code_status(p_handle_digest text, p_code uuid)
  returns table (sent boolean, delivered boolean, failed boolean, expired boolean)
  language sql stable security definer set search_path = '' as $$
  select k.sent_at is not null, k.delivered_at is not null, k.failed_code is not null, k.expires_at <= now()
    from public.ekcode_codes k join public.ekcode_flows f on f.id = k.flow_id
   where k.id = p_code and f.handle_digest = p_handle_digest $$;--> statement-breakpoint
-- ── Check a code: one atomic try (security H2). On success the row becomes a 10-minute single-use proof bound to this
--    flow, and the account (if any) is shown: its seal reference, sealed name and phone, and address labels. ──
create or replace function app_ekcode_verify(p_handle_digest text, p_code uuid, p_code_hmacs text[], p_proof_digest text)
  returns table (ok boolean, tries_left int, has_account boolean, seal_ref uuid, name_sealed text, phone_sealed text, addresses jsonb)
  language plpgsql volatile security definer set search_path = '' as $$
declare k public.ekcode_codes%rowtype; v_max int := (public.ekcode_limits()->>'triesPerCode')::int; a public.ekcode_accounts%rowtype;
begin
  if p_proof_digest !~ '^[0-9a-f]{64}$' then raise exception 'ekcode: bad proof' using errcode = 'invalid_parameter_value'; end if;
  update public.ekcode_codes x set tries = x.tries + 1
   from public.ekcode_flows f
   where x.id = p_code and f.id = x.flow_id and f.handle_digest = p_handle_digest
     and x.verified_at is null and x.tries < v_max and x.expires_at > now()
  returning x.* into k;
  if k.id is null then return query select false, 0, false, null::uuid, null::text, null::text, null::jsonb; return; end if;
  if not (k.code_hmac = any(p_code_hmacs)) then
    return query select false, greatest(v_max - k.tries, 0), false, null::uuid, null::text, null::text, null::jsonb; return; end if;
  update public.ekcode_codes set verified_at = now(), proof_digest = p_proof_digest, proof_expires_at = now() + interval '10 minutes' where id = k.id;
  select * into a from public.ekcode_accounts x where x.phone_key = k.phone_key and x.deleted_at is null;
  return query select true, v_max - k.tries, a.id is not null, a.seal_ref, a.name_sealed, a.phone_sealed,
    coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'label', d.label) order by d.last_used_at desc nulls last, d.created_at desc)
      from public.ekcode_addresses d where d.account_id = a.id and d.deleted_at is null), '[]'::jsonb);
end $$;--> statement-breakpoint
-- A live proof for this flow: verified, unexpired, unused.
create or replace function ekcode_proof(p_handle_digest text, p_proof_digest text) returns public.ekcode_codes
  language sql stable security definer set search_path = '' as $$
  select k.* from public.ekcode_codes k join public.ekcode_flows f on f.id = k.flow_id
   where k.proof_digest = p_proof_digest and f.handle_digest = p_handle_digest and k.verified_at is not null
     and k.proof_used_at is null and k.proof_expires_at > now() $$;--> statement-breakpoint
revoke all on function ekcode_proof(text, text) from public, anon, authenticated, service_role;--> statement-breakpoint
-- ── Create the account after the network notice (its own tap). The phone is the proof's; values sealed by the app. ──
create or replace function app_ekcode_create_account(p_handle_digest text, p_proof_digest text, p_seal_ref uuid, p_phone_sealed text, p_name_sealed text, p_notice_version text)
  returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare k public.ekcode_codes%rowtype; v_id uuid;
begin
  k := public.ekcode_proof(p_handle_digest, p_proof_digest);
  if k.id is null then return false; end if;
  if p_notice_version !~ '^ekcode-network@[0-9]+$' then raise exception 'ekcode: bad notice' using errcode = 'invalid_parameter_value'; end if;
  perform pg_advisory_xact_lock(hashtext('ekcode:phone:' || k.phone_key));
  if exists (select 1 from public.ekcode_accounts a where a.phone_key = k.phone_key and a.deleted_at is null) then return false; end if;
  insert into public.ekcode_accounts (phone_key, phone_sealed, name_sealed, seal_ref) values (k.phone_key, p_phone_sealed, p_name_sealed, p_seal_ref) returning id into v_id;
  insert into public.ekcode_consents (account_id, kind, notice_version) values (v_id, 'network', p_notice_version);
  update public.ekcode_codes set account_id = v_id where id = k.id;
  update public.ekcode_flows set account_created_at = now() where id = k.flow_id;
  return true;
end $$;--> statement-breakpoint
-- ── Continue to the shop: uses the proof up, makes the 60-second grant. No tenant, host or challenge in the arguments:
--    all from the flow (tenancy B1). Returns where to send the shopper back to, built from the flow row. ──
create or replace function app_ekcode_grant(p_handle_digest text, p_proof_digest text, p_with_address uuid, p_code_digest text)
  returns table (host text, state text)
  language plpgsql volatile security definer set search_path = '' as $$
declare k public.ekcode_codes%rowtype; a public.ekcode_accounts%rowtype; f public.ekcode_flows%rowtype; v_items text[] := array['name', 'phone'];
begin
  if p_code_digest !~ '^[0-9a-f]{64}$' then raise exception 'ekcode: bad code' using errcode = 'invalid_parameter_value'; end if;
  k := public.ekcode_proof(p_handle_digest, p_proof_digest);
  if k.id is null then return; end if;
  select * into a from public.ekcode_accounts x where x.phone_key = k.phone_key and x.deleted_at is null;
  if a.id is null then return; end if;
  if p_with_address is not null then
    if not exists (select 1 from public.ekcode_addresses d where d.id = p_with_address and d.account_id = a.id and d.deleted_at is null) then return; end if;
    v_items := v_items || 'address';
  end if;
  update public.ekcode_codes set proof_used_at = now() where id = k.id and proof_used_at is null;
  if not found then return; end if;
  select * into f from public.ekcode_flows x where x.id = k.flow_id;
  insert into public.ekcode_grants (code_digest, flow_id, account_id, items, address_id, expires_at)
    values (p_code_digest, f.id, a.id, v_items, p_with_address, now() + interval '60 seconds');
  return query select f.host, f.state;
end $$;--> statement-breakpoint
-- ── The shop redeems the grant (tenant and host from its own request; the challenge checked against the flow). One use,
--    60 seconds. Returns the shop's pairwise id, the sealed values and a save token's place; never an account id. ──
create or replace function app_ekcode_redeem(p_code_digest text, p_challenge text, p_tenant uuid, p_host text, p_save_digest text)
  returns table (pairwise uuid, seal_ref uuid, name_sealed text, phone_sealed text, address_id uuid, address_label text, address_sealed text, items text[])
  language plpgsql volatile security definer set search_path = '' as $$
declare g public.ekcode_grants%rowtype; f public.ekcode_flows%rowtype; a public.ekcode_accounts%rowtype; v_pair uuid;
begin
  select * into g from public.ekcode_grants x where x.code_digest = p_code_digest for update;
  if g.code_digest is null or g.used_at is not null or g.expires_at <= now() then return; end if;
  select * into f from public.ekcode_flows x where x.id = g.flow_id;
  if f.tenant_id <> p_tenant or f.host <> p_host or f.challenge <> p_challenge then return; end if;
  select * into a from public.ekcode_accounts x where x.id = g.account_id and x.deleted_at is null;
  if a.id is null then return; end if;
  update public.ekcode_grants set used_at = now(), save_token_digest = case when p_save_digest ~ '^[0-9a-f]{64}$' then p_save_digest end where code_digest = g.code_digest;
  insert into public.ekcode_pairs (account_id, tenant_id) values (a.id, p_tenant) on conflict (account_id, tenant_id) do nothing;
  select pr.pairwise into v_pair from public.ekcode_pairs pr where pr.account_id = a.id and pr.tenant_id = p_tenant;
  insert into public.ekcode_disclosures (account_id, tenant_id, items) values (a.id, p_tenant, g.items);
  if not exists (select 1 from public.ekcode_consents c where c.account_id = a.id and c.kind = 'share' and c.tenant_id = p_tenant and c.withdrawn_at is null) then
    insert into public.ekcode_consents (account_id, kind, tenant_id, notice_version) values (a.id, 'share', p_tenant, 'ekcode-share@1');
  end if;
  if g.address_id is not null then update public.ekcode_addresses set last_used_at = now() where id = g.address_id; end if;
  return query select v_pair, a.seal_ref, a.name_sealed, a.phone_sealed, d.id, d.label, d.sealed, g.items
    from (select 1) one left join public.ekcode_addresses d on d.id = g.address_id and 'address' = any(g.items);
end $$;--> statement-breakpoint
-- ── "Save this address to EkCode": the save token (24 h, once) from this shop's redeem. ──
create or replace function app_ekcode_save_address(p_save_digest text, p_tenant uuid, p_address_id uuid, p_label text, p_sealed text)
  returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare g public.ekcode_grants%rowtype; f public.ekcode_flows%rowtype;
begin
  select * into g from public.ekcode_grants x where x.save_token_digest = p_save_digest for update;
  if g.code_digest is null or g.save_used_at is not null or g.used_at is null or g.used_at < now() - interval '24 hours' then return false; end if;
  select * into f from public.ekcode_flows x where x.id = g.flow_id;
  if f.tenant_id <> p_tenant then return false; end if;
  if length(btrim(coalesce(p_label, ''))) not between 1 and 20 then return false; end if;
  if (select count(*) from public.ekcode_addresses d where d.account_id = g.account_id and d.deleted_at is null) >= 10 then return false; end if;
  insert into public.ekcode_addresses (id, account_id, label, sealed, last_used_at) values (p_address_id, g.account_id, btrim(p_label), p_sealed, now());
  update public.ekcode_grants set save_used_at = now() where code_digest = g.code_digest;
  return true;
end $$;--> statement-breakpoint
-- ── Meta's delivery reports for EkCode's number: stored trimmed (wamid, status, error, time), applied later. ──
create or replace function app_ekcode_store_event(p_event_key text, p_wamid text, p_status text, p_error int, p_at timestamptz)
  returns boolean language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_status not in ('sent', 'delivered', 'read', 'failed') or length(p_wamid) > 200 then return false; end if;
  insert into public.ekcode_events (event_key, wamid, status, error_code, at, processed_at)
    values (p_event_key, p_wamid, p_status, p_error, p_at, case when p_status in ('sent', 'read') then now() end)
    on conflict (event_key) do nothing;
  return found;
end $$;--> statement-breakpoint
create or replace function app_ekcode_apply_events(p_limit int) returns int language plpgsql volatile security definer set search_path = '' as $$
declare e record; n int := 0;
begin
  for e in select * from public.ekcode_events x where x.processed_at is null order by x.received_at limit least(greatest(p_limit, 1), 1000) for update skip locked loop
    if e.status = 'delivered' then update public.ekcode_codes set delivered_at = coalesce(delivered_at, e.at) where wamid = e.wamid;
    elsif e.status = 'failed' then update public.ekcode_codes set failed_code = coalesce(failed_code, e.error_code, 0) where wamid = e.wamid and delivered_at is null;
    end if;
    update public.ekcode_events set processed_at = now() where event_key = e.event_key;
    n := n + 1;
  end loop;
  return n;
end $$;--> statement-breakpoint
-- ── The holdout's denominator: one row per visitor, shop, arm and day (no row-lock contention). ──
create or replace function app_ekcode_exposure(p_tenant uuid, p_arm text, p_visitor_digest text) returns void
  language sql volatile security definer set search_path = '' as $$
  insert into public.ekcode_exposures (tenant_id, day, arm, visitor_digest)
  select p_tenant, (now() at time zone 'Asia/Kolkata')::date, p_arm, p_visitor_digest
   where p_arm in ('shown', 'held') and p_visitor_digest ~ '^[0-9a-f]{64}$'
  on conflict do nothing $$;--> statement-breakpoint
-- ── Daily: roll closed days into ekcode_daily, then keep only what is needed (security L2). ──
create or replace function app_ekcode_daily() returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  insert into public.ekcode_daily (day, tenant_id, arm, visitors)
    select x.day, x.tenant_id, x.arm, count(*) from public.ekcode_exposures x where x.day < v_today group by 1, 2, 3
  on conflict (day, tenant_id, arm) do update set visitors = excluded.visitors;
  delete from public.ekcode_exposures where day < v_today;
  insert into public.ekcode_daily (day, tenant_id, arm, started, codes, delivered, verified, created, continued)
    select (f.started_at at time zone 'Asia/Kolkata')::date, f.tenant_id, f.arm, count(distinct f.id),
      count(k.id), count(k.delivered_at), count(k.verified_at), count(distinct f.id) filter (where f.account_created_at is not null),
      count(distinct f.id) filter (where exists (select 1 from public.ekcode_grants g where g.flow_id = f.id))
    from public.ekcode_flows f left join public.ekcode_codes k on k.flow_id = f.id
   where (f.started_at at time zone 'Asia/Kolkata')::date = v_today - 1
   group by 1, 2, 3
  on conflict (day, tenant_id, arm) do update set started = excluded.started, codes = excluded.codes, delivered = excluded.delivered,
    verified = excluded.verified, created = excluded.created, continued = excluded.continued;
  delete from public.ekcode_events where received_at < now() - interval '2 days' and processed_at is not null;
  delete from public.ekcode_grants where created_at < now() - interval '2 days';
  update public.ekcode_codes set net_narrow = null, net_wide = null where created_at < now() - interval '7 days' and net_narrow is not null;
  delete from public.ekcode_flows where started_at < now() - interval '30 days';
end $$;--> statement-breakpoint
-- ── Admin (frata_admin; admin role re-checked from the uid; every write audited with a reason). Counts only. ──
create or replace function ekcode_staff(p_uid uuid, p_admin boolean) returns text language sql stable security definer set search_path = '' as $$
  select s.email from public.platform_staff s where s.user_id = p_uid and (not p_admin or s.role = 'admin') $$;--> statement-breakpoint
revoke all on function ekcode_staff(uuid, boolean) from public, anon, authenticated, service_role;--> statement-breakpoint
create or replace function app_admin_ekcode_stats(p_uid uuid, p_days int)
  returns table (accounts bigint, active bigint, multi_shop bigint, started bigint, codes bigint, delivered bigint, verified bigint, created bigint, continued bigint, peak_minute bigint, codes_month bigint)
  language plpgsql stable security definer set search_path = '' as $$
declare v_from date;
begin
  if public.ekcode_staff(p_uid, false) is null then raise exception 'not_staff' using errcode = 'P0001'; end if;
  if p_days not in (1, 7, 30) then raise exception 'ekcode: bad period' using errcode = 'invalid_parameter_value'; end if;
  v_from := (now() at time zone 'Asia/Kolkata')::date - (p_days - 1);
  return query
  with today as (
    select count(distinct f.id) s, count(k.id) c, count(k.delivered_at) d, count(k.verified_at) v,
      count(distinct f.id) filter (where f.account_created_at is not null) cr,
      count(distinct f.id) filter (where exists (select 1 from public.ekcode_grants g where g.flow_id = f.id)) co
    from public.ekcode_flows f left join public.ekcode_codes k on k.flow_id = f.id
    where (f.started_at at time zone 'Asia/Kolkata')::date = (now() at time zone 'Asia/Kolkata')::date),
  past as (select coalesce(sum(x.started), 0) s, coalesce(sum(x.codes), 0) c, coalesce(sum(x.delivered), 0) d, coalesce(sum(x.verified), 0) v,
      coalesce(sum(x.created), 0) cr, coalesce(sum(x.continued), 0) co from public.ekcode_daily x where x.day >= v_from)
  select (select count(*) from public.ekcode_accounts a where a.deleted_at is null),
    (select count(distinct k.account_id) from public.ekcode_codes k where k.verified_at > now() - interval '30 days'),
    (select case when n < 5 then null else n end from (select count(*) n from (select p.account_id from public.ekcode_pairs p group by 1 having count(*) > 1) m) q),
    past.s + today.s, past.c + today.c, past.d + today.d, past.v + today.v, past.cr + today.cr, past.co + today.co,
    (select coalesce(max(n), 0) from (select count(*) n from public.ekcode_codes k where k.created_at > now() - interval '1 day' group by date_trunc('minute', k.created_at)) pm),
    (select count(*) from public.ekcode_codes k where k.delivered_at >= date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata')
  from today, past;
end $$;--> statement-breakpoint
create or replace function app_admin_ekcode_shops(p_uid uuid, p_days int)
  returns table (tenant_id uuid, shop text, plan text, started bigint, codes bigint, verified bigint, continued bigint, delivered_month bigint,
    breaker_at timestamptz, paused_at timestamptz, raised_cap int)
  language plpgsql stable security definer set search_path = '' as $$
begin
  if public.ekcode_staff(p_uid, false) is null then raise exception 'not_staff' using errcode = 'P0001'; end if;
  if p_days not in (1, 7, 30) then raise exception 'ekcode: bad period' using errcode = 'invalid_parameter_value'; end if;
  return query
  select t.id, t.name, public.ekcode_plan_of(t.id),
    coalesce(sum(d.started), 0)::bigint, coalesce(sum(d.codes), 0)::bigint, coalesce(sum(d.verified), 0)::bigint, coalesce(sum(d.continued), 0)::bigint,
    (select count(*) from public.ekcode_codes k where k.tenant_id = t.id and k.delivered_at >= date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata'),
    c.breaker_at, c.paused_at, c.raised_cap
  from public.tenants t
  join public.tenant_modules m on m.tenant_id = t.id and m.module = 'ekcode' and m.disabled_at is null
  left join public.ekcode_daily d on d.tenant_id = t.id and d.day >= (now() at time zone 'Asia/Kolkata')::date - (p_days - 1)
  left join public.ekcode_shop_controls c on c.tenant_id = t.id
  group by t.id, t.name, c.breaker_at, c.paused_at, c.raised_cap
  order by coalesce(sum(d.codes), 0) desc
  limit 500;
end $$;--> statement-breakpoint
create or replace function app_admin_ekcode_settings(p_uid uuid) returns table (version int, sign_in boolean, limits jsonb, reason text, at timestamptz)
  language plpgsql stable security definer set search_path = '' as $$
begin
  if public.ekcode_staff(p_uid, false) is null then raise exception 'not_staff' using errcode = 'P0001'; end if;
  return query select s.version, s.sign_in, s.limits, s.reason, s.at from public.ekcode_settings s order by s.version desc limit 1;
end $$;--> statement-breakpoint
-- A new limits version: every value inside its bounds (security L3; src/domains/ekcode/limits.ts LIMIT_BOUNDS).
create or replace function app_admin_ekcode_set(p_uid uuid, p_sign_in boolean, p_limits jsonb, p_reason text) returns void
  language plpgsql volatile security definer set search_path = '' as $$
declare v_email text := public.ekcode_staff(p_uid, true);
  b jsonb := '{"perNumber10m":[1,5],"perNumberDay":[3,20],"triesPerCode":[3,10],"perNetworkHour":[5,100],"perWideNetworkHour":[20,500],"globalHour":[100,50000],"breakerMinRight":[0.1,0.8],"breakerAfter":[50,2000]}'::jsonb;
  k text; v numeric;
begin
  if v_email is null then raise exception 'not_staff' using errcode = 'P0001'; end if;
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then raise exception 'reason' using errcode = 'P0001'; end if;
  for k in select jsonb_object_keys(b) loop
    v := (p_limits->>k)::numeric;
    if v is null or v < (b->k->>0)::numeric or v > (b->k->>1)::numeric then raise exception 'ekcode: % out of bounds', k using errcode = 'P0001'; end if;
  end loop;
  foreach k in array array['launch', 'growth', 'scale'] loop
    v := (p_limits->'perShopDay'->>k)::numeric;
    if v is null or v < 20 or v > 20000 then raise exception 'ekcode: perShopDay out of bounds' using errcode = 'P0001'; end if;
  end loop;
  insert into public.ekcode_settings (sign_in, limits, by, reason) values (coalesce(p_sign_in, true), p_limits, p_uid, btrim(p_reason));
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    values (null, p_uid, v_email, 'staff', 'ekcode.settings', null, jsonb_build_object('reason', btrim(p_reason), 'sign_in', p_sign_in));
end $$;--> statement-breakpoint
-- One shop: pause, resume, raise its daily cap, or reset its breaker.
create or replace function app_admin_ekcode_shop(p_uid uuid, p_tenant uuid, p_action text, p_value int, p_reason text) returns void
  language plpgsql volatile security definer set search_path = '' as $$
declare v_email text := public.ekcode_staff(p_uid, true);
begin
  if v_email is null then raise exception 'not_staff' using errcode = 'P0001'; end if;
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then raise exception 'reason' using errcode = 'P0001'; end if;
  if p_action not in ('pause', 'resume', 'raise', 'reset') then raise exception 'ekcode: bad action' using errcode = 'P0001'; end if;
  if p_action = 'raise' and (p_value is null or p_value < 20 or p_value > 20000) then raise exception 'ekcode: cap out of bounds' using errcode = 'P0001'; end if;
  insert into public.ekcode_shop_controls as c (tenant_id, raised_cap, paused_at, pause_reason, by)
    values (p_tenant, case when p_action = 'raise' then p_value end, case when p_action = 'pause' then now() end,
      case when p_action = 'pause' then btrim(p_reason) end, p_uid)
  on conflict (tenant_id) do update set
    raised_cap = case when p_action = 'raise' then p_value else c.raised_cap end,
    paused_at = case when p_action = 'pause' then now() when p_action = 'resume' then null else c.paused_at end,
    pause_reason = case when p_action = 'pause' then btrim(p_reason) when p_action = 'resume' then null else c.pause_reason end,
    extra_pow = case when p_action = 'reset' then 0 else c.extra_pow end,
    breaker_at = case when p_action = 'reset' then null else c.breaker_at end,
    by = p_uid, updated_at = now();
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    values (p_tenant, p_uid, v_email, 'staff', 'ekcode.shop.' || p_action, null, jsonb_build_object('reason', btrim(p_reason), 'value', p_value));
end $$;--> statement-breakpoint
-- Block or lift a number or network by its keyed hash; never says whether the number has an EkCode (tenancy S1).
create or replace function app_admin_ekcode_block(p_uid uuid, p_kind text, p_key_hash text, p_lift boolean, p_reason text) returns void
  language plpgsql volatile security definer set search_path = '' as $$
declare v_email text := public.ekcode_staff(p_uid, true);
begin
  if v_email is null then raise exception 'not_staff' using errcode = 'P0001'; end if;
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then raise exception 'reason' using errcode = 'P0001'; end if;
  if p_kind not in ('phone', 'net') or p_key_hash !~ '^[a-z][a-z0-9]{0,7}:[0-9a-f]{64}$' then raise exception 'ekcode: bad block' using errcode = 'P0001'; end if;
  if p_lift then update public.ekcode_blocks set lifted_at = now() where kind = p_kind and key_hash = p_key_hash and lifted_at is null;
  else insert into public.ekcode_blocks (kind, key_hash, reason, by) values (p_kind, p_key_hash, btrim(p_reason), p_uid) on conflict do nothing;
  end if;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    values (null, p_uid, v_email, 'staff', case when p_lift then 'ekcode.unblock' else 'ekcode.block' end, p_key_hash, jsonb_build_object('reason', btrim(p_reason), 'kind', p_kind));
end $$;--> statement-breakpoint
create or replace function app_admin_ekcode_blocks(p_uid uuid) returns table (kind text, key_hash text, reason text, at timestamptz)
  language plpgsql stable security definer set search_path = '' as $$
begin
  if public.ekcode_staff(p_uid, false) is null then raise exception 'not_staff' using errcode = 'P0001'; end if;
  return query select b.kind, b.key_hash, b.reason, b.at from public.ekcode_blocks b where b.lifted_at is null order by b.at desc limit 200;
end $$;--> statement-breakpoint
-- ── Execute: each definer to exactly one role (tenancy B4). ──
revoke all on function app_ekcode_start_flow(uuid, text, text, text, text, text), app_ekcode_flow_view(text),
  app_ekcode_issue_code(text, text[], uuid, text, text, text, smallint), app_ekcode_mark_sent(uuid, text), app_ekcode_mark_failed(uuid, int),
  app_ekcode_code_status(text, uuid), app_ekcode_verify(text, uuid, text[], text), app_ekcode_create_account(text, text, uuid, text, text, text),
  app_ekcode_grant(text, text, uuid, text), app_ekcode_redeem(text, text, uuid, text, text), app_ekcode_save_address(text, uuid, uuid, text, text),
  app_ekcode_store_event(text, text, text, int, timestamptz), app_ekcode_apply_events(int), app_ekcode_exposure(uuid, text, text), app_ekcode_daily(),
  app_admin_ekcode_stats(uuid, int), app_admin_ekcode_shops(uuid, int), app_admin_ekcode_settings(uuid), app_admin_ekcode_set(uuid, boolean, jsonb, text),
  app_admin_ekcode_shop(uuid, uuid, text, int, text), app_admin_ekcode_block(uuid, text, text, boolean, text), app_admin_ekcode_blocks(uuid)
  from public, anon, authenticated, service_role;--> statement-breakpoint
grant execute on function app_ekcode_start_flow(uuid, text, text, text, text, text), app_ekcode_flow_view(text),
  app_ekcode_issue_code(text, text[], uuid, text, text, text, smallint), app_ekcode_mark_sent(uuid, text), app_ekcode_mark_failed(uuid, int),
  app_ekcode_code_status(text, uuid), app_ekcode_verify(text, uuid, text[], text), app_ekcode_create_account(text, text, uuid, text, text, text),
  app_ekcode_grant(text, text, uuid, text), app_ekcode_redeem(text, text, uuid, text, text), app_ekcode_save_address(text, uuid, uuid, text, text),
  app_ekcode_store_event(text, text, text, int, timestamptz), app_ekcode_apply_events(int), app_ekcode_exposure(uuid, text, text), app_ekcode_daily()
  to frata_app;--> statement-breakpoint
grant execute on function app_admin_ekcode_stats(uuid, int), app_admin_ekcode_shops(uuid, int), app_admin_ekcode_settings(uuid),
  app_admin_ekcode_set(uuid, boolean, jsonb, text), app_admin_ekcode_shop(uuid, uuid, text, int, text), app_admin_ekcode_block(uuid, text, text, boolean, text),
  app_admin_ekcode_blocks(uuid) to frata_admin;
