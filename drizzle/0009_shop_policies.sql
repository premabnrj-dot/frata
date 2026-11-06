CREATE TABLE "shop_policies" (
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"body" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	CONSTRAINT "shop_policies_tenant_id_kind_pk" PRIMARY KEY("tenant_id","kind"),
	CONSTRAINT "shop_policies_kind" CHECK ("shop_policies"."kind" in ('returns','shipping','privacy','terms','contact')),
	CONSTRAINT "shop_policies_body" CHECK (length("shop_policies"."body") between 1 and 20000)
);
--> statement-breakpoint
ALTER TABLE "shop_policies" ADD CONSTRAINT "shop_policies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;