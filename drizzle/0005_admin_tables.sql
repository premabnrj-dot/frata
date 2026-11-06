CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"tenant_id" uuid,
	"actor_user_id" uuid NOT NULL,
	"actor_email" text,
	"actor_kind" text NOT NULL,
	"support_session_id" uuid,
	"action" text NOT NULL,
	"target" text,
	"detail" jsonb,
	CONSTRAINT "audit_events_kind" CHECK ("audit_events"."actor_kind" in ('member','staff','support'))
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() + interval '14 days' NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "invites_role" CHECK ("invites"."role" in ('owner','admin','staff')),
	CONSTRAINT "invites_email_lower" CHECK ("invites"."email" = lower("invites"."email"))
);
--> statement-breakpoint
CREATE TABLE "plan_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"monthly_price" bigint NOT NULL,
	"included_orders" integer NOT NULL,
	"fee_bps" integer NOT NULL,
	"features" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "plan_versions_features" CHECK ("plan_versions"."features" <@ array['rto_shield','size_fit','cart_flows']::text[]),
	CONSTRAINT "plan_versions_fee" CHECK ("plan_versions"."fee_bps" between 0 and 10000),
	CONSTRAINT "plan_versions_numbers" CHECK ("plan_versions"."monthly_price" >= 0 and "plan_versions"."included_orders" >= 0)
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "plans_code_unique" UNIQUE("code"),
	CONSTRAINT "plans_code" CHECK ("plans"."code" in ('launch','growth','scale'))
);
--> statement-breakpoint
CREATE TABLE "platform_staff" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "platform_staff_role" CHECK ("platform_staff"."role" in ('admin','support'))
);
--> statement-breakpoint
CREATE TABLE "support_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"staff_user_id" uuid NOT NULL,
	"staff_email" text NOT NULL,
	"reason" text NOT NULL,
	"note" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "support_sessions_reason" CHECK ("support_sessions"."reason" in ('setup_help','fix_problem','merchant_asked'))
);
--> statement-breakpoint
CREATE TABLE "tenant_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_version_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"custom_monthly_price" bigint,
	"reason" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_plans_custom_reason" CHECK ("tenant_plans"."custom_monthly_price" is null or "tenant_plans"."reason" is not null)
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "is_internal" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_support_session_id_support_sessions_id_fk" FOREIGN KEY ("support_session_id") REFERENCES "public"."support_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_versions" ADD CONSTRAINT "plan_versions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_plans" ADD CONSTRAINT "tenant_plans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_plans" ADD CONSTRAINT "tenant_plans_plan_version_id_plan_versions_id_fk" FOREIGN KEY ("plan_version_id") REFERENCES "public"."plan_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_tenant_at" ON "audit_events" USING btree ("tenant_id","at");--> statement-breakpoint
CREATE INDEX "audit_events_at" ON "audit_events" USING btree ("at");--> statement-breakpoint
CREATE INDEX "audit_events_session" ON "audit_events" USING btree ("support_session_id");--> statement-breakpoint
CREATE INDEX "invites_tenant" ON "invites" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "invites_email_open" ON "invites" USING btree ("email") WHERE "invites"."accepted_at" is null and "invites"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "plan_versions_plan_version" ON "plan_versions" USING btree ("plan_id","version");--> statement-breakpoint
CREATE INDEX "support_sessions_tenant" ON "support_sessions" USING btree ("tenant_id","started_at");--> statement-breakpoint
CREATE INDEX "support_sessions_open" ON "support_sessions" USING btree ("staff_user_id") WHERE "support_sessions"."ended_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_plans_tenant_start" ON "tenant_plans" USING btree ("tenant_id","starts_at");--> statement-breakpoint
CREATE INDEX "tenant_plans_version" ON "tenant_plans" USING btree ("plan_version_id");