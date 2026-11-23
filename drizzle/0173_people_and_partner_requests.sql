CREATE TABLE "partner_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"declined_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"partner_id" uuid,
	CONSTRAINT "partner_requests_email" CHECK ("partner_requests"."email" = lower("partner_requests"."email") and char_length("partner_requests"."email") between 3 and 254),
	CONSTRAINT "partner_requests_one_end" CHECK (num_nonnulls("partner_requests"."accepted_at", "partner_requests"."declined_at", "partner_requests"."cancelled_at") <= 1)
);
--> statement-breakpoint
ALTER TABLE "plan_versions" DROP CONSTRAINT "plan_versions_numbers";--> statement-breakpoint
ALTER TABLE "notices" DROP CONSTRAINT "notices_source";--> statement-breakpoint
ALTER TABLE "staff_notices" DROP CONSTRAINT "staff_notices_kind";--> statement-breakpoint
ALTER TABLE "plan_versions" ADD COLUMN "people_limit" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "partner_requests" ADD CONSTRAINT "partner_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_requests" ADD CONSTRAINT "partner_requests_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "partner_requests_one_open" ON "partner_requests" USING btree ("tenant_id") WHERE "partner_requests"."accepted_at" is null and "partner_requests"."declined_at" is null and "partner_requests"."cancelled_at" is null;--> statement-breakpoint
CREATE INDEX "partner_requests_email" ON "partner_requests" USING btree ("email") WHERE "partner_requests"."accepted_at" is null and "partner_requests"."declined_at" is null and "partner_requests"."cancelled_at" is null;--> statement-breakpoint
ALTER TABLE "plan_versions" ADD CONSTRAINT "plan_versions_numbers" CHECK ("plan_versions"."monthly_price" >= 0 and "plan_versions"."included_orders" >= 0 and "plan_versions"."people_limit" >= 0);--> statement-breakpoint
ALTER TABLE "notices" ADD CONSTRAINT "notices_source" CHECK ("notices"."source_kind" in ('billing_notice','support_session','handover','admin','addon_trial','edit_payment','content','ask_owner','brand','partner_request'));--> statement-breakpoint
ALTER TABLE "staff_notices" ADD CONSTRAINT "staff_notices_kind" CHECK ("staff_notices"."kind" in ('staff_added','staff_removed','request_approved','passkey_added','passkey_removed','partner_passkey_added','partner_passkey_removed','partner_request_made','partner_request_approved','partner_role_changed','passkeys_off','passkeys_on','store_invite','store_partner_invite'));