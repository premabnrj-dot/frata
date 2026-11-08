ALTER TABLE "discounts" ADD COLUMN "stopped_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "discounts" ADD COLUMN "stopped_by" uuid;--> statement-breakpoint
ALTER TABLE "discounts" ADD COLUMN "stop_reason" text;--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_stopped" CHECK (("discounts"."stopped_at" is null) = ("discounts"."stopped_by" is null) and ("discounts"."stopped_at" is null) = ("discounts"."stop_reason" is null)
    and ("discounts"."stop_reason" is null or length("discounts"."stop_reason") between 3 and 300));