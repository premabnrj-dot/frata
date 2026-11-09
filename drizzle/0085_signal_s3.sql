CREATE TABLE "product_pairs" (
	"tenant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"paired_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "product_pairs_tenant_id_product_id_paired_id_pk" PRIMARY KEY("tenant_id","product_id","paired_id"),
	CONSTRAINT "product_pairs_not_self" CHECK ("product_pairs"."product_id" <> "product_pairs"."paired_id"),
	CONSTRAINT "product_pairs_position" CHECK ("product_pairs"."position" between 0 and 1)
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "stories" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "product_pairs" ADD CONSTRAINT "product_pairs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_pairs" ADD CONSTRAINT "product_pairs_product_fk" FOREIGN KEY ("tenant_id","product_id") REFERENCES "public"."products"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_pairs" ADD CONSTRAINT "product_pairs_paired_fk" FOREIGN KEY ("tenant_id","paired_id") REFERENCES "public"."products"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_stories" CHECK (jsonb_typeof("products"."stories") = 'array' and jsonb_array_length("products"."stories") <= 6 and octet_length("products"."stories"::text) < 16384);--> statement-breakpoint
-- Signal S3 (docs/plans/2026-11-09-signal-s3.md): a product's pairings are the shop's own rows (ADR-0002); the
-- composite FKs refuse another shop's product, so tenancy.sql can prove it at the database.
revoke all on product_pairs from anon, authenticated, service_role;
--> statement-breakpoint
alter table product_pairs enable row level security;
--> statement-breakpoint
grant select, insert, update, delete on product_pairs to frata_app;
--> statement-breakpoint
create policy tenant_rows on product_pairs for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
