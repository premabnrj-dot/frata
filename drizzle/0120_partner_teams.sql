CREATE TABLE "partner_assignments" (
	"partner_member_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_assignments_partner_member_id_tenant_id_pk" PRIMARY KEY("partner_member_id","tenant_id")
);
--> statement-breakpoint
CREATE TABLE "partner_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"user_id" uuid,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"invited_by" uuid,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"invite_expires_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"removed_at" timestamp with time zone,
	"removed_by" uuid,
	CONSTRAINT "partner_members_role" CHECK ("partner_members"."role" in ('owner','lead','builder')),
	CONSTRAINT "partner_members_email_lower" CHECK ("partner_members"."email" = lower("partner_members"."email")),
	CONSTRAINT "partner_members_accepted_user" CHECK (("partner_members"."accepted_at" is null) = ("partner_members"."user_id" is null))
);
--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "partner_member_id" uuid;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "suspended_by" uuid;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "suspend_reason" text;--> statement-breakpoint
ALTER TABLE "partner_assignments" ADD CONSTRAINT "partner_assignments_partner_member_id_partner_members_id_fk" FOREIGN KEY ("partner_member_id") REFERENCES "public"."partner_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_assignments" ADD CONSTRAINT "partner_assignments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_members" ADD CONSTRAINT "partner_members_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "partner_assignments_tenant" ON "partner_assignments" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_members_one_partner" ON "partner_members" USING btree ("user_id") WHERE "partner_members"."removed_at" is null and "partner_members"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "partner_members_email" ON "partner_members" USING btree ("partner_id","email") WHERE "partner_members"."removed_at" is null;--> statement-breakpoint
CREATE INDEX "partner_members_partner" ON "partner_members" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "members_partner_member" ON "members" USING btree ("partner_member_id");