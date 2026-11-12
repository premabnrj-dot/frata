-- Order edit OE·1 (docs/plans/2026-11-12-order-edit.md): an edit's record (order_edits, order_edit_lines: typed columns,
-- never jsonb); lines and offers are taken out instead of rewritten (order_lines.removed_at / replaced_by,
-- order_discounts.removed_at; one live use of an offer per order); the items_edited event and the held 'edited' email.
-- Every new column is nullable: rows written before keep working. Access: 0112_order_edits_access.sql.
CREATE TABLE "order_edit_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"edit_id" uuid NOT NULL,
	"side" text NOT NULL,
	"order_line_id" uuid NOT NULL,
	"variant_id" uuid,
	"qty" integer NOT NULL,
	"unit_price" bigint NOT NULL,
	"product_discount" bigint NOT NULL,
	"line_discount" bigint NOT NULL,
	"reason" text,
	"replaces" uuid,
	CONSTRAINT "order_edit_lines_once" UNIQUE("tenant_id","edit_id","side","order_line_id"),
	CONSTRAINT "order_edit_lines_side" CHECK ("order_edit_lines"."side" in ('before','after')),
	CONSTRAINT "order_edit_lines_reason" CHECK ("order_edit_lines"."reason" is null or ("order_edit_lines"."side" = 'before' and "order_edit_lines"."reason" in ('out_of_stock','customer_asked','other'))),
	CONSTRAINT "order_edit_lines_replaces" CHECK ("order_edit_lines"."replaces" is null or ("order_edit_lines"."side" = 'after' and "order_edit_lines"."replaces" <> "order_edit_lines"."order_line_id")),
	CONSTRAINT "order_edit_lines_money" CHECK ("order_edit_lines"."qty" between 1 and 10 and "order_edit_lines"."unit_price" >= 0 and "order_edit_lines"."product_discount" >= 0 and "order_edit_lines"."line_discount" >= "order_edit_lines"."product_discount")
);
--> statement-breakpoint
CREATE TABLE "order_edits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"total_before" bigint NOT NULL,
	"total_after" bigint NOT NULL,
	"shipping_before" bigint NOT NULL,
	"shipping_after" bigint NOT NULL,
	"notify" boolean NOT NULL,
	"offers_removed" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"offers_added" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_edits_tenant_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "order_edits_event" UNIQUE("tenant_id","event_id"),
	CONSTRAINT "order_edits_money" CHECK ("order_edits"."total_before" >= 0 and "order_edits"."total_after" >= 0 and "order_edits"."shipping_before" >= 0 and "order_edits"."shipping_after" >= 0),
	CONSTRAINT "order_edits_offers" CHECK (cardinality("order_edits"."offers_removed") <= 40 and cardinality("order_edits"."offers_added") <= 40)
);
--> statement-breakpoint
ALTER TABLE "order_events" DROP CONSTRAINT "order_events_kind";--> statement-breakpoint
ALTER TABLE "email_messages" DROP CONSTRAINT "email_messages_kind";--> statement-breakpoint
ALTER TABLE "shop_emails" DROP CONSTRAINT "shop_emails_kind";--> statement-breakpoint
DROP INDEX "order_discounts_order_offer";--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN "replaced_by" uuid;--> statement-breakpoint
ALTER TABLE "order_discounts" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order_edit_lines" ADD CONSTRAINT "order_edit_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_edit_lines" ADD CONSTRAINT "order_edit_lines_edit_fk" FOREIGN KEY ("tenant_id","edit_id") REFERENCES "public"."order_edits"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_edit_lines" ADD CONSTRAINT "order_edit_lines_line_fk" FOREIGN KEY ("tenant_id","order_line_id") REFERENCES "public"."order_lines"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_edit_lines" ADD CONSTRAINT "order_edit_lines_replaces_fk" FOREIGN KEY ("tenant_id","replaces") REFERENCES "public"."order_lines"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_edits" ADD CONSTRAINT "order_edits_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_edits" ADD CONSTRAINT "order_edits_order_fk" FOREIGN KEY ("tenant_id","order_id") REFERENCES "public"."orders"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_edits" ADD CONSTRAINT "order_edits_event_fk" FOREIGN KEY ("tenant_id","order_id","event_id") REFERENCES "public"."order_events"("tenant_id","order_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_edit_lines_line" ON "order_edit_lines" USING btree ("tenant_id","order_line_id");--> statement-breakpoint
CREATE INDEX "order_edits_order" ON "order_edits" USING btree ("tenant_id","order_id");--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_replaced_by_fk" FOREIGN KEY ("tenant_id","replaced_by") REFERENCES "public"."order_lines"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "order_discounts_order_offer" ON "order_discounts" USING btree ("tenant_id","order_id","discount_id") WHERE "order_discounts"."removed_at" is null;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_kind" CHECK ("order_events"."kind" in ('confirmed','held','unheld','undone','edited','packed','cancelled','note_added','printed_slip','printed_invoice','shipped','delivered','rto','lost','ndr','shipment_cancelled','credit_noted','items_edited'));--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_replaced" CHECK ("order_lines"."replaced_by" is null or ("order_lines"."removed_at" is not null and "order_lines"."replaced_by" <> "order_lines"."id"));--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_removed_stock" CHECK ("order_lines"."removed_at" is null or "order_lines"."stock_taken_at" is null);--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_kind" CHECK ("email_messages"."kind" in ('confirmed','finish_paying','shipped','delivered','cancelled','edited','test','invoice','notice','sign_in'));--> statement-breakpoint
ALTER TABLE "shop_emails" ADD CONSTRAINT "shop_emails_kind" CHECK ("shop_emails"."kind" in ('confirmed','finish_paying','shipped','delivered','cancelled','edited'));