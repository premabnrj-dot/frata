CREATE TABLE "shop_trials" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"days" integer NOT NULL,
	"open_window_days" integer NOT NULL,
	"signed_up_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"extended_at" timestamp with time zone,
	"extended_by" uuid,
	"ended_at" timestamp with time zone,
	"ended_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_trials_days" CHECK ("shop_trials"."days" between 7 and 90),
	CONSTRAINT "shop_trials_window" CHECK ("shop_trials"."open_window_days" between 0 and 30)
);
--> statement-breakpoint
CREATE TABLE "trial_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"key_hmac" text NOT NULL,
	"key_version" smallint NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trial_claims_kind" CHECK ("trial_claims"."kind" in ('email','phone','gstin','payout'))
);
--> statement-breakpoint
CREATE TABLE "trial_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"days" integer DEFAULT 30 NOT NULL,
	"open_window_days" integer DEFAULT 15 NOT NULL,
	"reason" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trial_settings_one" CHECK ("trial_settings"."id" = 1),
	CONSTRAINT "trial_settings_days" CHECK ("trial_settings"."days" between 7 and 45),
	CONSTRAINT "trial_settings_window" CHECK ("trial_settings"."open_window_days" between 0 and 30)
);
--> statement-breakpoint
ALTER TABLE "tenant_plans" ADD COLUMN "waits_for_trial" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_trials" ADD CONSTRAINT "shop_trials_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_claims" ADD CONSTRAINT "trial_claims_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "trial_claims_key" ON "trial_claims" USING btree ("kind","key_version","key_hmac");