CREATE TABLE "partner_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"share_bps" integer NOT NULL,
	"share_months" integer NOT NULL,
	"notice_days" integer NOT NULL,
	"share_starts_at" timestamp with time zone,
	"removed_at" timestamp with time zone,
	"removed_by" uuid,
	CONSTRAINT "partner_links_terms" CHECK ("partner_links"."share_bps" between 0 and 10000 and "partner_links"."share_months" > 0 and "partner_links"."notice_days" >= 0)
);
--> statement-breakpoint
CREATE TABLE "partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"business_name" text DEFAULT '' NOT NULL,
	"phone" text NOT NULL,
	"city" text NOT NULL,
	"services" text[] DEFAULT '{}'::text[] NOT NULL,
	"work_url" text DEFAULT '' NOT NULL,
	"brands_now" text NOT NULL,
	"terms_version" integer NOT NULL,
	"agreed_at" timestamp with time zone NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_by" uuid,
	"declined_at" timestamp with time zone,
	"declined_by" uuid,
	"decline_reason" text,
	CONSTRAINT "partners_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "partners_services" CHECK ("partners"."services" <@ array['setup','design','photos','catalogue','ads']::text[]),
	CONSTRAINT "partners_brands_now" CHECK ("partners"."brands_now" in ('0','1-4','5-14','15+')),
	CONSTRAINT "partners_decided_once" CHECK (not ("partners"."approved_at" is not null and "partners"."declined_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "members" DROP CONSTRAINT "members_role";--> statement-breakpoint
ALTER TABLE "partner_links" ADD CONSTRAINT "partner_links_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_links" ADD CONSTRAINT "partner_links_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "partner_links_one_active" ON "partner_links" USING btree ("tenant_id") WHERE "partner_links"."removed_at" is null;--> statement-breakpoint
CREATE INDEX "partner_links_partner" ON "partner_links" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "partner_links_tenant" ON "partner_links" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "partners_to_review" ON "partners" USING btree ("applied_at") WHERE "partners"."approved_at" is null and "partners"."declined_at" is null;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_role" CHECK ("members"."role" in ('owner','admin','staff','partner'));