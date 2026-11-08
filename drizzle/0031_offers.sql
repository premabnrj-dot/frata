CREATE TABLE "discount_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"discount_id" uuid NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discount_codes_tenant_discount_id_key" UNIQUE("tenant_id","discount_id","id"),
	CONSTRAINT "discount_codes_code" CHECK ("discount_codes"."code" ~ '^[A-Za-z0-9]{4,20}$')
);
--> statement-breakpoint
CREATE TABLE "discounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"style" text NOT NULL,
	"percent_bps" integer,
	"amount_off" bigint,
	"cap" bigint,
	"min_subtotal" bigint DEFAULT 0 NOT NULL,
	"limit_total" integer,
	"limit_per_phone" integer,
	"budget" bigint,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"started_by" uuid,
	"paused_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"listed" boolean DEFAULT true NOT NULL,
	"combines_with_payment" boolean DEFAULT true NOT NULL,
	"announce" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discounts_tenant_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "discounts_style" CHECK ("discounts"."style" in ('order_off','free_shipping','pay_online')),
	CONSTRAINT "discounts_value" CHECK (case when "discounts"."style" = 'free_shipping' then "discounts"."percent_bps" is null and "discounts"."amount_off" is null and "discounts"."cap" is null
    else ("discounts"."percent_bps" is null) <> ("discounts"."amount_off" is null) end),
	CONSTRAINT "discounts_money" CHECK (("discounts"."percent_bps" is null or "discounts"."percent_bps" between 1 and 10000) and ("discounts"."amount_off" is null or "discounts"."amount_off" > 0)
    and ("discounts"."cap" is null or "discounts"."cap" > 0) and "discounts"."min_subtotal" >= 0 and ("discounts"."budget" is null or "discounts"."budget" > 0)
    and ("discounts"."limit_total" is null or "discounts"."limit_total" > 0) and ("discounts"."limit_per_phone" is null or "discounts"."limit_per_phone" > 0)),
	CONSTRAINT "discounts_window" CHECK ("discounts"."ends_at" is null or "discounts"."ends_at" > "discounts"."starts_at"),
	CONSTRAINT "discounts_title" CHECK (length("discounts"."title") between 1 and 60),
	CONSTRAINT "discounts_started_by" CHECK (("discounts"."started_at" is null) = ("discounts"."started_by" is null))
);
--> statement-breakpoint
CREATE TABLE "order_discounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"discount_id" uuid NOT NULL,
	"code_id" uuid,
	"class" text NOT NULL,
	"amount" bigint NOT NULL,
	"title" text NOT NULL,
	"style" text NOT NULL,
	"percent_bps" integer,
	"amount_off" bigint,
	"cap" bigint,
	"min_subtotal" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_discounts_class" CHECK ("order_discounts"."class" in ('order','shipping','payment')),
	CONSTRAINT "order_discounts_amount" CHECK ("order_discounts"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "price_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"price" bigint NOT NULL,
	"from_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_total";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "discount" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "discount_codes" ADD CONSTRAINT "discount_codes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_codes" ADD CONSTRAINT "discount_codes_discount_fk" FOREIGN KEY ("tenant_id","discount_id") REFERENCES "public"."discounts"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_discounts" ADD CONSTRAINT "order_discounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_discounts" ADD CONSTRAINT "order_discounts_order_fk" FOREIGN KEY ("tenant_id","order_id") REFERENCES "public"."orders"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_discounts" ADD CONSTRAINT "order_discounts_discount_fk" FOREIGN KEY ("tenant_id","discount_id") REFERENCES "public"."discounts"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_discounts" ADD CONSTRAINT "order_discounts_code_fk" FOREIGN KEY ("tenant_id","discount_id","code_id") REFERENCES "public"."discount_codes"("tenant_id","discount_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_variant_fk" FOREIGN KEY ("tenant_id","variant_id") REFERENCES "public"."variants"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "discount_codes_tenant_code" ON "discount_codes" USING btree ("tenant_id",upper("code"));--> statement-breakpoint
CREATE INDEX "discount_codes_discount" ON "discount_codes" USING btree ("tenant_id","discount_id");--> statement-breakpoint
CREATE INDEX "discounts_tenant_live" ON "discounts" USING btree ("tenant_id") WHERE "discounts"."started_at" is not null and "discounts"."ended_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "discounts_one_announce" ON "discounts" USING btree ("tenant_id") WHERE "discounts"."announce";--> statement-breakpoint
CREATE UNIQUE INDEX "order_discounts_order_class" ON "order_discounts" USING btree ("tenant_id","order_id","class");--> statement-breakpoint
CREATE INDEX "order_discounts_discount" ON "order_discounts" USING btree ("tenant_id","discount_id");--> statement-breakpoint
CREATE INDEX "price_history_variant" ON "price_history" USING btree ("tenant_id","variant_id","from_at");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_discount" CHECK ("orders"."discount" >= 0 and "orders"."discount" <= "orders"."subtotal");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_total" CHECK ("orders"."total" = "orders"."subtotal" - "orders"."discount" + "orders"."shipping" + "orders"."cod_charge" + case when "orders"."prices_include_gst" then 0 else "orders"."gst_total" end);