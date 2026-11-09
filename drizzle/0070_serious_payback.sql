ALTER TABLE "shop_settings" DROP CONSTRAINT "shop_settings_sells";--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "gst_scheme" text DEFAULT 'regular' NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "home_state" text;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "turnover_band" text DEFAULT 'under_5cr' NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "gst_filing" text DEFAULT 'monthly' NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "b2b_invoices" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "uqc" text DEFAULT 'NOS' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "gst_bps" integer;--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN "uqc" text DEFAULT 'NOS' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "seller_scheme" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "buyer_gstin" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "buyer_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX "orders_tenant_packed" ON "orders" USING btree ("tenant_id","packed_at") WHERE "orders"."packed_at" is not null;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD CONSTRAINT "shop_settings_gst_scheme" CHECK ("shop_settings"."gst_scheme" in ('regular','composition'));--> statement-breakpoint
ALTER TABLE "shop_settings" ADD CONSTRAINT "shop_settings_home_state" CHECK ("shop_settings"."home_state" is null or "shop_settings"."home_state" ~ '^[0-9]{2}$');--> statement-breakpoint
ALTER TABLE "shop_settings" ADD CONSTRAINT "shop_settings_turnover" CHECK ("shop_settings"."turnover_band" in ('under_5cr','5_to_10cr','over_10cr'));--> statement-breakpoint
ALTER TABLE "shop_settings" ADD CONSTRAINT "shop_settings_gst_filing" CHECK ("shop_settings"."gst_filing" in ('monthly','quarterly'));--> statement-breakpoint
ALTER TABLE "shop_settings" ADD CONSTRAINT "shop_settings_hsn" CHECK ("shop_settings"."default_hsn" ~ '^[0-9]{4}([0-9]{2}){0,2}$');--> statement-breakpoint
ALTER TABLE "shop_settings" ADD CONSTRAINT "shop_settings_sells" CHECK ("shop_settings"."sells" <@ array['women','men','kids','ethnic','accessories','footwear','jewellery','beauty','wellness']::text[]);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_hsn" CHECK ("products"."hsn" is null or "products"."hsn" ~ '^[0-9]{4}([0-9]{2}){0,2}$');--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_uqc" CHECK ("products"."uqc" in ('NOS','PCS','PRS','SET','PAC','BOX','KGS','GMS','LTR','MLT','MTR'));--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_gst_bps" CHECK ("products"."gst_bps" is null or "products"."gst_bps" in (0, 300, 500, 1800, 4000));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_seller_scheme" CHECK ("orders"."seller_scheme" is null or "orders"."seller_scheme" in ('regular','composition'));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_gstin" CHECK ("orders"."buyer_gstin" is null or "orders"."buyer_gstin" ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$');--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_name" CHECK (length("orders"."buyer_name") <= 120);--> statement-breakpoint
-- =============================================================================
-- GST IN THE CORE, phase 1 (plan docs/plans/2026-11-09-gst-core-and-categories.md). Hand-written below.
-- New columns on existing tables inherit their grants (frata_app under RLS; frata_admin reads shop_settings
-- table-wide, ADR-0007: the scheme, state, band and filing columns are shop facts Admin may read).
--
-- Backfill BEFORE checkout stops falling back to the shop's default HSN (architecture review 2026-11-09, finding 5):
-- every product with no HSN takes the shop's default, exactly the code checkout used for it until now, so no live
-- product stops being buyable and nothing anyone was charged changes. Idempotent (only rows still null).
-- =============================================================================
update products p set hsn = s.default_hsn from shop_settings s where s.tenant_id = p.tenant_id and p.hsn is null;
--> statement-breakpoint
-- Orders placed while registered charged GST on the regular scheme (composition didn't exist in Frrata before).
update orders set seller_scheme = 'regular' where seller_gstin is not null and seller_scheme is null;
--> statement-breakpoint
-- The shop's state from its GSTIN, where it has one.
update shop_settings set home_state = left(gstin, 2) where gstin is not null and home_state is null;
--> statement-breakpoint
-- A business buyer's GSTIN and name are particulars of an issued invoice: fixed once the number is issued (tenancy
-- audit 2026-11-09). Erasing an abandoned order (never invoiced) still clears them.
create or replace function app_buyer_fixed() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.invoice_number is not null and (new.buyer_gstin is distinct from old.buyer_gstin or new.buyer_name is distinct from old.buyer_name) then
    raise exception 'the buyer on invoice % is issued and cannot change', old.invoice_number using errcode = 'check_violation';
  end if;
  return new;
end $$;
--> statement-breakpoint
revoke all on function app_buyer_fixed() from public, anon, authenticated, service_role;
--> statement-breakpoint
create trigger orders_buyer_fixed before update of buyer_gstin, buyer_name on orders for each row execute function app_buyer_fixed();
