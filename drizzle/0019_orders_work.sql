CREATE TABLE "order_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_user_id" uuid,
	"actor_email" text,
	"fields" text[],
	"reason" text,
	"undoes" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_events_tenant_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "order_events_order_id_key" UNIQUE("tenant_id","order_id","id"),
	CONSTRAINT "order_events_kind" CHECK ("order_events"."kind" in ('confirmed','held','unheld','undone','edited','packed','cancelled','note_added','printed_slip','printed_invoice')),
	CONSTRAINT "order_events_actor" CHECK ("order_events"."actor_kind" in ('member','support','system')),
	CONSTRAINT "order_events_who" CHECK (("order_events"."actor_kind" = 'system') = ("order_events"."actor_user_id" is null) and ("order_events"."actor_user_id" is null) = ("order_events"."actor_email" is null))
);
--> statement-breakpoint
CREATE TABLE "order_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"body" text NOT NULL,
	"author_user_id" uuid NOT NULL,
	"author_email" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_notes_body" CHECK (length("order_notes"."body") between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "tenant_counters" DROP CONSTRAINT "tenant_counters_kind";--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN "stock_taken_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN "charge_taxable" bigint;--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN "charge_gst" bigint;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "held_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "packed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "invoice_number" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancel_reason" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancel_note" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "seller_gstin" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "area" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_fk" FOREIGN KEY ("tenant_id","order_id") REFERENCES "public"."orders"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_notes" ADD CONSTRAINT "order_notes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_notes" ADD CONSTRAINT "order_notes_order_fk" FOREIGN KEY ("tenant_id","order_id") REFERENCES "public"."orders"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_events_order" ON "order_events" USING btree ("tenant_id","order_id","at");--> statement-breakpoint
CREATE INDEX "order_notes_order" ON "order_notes" USING btree ("tenant_id","order_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_tenant_invoice" ON "orders" USING btree ("tenant_id","invoice_number");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_invoice_when_packed" CHECK (("orders"."invoice_number" is null) = ("orders"."packed_at" is null));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_invoice_length" CHECK ("orders"."invoice_number" is null or length("orders"."invoice_number") <= 16);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_cancel_reason" CHECK ("orders"."cancel_reason" is null or ("orders"."cancelled_at" is not null and "orders"."cancel_reason" in ('fake','customer_cancelled','unreachable','out_of_stock','cant_deliver','other')));--> statement-breakpoint
ALTER TABLE "shop_settings" ADD CONSTRAINT "shop_settings_invoice_series" CHECK (length("shop_settings"."invoice_series") <= 5);--> statement-breakpoint
ALTER TABLE "tenant_counters" ADD CONSTRAINT "tenant_counters_kind" CHECK ("tenant_counters"."kind" in ('order','invoice','bill'));