CREATE TABLE "pincodes" (
	"pincode" text PRIMARY KEY NOT NULL,
	"city" text NOT NULL,
	"district" text NOT NULL,
	"state" text NOT NULL,
	CONSTRAINT "pincodes_shape" CHECK ("pincodes"."pincode" ~ '^[1-9][0-9]{5}$')
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"n" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "shop_settings" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"legal_name" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"origin_country" text DEFAULT 'India' NOT NULL,
	"order_prefix" text DEFAULT '' NOT NULL,
	"support_email" text DEFAULT '' NOT NULL,
	"support_phone" text DEFAULT '' NOT NULL,
	"whatsapp" text DEFAULT '' NOT NULL,
	"instagram" text DEFAULT '' NOT NULL,
	"grievance_name" text DEFAULT '' NOT NULL,
	"grievance_role" text DEFAULT '' NOT NULL,
	"grievance_email" text DEFAULT '' NOT NULL,
	"grievance_phone" text DEFAULT '' NOT NULL,
	"accent" text DEFAULT 'oxide' NOT NULL,
	"display_font" text DEFAULT 'fraunces' NOT NULL,
	"tagline" text DEFAULT '' NOT NULL,
	"logo_url" text,
	"sells" text[] DEFAULT '{}'::text[] NOT NULL,
	"return_days" integer DEFAULT 7 NOT NULL,
	"return_kind" text DEFAULT 'exchange_or_refund' NOT NULL,
	"cod_on" boolean DEFAULT true NOT NULL,
	"cod_min" bigint DEFAULT 0 NOT NULL,
	"cod_max" bigint DEFAULT 300000 NOT NULL,
	"cod_charge" bigint DEFAULT 0 NOT NULL,
	"cod_blocked_pincodes" text[] DEFAULT '{}'::text[] NOT NULL,
	"shipping_flat" bigint DEFAULT 7900 NOT NULL,
	"free_shipping_above" bigint DEFAULT 199900 NOT NULL,
	"dispatch_days" integer DEFAULT 2 NOT NULL,
	"metro_days" integer DEFAULT 4 NOT NULL,
	"rest_days" integer DEFAULT 7 NOT NULL,
	"prices_include_gst" boolean DEFAULT true NOT NULL,
	"gstin" text,
	"default_hsn" text DEFAULT '6211' NOT NULL,
	"invoice_series" text DEFAULT '' NOT NULL,
	"pickup_pincode" text,
	"published_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_settings_accent" CHECK ("shop_settings"."accent" in ('oxide','indigo','moss','wine','ink')),
	CONSTRAINT "shop_settings_font" CHECK ("shop_settings"."display_font" in ('fraunces','cormorant','inter')),
	CONSTRAINT "shop_settings_return_kind" CHECK ("shop_settings"."return_kind" in ('exchange_or_refund','exchange_only','refund_only','none')),
	CONSTRAINT "shop_settings_sells" CHECK ("shop_settings"."sells" <@ array['women','men','kids','ethnic','accessories','footwear']::text[]),
	CONSTRAINT "shop_settings_money" CHECK ("shop_settings"."cod_min" >= 0 and "shop_settings"."cod_max" >= 0 and "shop_settings"."cod_charge" >= 0 and "shop_settings"."shipping_flat" >= 0 and "shop_settings"."free_shipping_above" >= 0),
	CONSTRAINT "shop_settings_days" CHECK ("shop_settings"."return_days" between 0 and 60 and "shop_settings"."dispatch_days" between 0 and 30 and "shop_settings"."metro_days" between 0 and 30 and "shop_settings"."rest_days" between 0 and 30),
	CONSTRAINT "shop_settings_gstin" CHECK ("shop_settings"."gstin" is null or "shop_settings"."gstin" ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
	CONSTRAINT "shop_settings_pickup" CHECK ("shop_settings"."pickup_pincode" is null or "shop_settings"."pickup_pincode" ~ '^[1-9][0-9]{5}$')
);
--> statement-breakpoint
CREATE TABLE "tenant_counters" (
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"period" text DEFAULT '' NOT NULL,
	"next" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "tenant_counters_tenant_id_kind_period_pk" PRIMARY KEY("tenant_id","kind","period"),
	CONSTRAINT "tenant_counters_kind" CHECK ("tenant_counters"."kind" in ('order','invoice')),
	CONSTRAINT "tenant_counters_next" CHECK ("tenant_counters"."next" >= 1)
);
--> statement-breakpoint
ALTER TABLE "outbox" DROP CONSTRAINT "outbox_dedupe_key_unique";--> statement-breakpoint
DROP INDEX "outbox_tenant";--> statement-breakpoint
ALTER TABLE "shop_settings" ADD CONSTRAINT "shop_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_counters" ADD CONSTRAINT "tenant_counters_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rate_limits_window" ON "rate_limits" USING btree ("window_start");--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_tenant_dedupe" ON "outbox" USING btree ("tenant_id","dedupe_key");