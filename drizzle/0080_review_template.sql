ALTER TABLE "review_requests" ADD COLUMN "wamid" text;--> statement-breakpoint
ALTER TABLE "review_requests" ADD COLUMN "reminder_wamid" text;--> statement-breakpoint
ALTER TABLE "review_settings" ADD COLUMN "template_id" text;--> statement-breakpoint
ALTER TABLE "review_settings" ADD COLUMN "template_status" text;--> statement-breakpoint
ALTER TABLE "review_settings" ADD COLUMN "template_category" text;--> statement-breakpoint
ALTER TABLE "review_settings" ADD COLUMN "template_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "review_requests_wamid" ON "review_requests" USING btree ("tenant_id","wamid");--> statement-breakpoint
CREATE UNIQUE INDEX "review_requests_reminder_wamid" ON "review_requests" USING btree ("tenant_id","reminder_wamid");