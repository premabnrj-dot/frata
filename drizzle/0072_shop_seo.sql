ALTER TABLE "shop_settings" ADD COLUMN "seo_title" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "seo_description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD CONSTRAINT "shop_settings_seo" CHECK (length("shop_settings"."seo_title") <= 200 and length("shop_settings"."seo_description") <= 400);