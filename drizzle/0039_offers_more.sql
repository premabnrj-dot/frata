CREATE TABLE "discount_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"discount_id" uuid NOT NULL,
	"product_id" uuid,
	"collection_id" uuid,
	CONSTRAINT "discount_targets_one" CHECK (("discount_targets"."product_id" is null) <> ("discount_targets"."collection_id" is null))
);
--> statement-breakpoint
CREATE TABLE "discount_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"discount_id" uuid NOT NULL,
	"min_subtotal" bigint NOT NULL,
	"percent_bps" integer,
	"amount_off" bigint,
	CONSTRAINT "discount_tiers_value" CHECK (("discount_tiers"."percent_bps" is null) <> ("discount_tiers"."amount_off" is null) and ("discount_tiers"."percent_bps" is null or "discount_tiers"."percent_bps" between 1 and 10000)
    and ("discount_tiers"."amount_off" is null or "discount_tiers"."amount_off" > 0) and "discount_tiers"."min_subtotal" > 0)
);
--> statement-breakpoint
ALTER TABLE "order_lines" DROP CONSTRAINT "order_lines_money";--> statement-breakpoint
ALTER TABLE "discounts" DROP CONSTRAINT "discounts_style";--> statement-breakpoint
ALTER TABLE "discounts" DROP CONSTRAINT "discounts_value";--> statement-breakpoint
ALTER TABLE "order_discounts" DROP CONSTRAINT "order_discounts_class";--> statement-breakpoint
DROP INDEX "order_discounts_order_class";--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN "product_discount" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "discount_codes" ADD COLUMN "label" text;--> statement-breakpoint
ALTER TABLE "discounts" ADD COLUMN "targets" text DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE "discounts" ADD COLUMN "buy_qty" integer;--> statement-breakpoint
ALTER TABLE "discounts" ADD COLUMN "get_qty" integer;--> statement-breakpoint
ALTER TABLE "discounts" ADD COLUMN "get_bps" integer;--> statement-breakpoint
ALTER TABLE "discounts" ADD COLUMN "gift_variant_id" uuid;--> statement-breakpoint
ALTER TABLE "discounts" ADD COLUMN "first_order" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "order_discounts" ADD COLUMN "via" text DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "discount_targets" ADD CONSTRAINT "discount_targets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_targets" ADD CONSTRAINT "discount_targets_discount_fk" FOREIGN KEY ("tenant_id","discount_id") REFERENCES "public"."discounts"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_targets" ADD CONSTRAINT "discount_targets_product_fk" FOREIGN KEY ("tenant_id","product_id") REFERENCES "public"."products"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_targets" ADD CONSTRAINT "discount_targets_collection_fk" FOREIGN KEY ("tenant_id","collection_id") REFERENCES "public"."collections"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_tiers" ADD CONSTRAINT "discount_tiers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_tiers" ADD CONSTRAINT "discount_tiers_discount_fk" FOREIGN KEY ("tenant_id","discount_id") REFERENCES "public"."discounts"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discount_targets_discount" ON "discount_targets" USING btree ("tenant_id","discount_id");--> statement-breakpoint
CREATE UNIQUE INDEX "discount_tiers_step" ON "discount_tiers" USING btree ("tenant_id","discount_id","min_subtotal");--> statement-breakpoint
CREATE UNIQUE INDEX "discount_codes_one_public" ON "discount_codes" USING btree ("tenant_id","discount_id") WHERE "discount_codes"."label" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "order_discounts_order_offer" ON "order_discounts" USING btree ("tenant_id","order_id","discount_id");--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_money" CHECK ("order_lines"."unit_price" >= 0 and "order_lines"."taxable_value" >= 0 and "order_lines"."gst" >= 0 and "order_lines"."line_discount" >= 0 and "order_lines"."product_discount" >= 0 and "order_lines"."product_discount" <= "order_lines"."line_discount" and ("order_lines"."unit_cost" is null or "order_lines"."unit_cost" >= 0));--> statement-breakpoint
ALTER TABLE "discount_codes" ADD CONSTRAINT "discount_codes_label" CHECK ("discount_codes"."label" is null or length("discount_codes"."label") between 1 and 40);--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_targets" CHECK ("discounts"."targets" in ('all','products','collections'));--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_style" CHECK ("discounts"."style" in ('order_off','free_shipping','pay_online','product_off','bxgy','free_gift'));--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_value" CHECK (case "discounts"."style"
    when 'free_shipping' then "discounts"."percent_bps" is null and "discounts"."amount_off" is null and "discounts"."cap" is null
    when 'bxgy' then "discounts"."percent_bps" is null and "discounts"."amount_off" is null and "discounts"."buy_qty" between 1 and 10 and "discounts"."get_qty" between 1 and 10 and "discounts"."get_bps" between 1 and 10000
    when 'free_gift' then "discounts"."percent_bps" is null and "discounts"."amount_off" is null
    when 'order_off' then not ("discounts"."percent_bps" is not null and "discounts"."amount_off" is not null)
    else ("discounts"."percent_bps" is null) <> ("discounts"."amount_off" is null) end);--> statement-breakpoint
ALTER TABLE "order_discounts" ADD CONSTRAINT "order_discounts_via" CHECK ("order_discounts"."via" in ('auto','typed','link'));--> statement-breakpoint
ALTER TABLE "order_discounts" ADD CONSTRAINT "order_discounts_class" CHECK ("order_discounts"."class" in ('product','order','shipping','payment'));