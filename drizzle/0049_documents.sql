ALTER TABLE "shop_settings" ADD COLUMN "doc_logo" text;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "doc_signatory" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "doc_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "slip_size" text DEFAULT 'a4' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "invoice_logo" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "invoice_signatory" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "invoice_note" text;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD CONSTRAINT "shop_settings_documents" CHECK ("shop_settings"."slip_size" in ('a4','label') and length("shop_settings"."doc_signatory") <= 80 and length("shop_settings"."doc_note") <= 240);--> statement-breakpoint
ALTER TABLE "shop_settings" ADD CONSTRAINT "shop_settings_doc_logo" CHECK ("shop_settings"."doc_logo" is null or "shop_settings"."doc_logo" ~ ('^https://[a-z0-9]+\.public\.blob\.vercel-storage\.com/tenants/' || "shop_settings"."tenant_id"::text || '/documents/[0-9a-f-]{36}\.png$'));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_invoice_logo" CHECK ("orders"."invoice_logo" is null or "orders"."invoice_logo" ~ ('^https://[a-z0-9]+\.public\.blob\.vercel-storage\.com/tenants/' || "orders"."tenant_id"::text || '/documents/[0-9a-f-]{36}\.png$'));