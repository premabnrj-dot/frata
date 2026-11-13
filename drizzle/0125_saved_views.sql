CREATE TABLE "saved_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"tab" text NOT NULL,
	"query" text DEFAULT '' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	CONSTRAINT "saved_views_tenant_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "saved_views_name" CHECK (length("saved_views"."name") between 1 and 40 and "saved_views"."name" = btrim("saved_views"."name")),
	CONSTRAINT "saved_views_query" CHECK (length("saved_views"."query") <= 400),
	CONSTRAINT "saved_views_tab" CHECK ("saved_views"."tab" in ('to_confirm','to_pack','to_ship','on_the_way','couldnt_deliver','coming_back','on_hold','all','not_paid'))
);
--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "saved_views_tenant_name" ON "saved_views" USING btree ("tenant_id",lower("name")) WHERE "saved_views"."removed_at" is null;--> statement-breakpoint
CREATE INDEX "shipments_tracking" ON "shipments" USING btree ("tenant_id","tracking_number") WHERE "shipments"."tracking_number" is not null;