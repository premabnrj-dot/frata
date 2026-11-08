ALTER TABLE "shop_settings" ADD COLUMN "shop_language" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "variants" ADD COLUMN "sold_out_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "variants" ADD COLUMN "restocked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD CONSTRAINT "shop_settings_language" CHECK ("shop_settings"."shop_language" in ('en','hi'));