CREATE TABLE "product_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"base" text NOT NULL,
	"widths" integer[] NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"option_value" text,
	"alt" text DEFAULT '' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_images_dims" CHECK ("product_images"."width" > 0 and "product_images"."height" > 0)
);
--> statement-breakpoint
CREATE TABLE "product_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"size_chart" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_types_tenant_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "product_types_name" CHECK (length("product_types"."name") between 1 and 60)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"handle" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"type_id" uuid,
	"options" text[] DEFAULT '{}'::text[] NOT NULL,
	"option_values" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model_height" text DEFAULT '' NOT NULL,
	"model_size" text DEFAULT '' NOT NULL,
	"origin_country" text,
	"hsn" text,
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_tenant_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "products_options" CHECK (cardinality("products"."options") <= 3),
	CONSTRAINT "products_handle" CHECK ("products"."handle" ~ '^[a-z0-9]([a-z0-9-]{0,98}[a-z0-9])?$'),
	CONSTRAINT "products_title" CHECK (length("products"."title") between 1 and 140)
);
--> statement-breakpoint
CREATE TABLE "variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"option_values" text[] DEFAULT '{}'::text[] NOT NULL,
	"sku" text,
	"price" bigint NOT NULL,
	"compare_at" bigint,
	"unit_cost" bigint,
	"stock" integer DEFAULT 0 NOT NULL,
	"weight_grams" integer,
	"position" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "variants_tenant_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "variants_money" CHECK ("variants"."price" >= 0 and ("variants"."compare_at" is null or "variants"."compare_at" >= 0) and ("variants"."unit_cost" is null or "variants"."unit_cost" >= 0)),
	CONSTRAINT "variants_stock" CHECK ("variants"."stock" >= 0)
);
--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_fk" FOREIGN KEY ("tenant_id","product_id") REFERENCES "public"."products"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_types" ADD CONSTRAINT "product_types_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_type_fk" FOREIGN KEY ("tenant_id","type_id") REFERENCES "public"."product_types"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variants" ADD CONSTRAINT "variants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variants" ADD CONSTRAINT "variants_product_fk" FOREIGN KEY ("tenant_id","product_id") REFERENCES "public"."products"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_images_product" ON "product_images" USING btree ("tenant_id","product_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "product_types_tenant_name" ON "product_types" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "products_tenant_handle" ON "products" USING btree ("tenant_id","handle");--> statement-breakpoint
CREATE INDEX "products_tenant_updated" ON "products" USING btree ("tenant_id","updated_at");--> statement-breakpoint
CREATE INDEX "products_type" ON "products" USING btree ("tenant_id","type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "variants_product_options" ON "variants" USING btree ("product_id","option_values");--> statement-breakpoint
CREATE UNIQUE INDEX "variants_tenant_sku" ON "variants" USING btree ("tenant_id","sku") WHERE "variants"."sku" is not null;--> statement-breakpoint
CREATE INDEX "variants_tenant_product" ON "variants" USING btree ("tenant_id","product_id");