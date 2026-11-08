CREATE TABLE "billing_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_at" timestamp with time zone,
	"error" text,
	CONSTRAINT "billing_events_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "billing_mandate_setups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"gateway_order_id" text NOT NULL,
	"gateway_customer_id" text NOT NULL,
	"method" text NOT NULL,
	"max_amount" bigint NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "billing_mandate_setups_gateway_order_id_unique" UNIQUE("gateway_order_id"),
	CONSTRAINT "billing_mandate_setups_method" CHECK ("billing_mandate_setups"."method" in ('upi','card','emandate')),
	CONSTRAINT "billing_mandate_setups_max" CHECK ("billing_mandate_setups"."max_amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "billing_notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount" bigint NOT NULL,
	"debit_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_notices_kind" CHECK ("billing_notices"."kind" in ('debit_notice','failed','acknowledge'))
);
--> statement-breakpoint
ALTER TABLE "billing_mandate_setups" ADD CONSTRAINT "billing_mandate_setups_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_notices" ADD CONSTRAINT "billing_notices_invoice_fk" FOREIGN KEY ("tenant_id","invoice_id") REFERENCES "public"."frrata_invoices"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_mandate_setups_tenant" ON "billing_mandate_setups" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "billing_notices_tenant" ON "billing_notices" USING btree ("tenant_id","created_at");