CREATE TABLE "addon_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module" text NOT NULL,
	"version" integer NOT NULL,
	"monthly_price" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "addon_prices_module" CHECK ("addon_prices"."module" in ('true_profit','reviews','marketplace_export')),
	CONSTRAINT "addon_prices_price" CHECK ("addon_prices"."monthly_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "module_pauses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module" text NOT NULL,
	"paused_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paused_by" uuid NOT NULL,
	"reason" text NOT NULL,
	"resumed_at" timestamp with time zone,
	"resumed_by" uuid,
	CONSTRAINT "module_pauses_module" CHECK ("module_pauses"."module" in ('communication','rto_shield','ship','true_profit','reviews','marketplace_export','size_fit','cart_flows'))
);
--> statement-breakpoint
CREATE TABLE "tenant_addons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"module" text NOT NULL,
	"addon_price_id" uuid,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"trial_ends_at" timestamp with time zone,
	"reason" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_addons_module" CHECK ("tenant_addons"."module" in ('rto_shield','true_profit','reviews','marketplace_export','size_fit','cart_flows')),
	CONSTRAINT "tenant_addons_paid_or_trial" CHECK (("tenant_addons"."addon_price_id" is not null) <> ("tenant_addons"."trial_ends_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "tenant_modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"module" text NOT NULL,
	"enabled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"enabled_by" uuid NOT NULL,
	"disabled_at" timestamp with time zone,
	"disabled_by" uuid,
	CONSTRAINT "tenant_modules_module" CHECK ("tenant_modules"."module" in ('communication','rto_shield','ship','true_profit','reviews','marketplace_export','size_fit','cart_flows')),
	CONSTRAINT "tenant_modules_closed_by" CHECK (("tenant_modules"."disabled_at" is null) = ("tenant_modules"."disabled_by" is null))
);
--> statement-breakpoint
ALTER TABLE "plan_versions" DROP CONSTRAINT "plan_versions_features";--> statement-breakpoint
ALTER TABLE "tenant_addons" ADD CONSTRAINT "tenant_addons_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_addons" ADD CONSTRAINT "tenant_addons_addon_price_id_addon_prices_id_fk" FOREIGN KEY ("addon_price_id") REFERENCES "public"."addon_prices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_modules" ADD CONSTRAINT "tenant_modules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "addon_prices_module_version" ON "addon_prices" USING btree ("module","version");--> statement-breakpoint
CREATE UNIQUE INDEX "module_pauses_one_open" ON "module_pauses" USING btree ("module") WHERE "module_pauses"."resumed_at" is null;--> statement-breakpoint
CREATE INDEX "tenant_addons_tenant" ON "tenant_addons" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_modules_one_open" ON "tenant_modules" USING btree ("tenant_id","module") WHERE "tenant_modules"."disabled_at" is null;--> statement-breakpoint
CREATE INDEX "tenant_modules_tenant" ON "tenant_modules" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE "plan_versions" ADD CONSTRAINT "plan_versions_features" CHECK ("plan_versions"."features" <@ array['rto_shield','true_profit','reviews','marketplace_export','size_fit','cart_flows']::text[]);