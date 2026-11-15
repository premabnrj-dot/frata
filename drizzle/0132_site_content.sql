CREATE TABLE "site_content" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"previous" jsonb,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"stopped_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "site_content_tenant_id" UNIQUE("tenant_id","id"),
	CONSTRAINT "site_content_tenant_kind_key" UNIQUE("tenant_id","kind","key"),
	CONSTRAINT "site_content_kind" CHECK ("site_content"."kind" in ('announcement','menu','contact')),
	CONSTRAINT "site_content_key" CHECK ("site_content"."key" ~ '^[a-z0-9.-]{1,40}$'),
	CONSTRAINT "site_content_menu_key" CHECK ("site_content"."kind" <> 'menu' or "site_content"."key" in ('main','footer','tabs')),
	CONSTRAINT "site_content_contact_key" CHECK ("site_content"."kind" <> 'contact' or "site_content"."key" = 'contact'),
	CONSTRAINT "site_content_dated" CHECK ("site_content"."kind" = 'announcement' or ("site_content"."starts_at" is null and "site_content"."ends_at" is null and "site_content"."stopped_at" is null and "site_content"."deleted_at" is null)),
	CONSTRAINT "site_content_ends" CHECK ("site_content"."ends_at" is null or "site_content"."starts_at" is null or "site_content"."ends_at" > "site_content"."starts_at"),
	CONSTRAINT "site_content_value_size" CHECK (octet_length("site_content"."value"::text) <= 32768),
	CONSTRAINT "site_content_previous_size" CHECK ("site_content"."previous" is null or octet_length("site_content"."previous"::text) <= 34816)
);
--> statement-breakpoint
ALTER TABLE "notices" DROP CONSTRAINT "notices_source";--> statement-breakpoint
ALTER TABLE "site_content" ADD CONSTRAINT "site_content_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notices" ADD CONSTRAINT "notices_source" CHECK ("notices"."source_kind" in ('billing_notice','support_session','handover','admin','addon_trial','edit_payment','content'));