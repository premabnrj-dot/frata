CREATE TABLE "shop_theme_publishes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_by" uuid NOT NULL,
	"published_by_email" text
);
--> statement-breakpoint
CREATE TABLE "shop_theme_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"theme_key" text NOT NULL,
	"theme_version" text NOT NULL,
	"style_key" text NOT NULL,
	"settings" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"created_by_email" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"updated_by_email" text,
	CONSTRAINT "shop_theme_revisions_tenant_id" UNIQUE("tenant_id","id"),
	CONSTRAINT "shop_theme_revisions_key" CHECK ("shop_theme_revisions"."theme_key" in ('classic','editorial','bazaar','minimal','atelier')),
	CONSTRAINT "shop_theme_revisions_version_shape" CHECK ("shop_theme_revisions"."theme_version" ~ '^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$'),
	CONSTRAINT "shop_theme_revisions_style_shape" CHECK ("shop_theme_revisions"."style_key" ~ '^[a-z0-9-]{1,40}$'),
	CONSTRAINT "shop_theme_revisions_size" CHECK (octet_length("shop_theme_revisions"."settings"::text) <= 65536)
);
--> statement-breakpoint
ALTER TABLE "shop_theme_publishes" ADD CONSTRAINT "shop_theme_publishes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_theme_publishes" ADD CONSTRAINT "shop_theme_publishes_revision" FOREIGN KEY ("tenant_id","revision_id") REFERENCES "public"."shop_theme_revisions"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_theme_revisions" ADD CONSTRAINT "shop_theme_revisions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shop_theme_publishes_latest" ON "shop_theme_publishes" USING btree ("tenant_id","published_at","id");--> statement-breakpoint
CREATE INDEX "shop_theme_publishes_revision_idx" ON "shop_theme_publishes" USING btree ("tenant_id","revision_id");--> statement-breakpoint
CREATE INDEX "shop_theme_revisions_recent" ON "shop_theme_revisions" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_tenant_delivered" ON "orders" USING btree ("tenant_id","delivered_at") WHERE "orders"."delivered_at" is not null;