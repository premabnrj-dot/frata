CREATE TABLE "shop_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"host" text NOT NULL,
	"apex" text NOT NULL,
	"with_www" boolean NOT NULL,
	"token" text DEFAULT md5(gen_random_uuid()::text || gen_random_uuid()::text) NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_by" uuid NOT NULL,
	"proved_at" timestamp with time zone,
	"added_at" timestamp with time zone,
	"vercel_txt" text,
	"dns_ok_at" timestamp with time zone,
	"cert_ok_at" timestamp with time zone,
	"checked_at" timestamp with time zone,
	"failing_since" timestamp with time zone,
	"contest_at" timestamp with time zone,
	"main_at" timestamp with time zone,
	"razorpay_ok_at" timestamp with time zone,
	"razorpay_ok_by" uuid,
	"parked_at" timestamp with time zone,
	"away_since" timestamp with time zone,
	"removed_at" timestamp with time zone,
	"removed_reason" text,
	"removed_by" uuid,
	CONSTRAINT "shop_domains_token_unique" UNIQUE("token"),
	CONSTRAINT "shop_domains_host" CHECK ("shop_domains"."host" = lower("shop_domains"."host") and "shop_domains"."host" !~ '\.$' and length("shop_domains"."host") between 4 and 253 and "shop_domains"."host" ~ '^[a-z0-9.-]+$'
    and "shop_domains"."host" !~ '^www\.' and "shop_domains"."host" !~ '(^|\.)(frrata|frata)\.' and "shop_domains"."host" !~ '(^|\.)vercel\.app$'
    and "shop_domains"."host" ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'
    and ("shop_domains"."host" = "shop_domains"."apex" or "shop_domains"."host" like '%.' || "shop_domains"."apex")),
	CONSTRAINT "shop_domains_token" CHECK ("shop_domains"."token" ~ '^[0-9a-f]{32}$'),
	CONSTRAINT "shop_domains_main_needs" CHECK ("shop_domains"."main_at" is null or ("shop_domains"."proved_at" is not null and "shop_domains"."cert_ok_at" is not null)),
	CONSTRAINT "shop_domains_removed" CHECK (("shop_domains"."removed_at" is null) = ("shop_domains"."removed_reason" is null)),
	CONSTRAINT "shop_domains_after_proof" CHECK ("shop_domains"."proved_at" is not null or ("shop_domains"."added_at" is null and "shop_domains"."dns_ok_at" is null and "shop_domains"."cert_ok_at" is null and "shop_domains"."razorpay_ok_at" is null and "shop_domains"."main_at" is null)),
	CONSTRAINT "shop_domains_parked" CHECK ("shop_domains"."parked_at" is null or "shop_domains"."removed_at" is not null),
	CONSTRAINT "shop_domains_removed_not_main" CHECK ("shop_domains"."main_at" is null or "shop_domains"."removed_at" is null),
	CONSTRAINT "shop_domains_razorpay_by" CHECK (("shop_domains"."razorpay_ok_at" is null) = ("shop_domains"."razorpay_ok_by" is null))
);
--> statement-breakpoint
ALTER TABLE "shop_domains" ADD CONSTRAINT "shop_domains_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shop_domains_claim" ON "shop_domains" USING btree ("tenant_id","host") WHERE removed_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "shop_domains_live" ON "shop_domains" USING btree ("host") WHERE proved_at is not null and removed_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "shop_domains_live_apex" ON "shop_domains" USING btree ("apex") WHERE proved_at is not null and removed_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "shop_domains_main" ON "shop_domains" USING btree ("tenant_id") WHERE main_at is not null and removed_at is null;--> statement-breakpoint
CREATE INDEX "shop_domains_due" ON "shop_domains" USING btree ("checked_at") WHERE removed_at is null or parked_at is not null;