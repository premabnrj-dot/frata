DROP INDEX "variants_product_options";--> statement-breakpoint
CREATE UNIQUE INDEX "product_images_tenant_base" ON "product_images" USING btree ("tenant_id","base");--> statement-breakpoint
CREATE UNIQUE INDEX "variants_tenant_product_options" ON "variants" USING btree ("tenant_id","product_id","option_values");