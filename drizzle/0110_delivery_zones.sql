CREATE TABLE "delivery_rules" (
	"tenant_id" uuid NOT NULL,
	"pincode" text NOT NULL,
	"rule" text NOT NULL,
	"cod_max" bigint,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_rules_pk" PRIMARY KEY("tenant_id","pincode"),
	CONSTRAINT "delivery_rules_pin" CHECK ("delivery_rules"."pincode" ~ '^[1-9][0-9]{5}$'),
	CONSTRAINT "delivery_rules_rule" CHECK ("delivery_rules"."rule" in ('no_delivery','prepaid_only','cod_max')),
	CONSTRAINT "delivery_rules_cod_max" CHECK (("delivery_rules"."cod_max" is not null and "delivery_rules"."cod_max" > 0) = ("delivery_rules"."rule" = 'cod_max')),
	CONSTRAINT "delivery_rules_note" CHECK ("delivery_rules"."note" is null or length("delivery_rules"."note") <= 120)
);
--> statement-breakpoint
CREATE TABLE "delivery_zone_pins" (
	"tenant_id" uuid NOT NULL,
	"pin" text NOT NULL,
	"zone_id" uuid NOT NULL,
	CONSTRAINT "delivery_zone_pins_pk" PRIMARY KEY("tenant_id","pin"),
	CONSTRAINT "delivery_zone_pins_pin" CHECK ("delivery_zone_pins"."pin" ~ '^[1-9][0-9]{2}([0-9]{3})?$')
);
--> statement-breakpoint
CREATE TABLE "delivery_zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"preset" text,
	"charge" bigint NOT NULL,
	"free_above" bigint,
	"days_min" integer NOT NULL,
	"days_max" integer NOT NULL,
	"cod_on" boolean NOT NULL,
	"cod_charge" bigint DEFAULT 0 NOT NULL,
	"cod_min" bigint DEFAULT 0 NOT NULL,
	"cod_max" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_zones_tenant_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "delivery_zones_name" CHECK (length("delivery_zones"."name") between 1 and 40),
	CONSTRAINT "delivery_zones_preset" CHECK ("delivery_zones"."preset" is null or "delivery_zones"."preset" in ('metro','tier2','special','rest')),
	CONSTRAINT "delivery_zones_days" CHECK ("delivery_zones"."days_min" between 0 and 60 and "delivery_zones"."days_max" between "delivery_zones"."days_min" and 60),
	CONSTRAINT "delivery_zones_money" CHECK ("delivery_zones"."charge" >= 0 and "delivery_zones"."cod_charge" >= 0 and "delivery_zones"."cod_min" >= 0 and ("delivery_zones"."free_above" is null or "delivery_zones"."free_above" > 0) and ("delivery_zones"."cod_max" is null or "delivery_zones"."cod_max" > 0)),
	CONSTRAINT "delivery_zones_position" CHECK ("delivery_zones"."position" between 0 and 49)
);
--> statement-breakpoint
CREATE TABLE "shop_holidays" (
	"tenant_id" uuid NOT NULL,
	"day" date NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "shop_holidays_pk" PRIMARY KEY("tenant_id","day"),
	CONSTRAINT "shop_holidays_name" CHECK (length("shop_holidays"."name") between 1 and 60)
);
--> statement-breakpoint
ALTER TABLE "plan_versions" DROP CONSTRAINT "plan_versions_features";--> statement-breakpoint
ALTER TABLE "addon_prices" DROP CONSTRAINT "addon_prices_module";--> statement-breakpoint
ALTER TABLE "app_interest" DROP CONSTRAINT "app_interest_module";--> statement-breakpoint
ALTER TABLE "module_pauses" DROP CONSTRAINT "module_pauses_module";--> statement-breakpoint
ALTER TABLE "tenant_addons" DROP CONSTRAINT "tenant_addons_module";--> statement-breakpoint
ALTER TABLE "tenant_modules" DROP CONSTRAINT "tenant_modules_module";--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "dispatch_cutoff" text;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "ship_days" integer DEFAULT 63 NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_rules" ADD CONSTRAINT "delivery_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_zone_pins" ADD CONSTRAINT "delivery_zone_pins_zone_fk" FOREIGN KEY ("tenant_id","zone_id") REFERENCES "public"."delivery_zones"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_holidays" ADD CONSTRAINT "shop_holidays_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delivery_zone_pins_zone" ON "delivery_zone_pins" USING btree ("zone_id");--> statement-breakpoint
CREATE INDEX "delivery_zones_tenant" ON "delivery_zones" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE "plan_versions" ADD CONSTRAINT "plan_versions_features" CHECK ("plan_versions"."features" <@ array['rto_shield','true_profit','reviews','marketplace_export','size_fit','cart_flows','gst','delivery_zones']::text[]);--> statement-breakpoint
ALTER TABLE "shop_settings" ADD CONSTRAINT "shop_settings_dispatch" CHECK (("shop_settings"."dispatch_cutoff" is null or "shop_settings"."dispatch_cutoff" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') and "shop_settings"."ship_days" between 0 and 127);--> statement-breakpoint
ALTER TABLE "addon_prices" ADD CONSTRAINT "addon_prices_module" CHECK ("addon_prices"."module" in ('true_profit','reviews','marketplace_export','delivery_zones'));--> statement-breakpoint
ALTER TABLE "app_interest" ADD CONSTRAINT "app_interest_module" CHECK ("app_interest"."module" in ('communication','rto_shield','ship','true_profit','reviews','marketplace_export','size_fit','cart_flows','gst','ekcode','product_video','delivery_zones'));--> statement-breakpoint
ALTER TABLE "module_pauses" ADD CONSTRAINT "module_pauses_module" CHECK ("module_pauses"."module" in ('communication','rto_shield','ship','true_profit','reviews','marketplace_export','size_fit','cart_flows','gst','ekcode','product_video','delivery_zones'));--> statement-breakpoint
ALTER TABLE "tenant_addons" ADD CONSTRAINT "tenant_addons_module" CHECK ("tenant_addons"."module" in ('rto_shield','true_profit','reviews','marketplace_export','size_fit','cart_flows','gst','delivery_zones'));--> statement-breakpoint
ALTER TABLE "tenant_modules" ADD CONSTRAINT "tenant_modules_module" CHECK ("tenant_modules"."module" in ('communication','rto_shield','ship','true_profit','reviews','marketplace_export','size_fit','cart_flows','gst','ekcode','product_video','delivery_zones'));