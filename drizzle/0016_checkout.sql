CREATE TABLE "order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"variant_id" uuid,
	"product_id" uuid,
	"title" text NOT NULL,
	"option_values" text[] DEFAULT '{}'::text[] NOT NULL,
	"sku" text,
	"image_base" text,
	"image_widths" integer[],
	"qty" integer NOT NULL,
	"unit_price" bigint NOT NULL,
	"compare_at" bigint,
	"line_discount" bigint DEFAULT 0 NOT NULL,
	"taxable_value" bigint NOT NULL,
	"gst_bps" integer DEFAULT 0 NOT NULL,
	"gst" bigint DEFAULT 0 NOT NULL,
	"hsn" text,
	"unit_cost" bigint,
	"kind" text DEFAULT 'in_stock' NOT NULL,
	"ships_by" date,
	"lead_min_days" integer,
	"lead_max_days" integer,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "order_lines_qty" CHECK ("order_lines"."qty" between 1 and 10),
	CONSTRAINT "order_lines_money" CHECK ("order_lines"."unit_price" >= 0 and "order_lines"."taxable_value" >= 0 and "order_lines"."gst" >= 0 and "order_lines"."line_discount" >= 0 and ("order_lines"."unit_cost" is null or "order_lines"."unit_cost" >= 0)),
	CONSTRAINT "order_lines_kind" CHECK ("order_lines"."kind" in ('in_stock','preorder','made_to_order'))
);
--> statement-breakpoint
CREATE TABLE "payment_keys" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"key_id" text NOT NULL,
	"key_secret_enc" text NOT NULL,
	"webhook_secret_enc" text NOT NULL,
	"webhook_key" text NOT NULL,
	"mode" text NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"webhook_seen_at" timestamp with time zone,
	"last_event_at" timestamp with time zone,
	"problem" text,
	CONSTRAINT "payment_keys_mode" CHECK ("payment_keys"."mode" in ('test','live')),
	CONSTRAINT "payment_keys_key_id" CHECK ("payment_keys"."key_id" ~ '^rzp_(test|live)_[A-Za-z0-9]{6,40}$')
);
--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "net_revenue" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" drop column "net_revenue";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "cogs" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "cogs" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "subtotal" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cod_charge" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "gst_total" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "total" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "prices_include_gst" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "merchandise_net" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "gateway_fee" bigint;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "gateway_tax" bigint;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "phone" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "address_line" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "landmark" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "pincode" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "city" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "state" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "supply_state" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shop_state" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "arrives_from" date;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "arrives_to" date;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "return_days" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "return_kind" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "token_hash" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "request_hash" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "razorpay_order_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "razorpay_payment_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "pay_by" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "switched_to_cod_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "checkout" jsonb;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "erased_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "net_revenue" bigint GENERATED ALWAYS AS (total - gst_total) STORED;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_tenant_id_key" UNIQUE("tenant_id","id");--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_fk" FOREIGN KEY ("tenant_id","order_id") REFERENCES "public"."orders"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_keys" ADD CONSTRAINT "payment_keys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_lines_order" ON "order_lines" USING btree ("tenant_id","order_id");--> statement-breakpoint
CREATE INDEX "order_lines_variant" ON "order_lines" USING btree ("tenant_id","variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_keys_webhook_key" ON "payment_keys" USING btree ("webhook_key");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_tenant_token" ON "orders" USING btree ("tenant_id","token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_tenant_idempotency" ON "orders" USING btree ("tenant_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_tenant_razorpay" ON "orders" USING btree ("tenant_id","razorpay_order_id");--> statement-breakpoint
CREATE INDEX "orders_tenant_phone" ON "orders" USING btree ("tenant_id","phone");--> statement-breakpoint
CREATE INDEX "orders_tenant_holds" ON "orders" USING btree ("tenant_id","pay_by") WHERE "orders"."paid_at" is null and "orders"."cancelled_at" is null and "orders"."pay_by" is not null;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_money" CHECK ("orders"."subtotal" >= 0 and "orders"."shipping" >= 0 and "orders"."cod_charge" >= 0 and "orders"."gst_total" >= 0 and "orders"."total" >= 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_total" CHECK ("orders"."total" = "orders"."subtotal" + "orders"."shipping" + "orders"."cod_charge" + case when "orders"."prices_include_gst" then 0 else "orders"."gst_total" end);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_phone" CHECK ("orders"."phone" = '' or "orders"."phone" ~ '^[6-9][0-9]{9}$');--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_pincode" CHECK ("orders"."pincode" = '' or "orders"."pincode" ~ '^[1-9][0-9]{5}$');