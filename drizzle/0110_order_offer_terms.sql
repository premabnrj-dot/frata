-- Order edit OE·0 (docs/plans/2026-11-12-order-edit.md): an order offer keeps the rest of the terms it was sold on —
-- every tier step, Buy X get Y, the gift and the products covered — so an edit re-plans the order's own offers
-- (replanKept) whatever the offer becomes. All nullable: rows placed before keep working (a product offer's terms then
-- are not known). Grants unchanged: frata_app's table-wide select, insert covers the new columns; frata_admin, anon,
-- authenticated and service_role hold nothing on order_discounts (0032).
ALTER TABLE "order_discounts" ADD COLUMN "tier_mins" bigint[];--> statement-breakpoint
ALTER TABLE "order_discounts" ADD COLUMN "tier_percent_bps" integer[];--> statement-breakpoint
ALTER TABLE "order_discounts" ADD COLUMN "tier_amounts_off" bigint[];--> statement-breakpoint
ALTER TABLE "order_discounts" ADD COLUMN "targets" text;--> statement-breakpoint
ALTER TABLE "order_discounts" ADD COLUMN "target_products" uuid[];--> statement-breakpoint
ALTER TABLE "order_discounts" ADD COLUMN "buy_qty" integer;--> statement-breakpoint
ALTER TABLE "order_discounts" ADD COLUMN "get_qty" integer;--> statement-breakpoint
ALTER TABLE "order_discounts" ADD COLUMN "get_bps" integer;--> statement-breakpoint
ALTER TABLE "order_discounts" ADD COLUMN "gift_variant_id" uuid;--> statement-breakpoint
ALTER TABLE "order_discounts" ADD CONSTRAINT "order_discounts_tiers" CHECK (case when "order_discounts"."tier_mins" is null then "order_discounts"."tier_percent_bps" is null and "order_discounts"."tier_amounts_off" is null
    else "order_discounts"."class" = 'order' and cardinality("order_discounts"."tier_mins") >= 1 and array_position("order_discounts"."tier_mins", null) is null
      and ("order_discounts"."tier_percent_bps" is null) <> ("order_discounts"."tier_amounts_off" is null)
      and coalesce(cardinality("order_discounts"."tier_percent_bps"), cardinality("order_discounts"."tier_amounts_off")) = cardinality("order_discounts"."tier_mins")
      and array_position(coalesce("order_discounts"."tier_percent_bps", '{}'), null) is null and array_position(coalesce("order_discounts"."tier_amounts_off", '{}'), null) is null end);--> statement-breakpoint
ALTER TABLE "order_discounts" ADD CONSTRAINT "order_discounts_targets" CHECK (("order_discounts"."targets" is null or ("order_discounts"."class" = 'product' and "order_discounts"."targets" in ('all','products')))
    and coalesce("order_discounts"."targets" = 'products', false) = ("order_discounts"."target_products" is not null));--> statement-breakpoint
ALTER TABLE "order_discounts" ADD CONSTRAINT "order_discounts_bxgy" CHECK (("order_discounts"."buy_qty" is null) = ("order_discounts"."get_qty" is null) and ("order_discounts"."buy_qty" is null) = ("order_discounts"."get_bps" is null)
    and ("order_discounts"."buy_qty" is null or ("order_discounts"."style" = 'bxgy' and "order_discounts"."buy_qty" between 1 and 10 and "order_discounts"."get_qty" between 1 and 10 and "order_discounts"."get_bps" between 1 and 10000)));--> statement-breakpoint
ALTER TABLE "order_discounts" ADD CONSTRAINT "order_discounts_gift" CHECK ("order_discounts"."gift_variant_id" is null or "order_discounts"."style" = 'free_gift');