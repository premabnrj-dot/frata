CREATE TABLE "credit_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"number" text NOT NULL,
	"against_invoice" text NOT NULL,
	"reason" text NOT NULL,
	"taxable" bigint NOT NULL,
	"cgst" bigint NOT NULL,
	"sgst" bigint NOT NULL,
	"igst" bigint NOT NULL,
	"total" bigint NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"issued_by" uuid NOT NULL,
	CONSTRAINT "credit_notes_reason" CHECK ("credit_notes"."reason" in ('cancelled','came_back')),
	CONSTRAINT "credit_notes_number_len" CHECK (length("credit_notes"."number") <= 16),
	CONSTRAINT "credit_notes_money" CHECK ("credit_notes"."taxable" >= 0 and "credit_notes"."cgst" >= 0 and "credit_notes"."sgst" >= 0 and "credit_notes"."igst" >= 0 and "credit_notes"."total" = "credit_notes"."taxable" + "credit_notes"."cgst" + "credit_notes"."sgst" + "credit_notes"."igst")
);
--> statement-breakpoint
ALTER TABLE "tenant_counters" DROP CONSTRAINT "tenant_counters_kind";--> statement-breakpoint
ALTER TABLE "order_events" DROP CONSTRAINT "order_events_kind";--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_order_fk" FOREIGN KEY ("tenant_id","order_id") REFERENCES "public"."orders"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "credit_notes_order" ON "credit_notes" USING btree ("tenant_id","order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_notes_number" ON "credit_notes" USING btree ("tenant_id","number");--> statement-breakpoint
ALTER TABLE "tenant_counters" ADD CONSTRAINT "tenant_counters_kind" CHECK ("tenant_counters"."kind" in ('order','invoice','bill','credit'));--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_kind" CHECK ("order_events"."kind" in ('confirmed','held','unheld','undone','edited','packed','cancelled','note_added','printed_slip','printed_invoice','shipped','delivered','rto','lost','ndr','shipment_cancelled','credit_noted'));