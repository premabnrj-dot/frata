CREATE TABLE "theme_version_stages" (
	"tenant_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"staged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"staged_by" uuid NOT NULL,
	CONSTRAINT "theme_version_stages_pk" PRIMARY KEY("tenant_id","version_id")
);
--> statement-breakpoint
CREATE TABLE "theme_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"theme_key" text NOT NULL,
	"version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone,
	"released_by" uuid,
	"recalled_at" timestamp with time zone,
	"recalled_by" uuid,
	"recalled_reason" text,
	"withdrawn_at" timestamp with time zone,
	"withdrawn_by" uuid,
	"withdrawn_reason" text,
	CONSTRAINT "theme_versions_key_version" UNIQUE("theme_key","version"),
	CONSTRAINT "theme_versions_version_shape" CHECK ("theme_versions"."version" ~ '^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$'),
	CONSTRAINT "theme_versions_baseline_stays" CHECK (not ("theme_versions"."theme_key" = 'classic' and "theme_versions"."version" = '1.0.0' and ("theme_versions"."recalled_at" is not null or "theme_versions"."withdrawn_at" is not null))),
	CONSTRAINT "theme_versions_reasons" CHECK (("theme_versions"."recalled_at" is null or length("theme_versions"."recalled_reason") between 3 and 300) and ("theme_versions"."withdrawn_at" is null or length("theme_versions"."withdrawn_reason") between 3 and 300))
);
--> statement-breakpoint
ALTER TABLE "theme_version_stages" ADD CONSTRAINT "theme_version_stages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theme_version_stages" ADD CONSTRAINT "theme_version_stages_version_id_theme_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."theme_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "theme_version_stages_version" ON "theme_version_stages" USING btree ("version_id");