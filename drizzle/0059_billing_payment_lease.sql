ALTER TABLE "frrata_payments" ADD COLUMN "sending_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "frrata_payments" ADD COLUMN "over_paid" bigint DEFAULT 0 NOT NULL;