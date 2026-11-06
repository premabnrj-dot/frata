CREATE TABLE "collection_products" (
	"tenant_id" uuid NOT NULL,
	"collection_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "collection_products_tenant_id_collection_id_product_id_pk" PRIMARY KEY("tenant_id","collection_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"handle" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"kind" text NOT NULL,
	"match_all" integer DEFAULT 1 NOT NULL,
	"rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort" text DEFAULT 'newest' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collections_tenant_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "collections_kind" CHECK ("collections"."kind" in ('manual','auto')),
	CONSTRAINT "collections_sort" CHECK ("collections"."sort" in ('manual','newest','price_low','price_high','title')),
	CONSTRAINT "collections_title" CHECK (length("collections"."title") between 1 and 80),
	CONSTRAINT "collections_handle" CHECK ("collections"."handle" ~ '^[a-z0-9]([a-z0-9-]{0,78}[a-z0-9])?$')
);
--> statement-breakpoint
CREATE TABLE "product_attributes" (
	"tenant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"attribute" text NOT NULL,
	"values" text[] NOT NULL,
	CONSTRAINT "product_attributes_tenant_id_product_id_attribute_pk" PRIMARY KEY("tenant_id","product_id","attribute"),
	CONSTRAINT "product_attributes_values" CHECK (cardinality("product_attributes"."values") between 1 and 20)
);
--> statement-breakpoint
CREATE TABLE "product_colours" (
	"tenant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"value" text NOT NULL,
	"family" text,
	"hex" text,
	"crop_image_id" uuid,
	"crop" jsonb,
	CONSTRAINT "product_colours_tenant_id_product_id_value_pk" PRIMARY KEY("tenant_id","product_id","value"),
	CONSTRAINT "product_colours_hex" CHECK ("product_colours"."hex" is null or "product_colours"."hex" ~ '^#[0-9a-f]{6}$')
);
--> statement-breakpoint
CREATE TABLE "product_handle_history" (
	"tenant_id" uuid NOT NULL,
	"handle" text NOT NULL,
	"product_id" uuid NOT NULL,
	"retired_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_handle_history_tenant_id_handle_pk" PRIMARY KEY("tenant_id","handle")
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "status" text DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "publish_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "taxonomy_category" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "seo_title" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "seo_description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "variants" ADD COLUMN "when_out" text DEFAULT 'stop' NOT NULL;--> statement-breakpoint
ALTER TABLE "variants" ADD COLUMN "ships_by" date;--> statement-breakpoint
ALTER TABLE "variants" ADD COLUMN "lead_min_days" integer;--> statement-breakpoint
ALTER TABLE "variants" ADD COLUMN "lead_max_days" integer;--> statement-breakpoint
ALTER TABLE "variants" ADD COLUMN "preorder_cap" integer;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_tenant_id_key" UNIQUE("tenant_id","id");--> statement-breakpoint
ALTER TABLE "collection_products" ADD CONSTRAINT "collection_products_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_products" ADD CONSTRAINT "collection_products_collection_fk" FOREIGN KEY ("tenant_id","collection_id") REFERENCES "public"."collections"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_products" ADD CONSTRAINT "collection_products_product_fk" FOREIGN KEY ("tenant_id","product_id") REFERENCES "public"."products"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_attributes" ADD CONSTRAINT "product_attributes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_attributes" ADD CONSTRAINT "product_attributes_product_fk" FOREIGN KEY ("tenant_id","product_id") REFERENCES "public"."products"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_colours" ADD CONSTRAINT "product_colours_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_colours" ADD CONSTRAINT "product_colours_product_fk" FOREIGN KEY ("tenant_id","product_id") REFERENCES "public"."products"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_colours" ADD CONSTRAINT "product_colours_image_fk" FOREIGN KEY ("tenant_id","crop_image_id") REFERENCES "public"."product_images"("tenant_id","id") ON DELETE set null ("crop_image_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_handle_history" ADD CONSTRAINT "product_handle_history_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_handle_history" ADD CONSTRAINT "product_handle_history_product_fk" FOREIGN KEY ("tenant_id","product_id") REFERENCES "public"."products"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "collection_products_product" ON "collection_products" USING btree ("tenant_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "collections_tenant_handle" ON "collections" USING btree ("tenant_id","handle");--> statement-breakpoint
CREATE INDEX "product_handle_history_product" ON "product_handle_history" USING btree ("tenant_id","product_id");--> statement-breakpoint
CREATE INDEX "products_tenant_status" ON "products" USING btree ("tenant_id","status");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_status" CHECK ("products"."status" in ('draft','active','unlisted','archived'));--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_seo" CHECK (length("products"."seo_title") <= 200 and length("products"."seo_description") <= 400);--> statement-breakpoint
ALTER TABLE "variants" ADD CONSTRAINT "variants_when_out" CHECK ("variants"."when_out" in ('stop','preorder','made_to_order'));--> statement-breakpoint
ALTER TABLE "variants" ADD CONSTRAINT "variants_preorder" CHECK ("variants"."when_out" <> 'preorder' or "variants"."ships_by" is not null);--> statement-breakpoint
ALTER TABLE "variants" ADD CONSTRAINT "variants_lead" CHECK ("variants"."when_out" <> 'made_to_order' or ("variants"."lead_min_days" between 1 and 120 and "variants"."lead_max_days" between "variants"."lead_min_days" and 120));--> statement-breakpoint
ALTER TABLE "variants" ADD CONSTRAINT "variants_cap" CHECK ("variants"."preorder_cap" is null or "variants"."preorder_cap" >= 0);