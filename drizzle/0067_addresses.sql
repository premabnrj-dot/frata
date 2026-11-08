CREATE TABLE "blocked_names" (
	"name" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"reason" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocked_names_kind" CHECK ("blocked_names"."kind" in ('protected','offensive','domain')),
	CONSTRAINT "blocked_names_lower" CHECK ("blocked_names"."name" = lower("blocked_names"."name"))
);
--> statement-breakpoint
CREATE TABLE "shop_names" (
	"name" text PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone,
	"retired_by_frrata" boolean DEFAULT false NOT NULL,
	CONSTRAINT "shop_names_lower" CHECK ("shop_names"."name" = lower("shop_names"."name"))
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "first_opened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "address_frozen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "renames_used" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_names" ADD CONSTRAINT "shop_names_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shop_names_current" ON "shop_names" USING btree ("tenant_id") WHERE retired_at is null;--> statement-breakpoint
CREATE INDEX "shop_names_tenant" ON "shop_names" USING btree ("tenant_id");