CREATE TABLE "order_refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"edit_id" uuid,
	"cause" text NOT NULL,
	"razorpay_payment_id" text NOT NULL,
	"amount" bigint NOT NULL,
	"retry_of" uuid,
	"not_before" timestamp with time zone NOT NULL,
	"cancelled_at" timestamp with time zone,
	"sending_at" timestamp with time zone,
	"razorpay_refund_id" text,
	"sent_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"failure" text,
	"superseded_by" uuid,
	"gateway_fee" bigint,
	"gateway_tax" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_refunds_tenant_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "order_refunds_cause" CHECK ("order_refunds"."cause" in ('edit','after_drop','old_order') and ("order_refunds"."edit_id" is not null or "order_refunds"."cause" = 'old_order')),
	CONSTRAINT "order_refunds_amount" CHECK ("order_refunds"."amount" >= 100),
	CONSTRAINT "order_refunds_payment_id" CHECK ("order_refunds"."razorpay_payment_id" ~ '^pay_[A-Za-z0-9]{6,40}$'),
	CONSTRAINT "order_refunds_failure" CHECK (("order_refunds"."failure" is null) = ("order_refunds"."failed_at" is null) and ("order_refunds"."failure" is null or "order_refunds"."failure" in ('balance','too_old','disabled','over','keys','refused','failed'))),
	CONSTRAINT "order_refunds_moments" CHECK (("order_refunds"."cancelled_at" is null or ("order_refunds"."sending_at" is null and "order_refunds"."sent_at" is null))
    and ("order_refunds"."sent_at" is null or ("order_refunds"."sending_at" is not null and "order_refunds"."razorpay_refund_id" is not null))
    and ("order_refunds"."processed_at" is null or "order_refunds"."sent_at" is not null) and ("order_refunds"."processed_at" is null or "order_refunds"."failed_at" is null)),
	CONSTRAINT "order_refunds_superseded" CHECK ("order_refunds"."superseded_by" is null or ("order_refunds"."failed_at" is not null and "order_refunds"."cause" = 'edit')),
	CONSTRAINT "order_refunds_fee" CHECK (("order_refunds"."gateway_fee" is null or ("order_refunds"."gateway_fee" >= 0 and "order_refunds"."retry_of" is null and "order_refunds"."cause" <> 'edit')) and ("order_refunds"."gateway_tax" is null or "order_refunds"."gateway_tax" >= 0))
);
--> statement-breakpoint
ALTER TABLE "order_events" DROP CONSTRAINT "order_events_kind";--> statement-breakpoint
ALTER TABLE "notices" DROP CONSTRAINT "notices_source";--> statement-breakpoint
ALTER TABLE "order_edit_lines" ALTER COLUMN "order_line_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "order_edit_lines" ADD COLUMN "held" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_edits" ADD COLUMN "asked" bigint;--> statement-breakpoint
ALTER TABLE "order_edits" ADD COLUMN "razorpay_order_id" text;--> statement-breakpoint
ALTER TABLE "order_edits" ADD COLUMN "razorpay_payment_id" text;--> statement-breakpoint
ALTER TABLE "order_edits" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order_edits" ADD COLUMN "dropped_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order_edits" ADD COLUMN "dropped_reason" text;--> statement-breakpoint
ALTER TABLE "order_edits" ADD COLUMN "gateway_fee" bigint;--> statement-breakpoint
ALTER TABLE "order_edits" ADD COLUMN "gateway_tax" bigint;--> statement-breakpoint
-- Before the refund foreign keys that name it (moved by hand: drizzle-kit writes unique constraints last).
ALTER TABLE "order_edits" ADD CONSTRAINT "order_edits_order_id_key" UNIQUE("tenant_id","order_id","id");--> statement-breakpoint
ALTER TABLE "order_refunds" ADD CONSTRAINT "order_refunds_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_refunds" ADD CONSTRAINT "order_refunds_order_fk" FOREIGN KEY ("tenant_id","order_id") REFERENCES "public"."orders"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_refunds" ADD CONSTRAINT "order_refunds_retry_fk" FOREIGN KEY ("tenant_id","retry_of") REFERENCES "public"."order_refunds"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_refunds" ADD CONSTRAINT "order_refunds_edit_fk" FOREIGN KEY ("tenant_id","order_id","edit_id") REFERENCES "public"."order_edits"("tenant_id","order_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_refunds" ADD CONSTRAINT "order_refunds_superseded_fk" FOREIGN KEY ("tenant_id","order_id","superseded_by") REFERENCES "public"."order_edits"("tenant_id","order_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_refunds_order" ON "order_refunds" USING btree ("tenant_id","order_id");--> statement-breakpoint
CREATE INDEX "order_refunds_payment" ON "order_refunds" USING btree ("tenant_id","razorpay_payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_refunds_razorpay" ON "order_refunds" USING btree ("tenant_id","razorpay_refund_id") WHERE "order_refunds"."razorpay_refund_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "order_refunds_retry" ON "order_refunds" USING btree ("tenant_id","retry_of") WHERE "order_refunds"."retry_of" is not null;--> statement-breakpoint
CREATE INDEX "order_edit_lines_held_variant" ON "order_edit_lines" USING btree ("tenant_id","variant_id") WHERE "order_edit_lines"."held" > 0;--> statement-breakpoint
CREATE UNIQUE INDEX "order_edits_razorpay" ON "order_edits" USING btree ("tenant_id","razorpay_order_id") WHERE "order_edits"."razorpay_order_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "order_edits_one_waiting" ON "order_edits" USING btree ("tenant_id","order_id") WHERE "order_edits"."asked" is not null and "order_edits"."paid_at" is null and "order_edits"."dropped_at" is null;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_kind" CHECK ("order_events"."kind" in ('confirmed','held','unheld','undone','edited','packed','cancelled','note_added','printed_slip','printed_invoice','shipped','delivered','rto','lost','ndr','shipment_cancelled','credit_noted','items_edited','edit_requested','edit_dropped'));--> statement-breakpoint
ALTER TABLE "order_edit_lines" ADD CONSTRAINT "order_edit_lines_held" CHECK ("order_edit_lines"."held" between 0 and "order_edit_lines"."qty" and ("order_edit_lines"."held" = 0 or "order_edit_lines"."side" = 'after') and ("order_edit_lines"."order_line_id" is not null or "order_edit_lines"."side" = 'after'));--> statement-breakpoint
ALTER TABLE "order_edits" ADD CONSTRAINT "order_edits_asked" CHECK ("order_edits"."asked" is null or "order_edits"."asked" >= 100);--> statement-breakpoint
ALTER TABLE "order_edits" ADD CONSTRAINT "order_edits_settled" CHECK (("order_edits"."paid_at" is null or ("order_edits"."asked" is not null and "order_edits"."razorpay_payment_id" is not null and "order_edits"."dropped_at" is null))
    and ("order_edits"."dropped_at" is null or ("order_edits"."asked" is not null and "order_edits"."dropped_reason" in ('ship_without','cannot_apply')))
    and ("order_edits"."razorpay_order_id" is null or "order_edits"."asked" is not null) and ("order_edits"."gateway_fee" is null or "order_edits"."gateway_fee" >= 0));--> statement-breakpoint
ALTER TABLE "notices" ADD CONSTRAINT "notices_source" CHECK ("notices"."source_kind" in ('billing_notice','support_session','handover','admin','addon_trial','edit_payment'));