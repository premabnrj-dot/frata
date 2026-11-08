CREATE TABLE "frrata_credit_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"number" text NOT NULL,
	"taxable" bigint NOT NULL,
	"cgst" bigint NOT NULL,
	"sgst" bigint NOT NULL,
	"igst" bigint NOT NULL,
	"total" bigint NOT NULL,
	"reason" text NOT NULL,
	"test_mode" boolean DEFAULT false NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"issued_by" uuid NOT NULL,
	CONSTRAINT "frrata_credit_notes_money" CHECK ("frrata_credit_notes"."taxable" > 0 and "frrata_credit_notes"."total" = "frrata_credit_notes"."taxable" + "frrata_credit_notes"."cgst" + "frrata_credit_notes"."sgst" + "frrata_credit_notes"."igst"),
	CONSTRAINT "frrata_credit_notes_reason" CHECK (length("frrata_credit_notes"."reason") between 3 and 240)
);
--> statement-breakpoint
CREATE TABLE "frrata_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"method" text NOT NULL,
	"amount" bigint NOT NULL,
	"utr" text,
	"gateway_order_id" text,
	"gateway_payment_id" text,
	"captured_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"failure_reason" text,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "frrata_payments_method" CHECK ("frrata_payments"."method" in ('bank_transfer','upi','card','emandate','paylink')),
	CONSTRAINT "frrata_payments_amount" CHECK ("frrata_payments"."amount" > 0),
	CONSTRAINT "frrata_payments_outcome" CHECK (not ("frrata_payments"."captured_at" is not null and "frrata_payments"."failed_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "frrata_invoices" ADD COLUMN "seller_name" text;--> statement-breakpoint
ALTER TABLE "frrata_invoices" ADD COLUMN "seller_gstin" text;--> statement-breakpoint
ALTER TABLE "frrata_invoices" ADD COLUMN "seller_address" text;--> statement-breakpoint
ALTER TABLE "frrata_invoices" ADD COLUMN "sac" text;--> statement-breakpoint
ALTER TABLE "frrata_invoices" ADD COLUMN "test_mode" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "frrata_credit_notes" ADD CONSTRAINT "frrata_credit_notes_invoice_fk" FOREIGN KEY ("tenant_id","invoice_id") REFERENCES "public"."frrata_invoices"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frrata_payments" ADD CONSTRAINT "frrata_payments_invoice_fk" FOREIGN KEY ("tenant_id","invoice_id") REFERENCES "public"."frrata_invoices"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "frrata_credit_notes_number" ON "frrata_credit_notes" USING btree ("number");--> statement-breakpoint
CREATE INDEX "frrata_credit_notes_invoice" ON "frrata_credit_notes" USING btree ("tenant_id","invoice_id");--> statement-breakpoint
CREATE INDEX "frrata_payments_invoice" ON "frrata_payments" USING btree ("tenant_id","invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "frrata_payments_utr" ON "frrata_payments" USING btree ("utr");--> statement-breakpoint
CREATE UNIQUE INDEX "frrata_payments_gateway_order" ON "frrata_payments" USING btree ("gateway_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "frrata_payments_gateway_payment" ON "frrata_payments" USING btree ("gateway_payment_id");