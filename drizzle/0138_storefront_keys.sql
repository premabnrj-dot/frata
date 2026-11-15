CREATE TABLE "storefront_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"hash" text NOT NULL,
	"prefix" text NOT NULL,
	"partner_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	"last_seen_version" text,
	"last_seen_on" date,
	CONSTRAINT "storefront_keys_hash_unique" UNIQUE("hash"),
	CONSTRAINT "storefront_keys_kind" CHECK ("storefront_keys"."kind" in ('public','test')),
	CONSTRAINT "storefront_keys_name" CHECK (length("storefront_keys"."name") between 1 and 40 and "storefront_keys"."name" = btrim("storefront_keys"."name")),
	CONSTRAINT "storefront_keys_hash" CHECK ("storefront_keys"."hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "storefront_keys_prefix" CHECK ("storefront_keys"."prefix" ~ '^frs_(pub|test)_[0-9A-Za-z]{6}$'),
	CONSTRAINT "storefront_keys_expiry" CHECK (("storefront_keys"."kind" = 'test') = ("storefront_keys"."expires_at" is not null)),
	CONSTRAINT "storefront_keys_revoked" CHECK (("storefront_keys"."revoked_at" is null) = ("storefront_keys"."revoked_by" is null)),
	CONSTRAINT "storefront_keys_version" CHECK ("storefront_keys"."last_seen_version" is null or "storefront_keys"."last_seen_version" ~ '^[0-9]{4}-[0-9]{2}$')
);
--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "site_origin" text;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "site_domain_id" uuid;--> statement-breakpoint
ALTER TABLE "storefront_keys" ADD CONSTRAINT "storefront_keys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storefront_keys" ADD CONSTRAINT "storefront_keys_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "storefront_keys_tenant" ON "storefront_keys" USING btree ("tenant_id","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "shop_settings" ADD CONSTRAINT "shop_settings_site" CHECK (("shop_settings"."site_origin" is null) = ("shop_settings"."site_domain_id" is null) and ("shop_settings"."site_origin" is null or "shop_settings"."site_origin" ~ '^https://[a-z0-9.-]+$'));