CREATE TABLE "build_key_device_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_hash" text NOT NULL,
	"code_hash" text NOT NULL,
	"store_slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"tenant_id" uuid,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"claimed_at" timestamp with time zone,
	CONSTRAINT "build_key_device_codes_device_unique" UNIQUE("device_hash"),
	CONSTRAINT "build_key_device_codes_code_unique" UNIQUE("code_hash"),
	CONSTRAINT "build_key_device_codes_hashes" CHECK ("build_key_device_codes"."device_hash" ~ '^[0-9a-f]{64}$' and "build_key_device_codes"."code_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "build_key_device_codes_end" CHECK ("build_key_device_codes"."expires_at" <= "build_key_device_codes"."created_at" + interval '10 minutes'),
	CONSTRAINT "build_key_device_codes_approved" CHECK (("build_key_device_codes"."approved_at" is null) = ("build_key_device_codes"."approved_by" is null) and ("build_key_device_codes"."approved_at" is null) = ("build_key_device_codes"."tenant_id" is null)),
	CONSTRAINT "build_key_device_codes_claimed" CHECK ("build_key_device_codes"."claimed_at" is null or "build_key_device_codes"."approved_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "build_key_device_codes" ADD CONSTRAINT "build_key_device_codes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "build_key_device_codes_expires" ON "build_key_device_codes" USING btree ("expires_at");--> statement-breakpoint
-- G·3: no Frrata role reads or writes a device code; the app_device_code_* definers in 0160 are the only door (proof § 81).
alter table build_key_device_codes enable row level security;--> statement-breakpoint
revoke all on build_key_device_codes from public, anon, authenticated, service_role, frata_app, frata_admin, frata_builder;--> statement-breakpoint
create policy definer_only on build_key_device_codes as restrictive for all to public using (false) with check (false);
