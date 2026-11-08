CREATE TABLE "shipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"courier_name" text,
	"tracking_number" text,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"ended_reason" text,
	CONSTRAINT "shipments_tenant_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "shipments_provider" CHECK ("shipments"."provider" in ('self','shiprocket')),
	CONSTRAINT "shipments_text" CHECK (("shipments"."courier_name" is null or length("shipments"."courier_name") between 1 and 60) and ("shipments"."tracking_number" is null or length("shipments"."tracking_number") between 1 and 40)),
	CONSTRAINT "shipments_ended" CHECK (("shipments"."ended_at" is null) = ("shipments"."ended_reason" is null) and ("shipments"."ended_reason" is null or "shipments"."ended_reason" in ('cancelled','lost','undone')))
);
--> statement-breakpoint
ALTER TABLE "order_events" DROP CONSTRAINT "order_events_kind";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "forward_shipping" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "forward_shipping" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "ship_cost_delivery" bigint;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "ship_cost_return" bigint;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "ship_cost_cod" bigint;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "ship_costs_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "rto_shipping" bigint;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "courier_cod_fee" bigint;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_fk" FOREIGN KEY ("tenant_id","order_id") REFERENCES "public"."orders"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shipments_one_open" ON "shipments" USING btree ("tenant_id","order_id") WHERE "shipments"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "shipments_order" ON "shipments" USING btree ("tenant_id","order_id");--> statement-breakpoint
CREATE INDEX "orders_inflight_idx" ON "orders" USING btree ("tenant_id","placed_at" DESC NULLS LAST) WHERE "orders"."rto_delivered_at" is null and ("orders"."rto_initiated_at" is not null or ("orders"."delivered_at" is null and "orders"."cancelled_at" is null and ("orders"."packed_at" is not null or "orders"."shipped_at" is not null or "orders"."ndr_at" is not null)));--> statement-breakpoint
ALTER TABLE "shop_settings" ADD CONSTRAINT "shop_settings_ship_costs" CHECK (("shop_settings"."ship_cost_delivery" is null or "shop_settings"."ship_cost_delivery" between 0 and 1000000) and ("shop_settings"."ship_cost_return" is null or "shop_settings"."ship_cost_return" between 0 and 1000000)
    and ("shop_settings"."ship_cost_cod" is null or "shop_settings"."ship_cost_cod" between 0 and 1000000)
    and ("shop_settings"."ship_costs_confirmed_at" is null or ("shop_settings"."ship_cost_delivery" is not null and "shop_settings"."ship_cost_return" is not null and "shop_settings"."ship_cost_cod" is not null)));--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_kind" CHECK ("order_events"."kind" in ('confirmed','held','unheld','undone','edited','packed','cancelled','note_added','printed_slip','printed_invoice','shipped','delivered','rto','lost','ndr','shipment_cancelled'));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_freight" CHECK (("orders"."forward_shipping" is null or "orders"."forward_shipping" >= 0) and ("orders"."rto_shipping" is null or "orders"."rto_shipping" >= 0) and ("orders"."courier_cod_fee" is null or "orders"."courier_cod_fee" >= 0));