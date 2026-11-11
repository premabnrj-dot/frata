CREATE TABLE "shop_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"template" text NOT NULL,
	"draft" jsonb NOT NULL,
	"live" jsonb,
	"previous" jsonb,
	"live_publish_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_pages_tenant_id" UNIQUE("tenant_id","id"),
	CONSTRAINT "shop_pages_template" CHECK ("shop_pages"."template" in ('about','faq')),
	CONSTRAINT "shop_pages_draft_size" CHECK (octet_length("shop_pages"."draft"::text) <= 32768),
	CONSTRAINT "shop_pages_live_size" CHECK ("shop_pages"."live" is null or octet_length("shop_pages"."live"::text) <= 32768),
	CONSTRAINT "shop_pages_previous_size" CHECK ("shop_pages"."previous" is null or octet_length("shop_pages"."previous"::text) <= 32768)
);
--> statement-breakpoint
ALTER TABLE "shop_pages" ADD CONSTRAINT "shop_pages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_theme_publishes" ADD CONSTRAINT "shop_theme_publishes_tenant_id" UNIQUE("tenant_id","id");--> statement-breakpoint
ALTER TABLE "shop_pages" ADD CONSTRAINT "shop_pages_live_publish" FOREIGN KEY ("tenant_id","live_publish_id") REFERENCES "public"."shop_theme_publishes"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shop_pages_tenant" ON "shop_pages" USING btree ("tenant_id","created_at");
