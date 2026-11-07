ALTER TABLE "orders" ADD COLUMN "seller_name" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "seller_address" text;--> statement-breakpoint
-- Orders packed before this: their seller as Settings says now (the nearest record there is), once. Idempotent;
-- re-run after the push for orders packed in between (frata-architecture § deploy order for additive migrations).
update "orders" o set "seller_name" = coalesce(nullif(s."legal_name", ''), t."name"), "seller_address" = s."address"
  from "shop_settings" s join "tenants" t on t."id" = s."tenant_id"
 where s."tenant_id" = o."tenant_id" and o."packed_at" is not null and o."seller_name" is null;
