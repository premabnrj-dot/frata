CREATE TABLE "import_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"file_hash" text,
	"update" boolean DEFAULT false NOT NULL,
	"source" text NOT NULL,
	"mapping" jsonb NOT NULL,
	"chunks" integer NOT NULL,
	"next_chunk" integer DEFAULT 0 NOT NULL,
	"planned" integer NOT NULL,
	"added" integer DEFAULT 0 NOT NULL,
	"left_out" integer DEFAULT 0 NOT NULL,
	"in_shop" integer DEFAULT 0 NOT NULL,
	"started_by" uuid NOT NULL,
	"started_by_email" text,
	"support_session_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"drafts_deleted_at" timestamp with time zone,
	CONSTRAINT "import_jobs_tenant_id" UNIQUE("tenant_id","id"),
	CONSTRAINT "import_jobs_file" UNIQUE("tenant_id","file_hash","update"),
	CONSTRAINT "import_jobs_source" CHECK ("import_jobs"."source" in ('shopify','woocommerce','sheet')),
	CONSTRAINT "import_jobs_file_name" CHECK (length("import_jobs"."file_name") between 1 and 200),
	CONSTRAINT "import_jobs_hash" CHECK ("import_jobs"."file_hash" is null or "import_jobs"."file_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "import_jobs_mapping" CHECK (jsonb_typeof("import_jobs"."mapping") = 'object' and octet_length("import_jobs"."mapping"::text) <= 32768),
	CONSTRAINT "import_jobs_chunks" CHECK ("import_jobs"."chunks" between 1 and 1000 and "import_jobs"."next_chunk" between 0 and "import_jobs"."chunks"),
	CONSTRAINT "import_jobs_counts" CHECK ("import_jobs"."planned" between 0 and 600 and "import_jobs"."added" >= 0 and "import_jobs"."left_out" >= 0 and "import_jobs"."in_shop" >= 0),
	CONSTRAINT "import_jobs_finished" CHECK ("import_jobs"."finished_at" is not null or "import_jobs"."drafts_deleted_at" is null)
);
--> statement-breakpoint
CREATE TABLE "import_rows" (
	"tenant_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"n" integer NOT NULL,
	"key" text NOT NULL,
	"cells" text[],
	"errors" jsonb,
	"product_id" uuid,
	CONSTRAINT "import_rows_tenant_id_job_id_n_pk" PRIMARY KEY("tenant_id","job_id","n"),
	CONSTRAINT "import_rows_n" CHECK ("import_rows"."n" between 2 and 100000),
	CONSTRAINT "import_rows_key_size" CHECK (length("import_rows"."key") between 1 and 300),
	CONSTRAINT "import_rows_cells" CHECK ("import_rows"."cells" is null or cardinality("import_rows"."cells") <= 100),
	CONSTRAINT "import_rows_errors" CHECK ("import_rows"."errors" is null or (jsonb_typeof("import_rows"."errors") = 'array' and octet_length("import_rows"."errors"::text) <= 4096))
);
--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_support_session_id_support_sessions_id_fk" FOREIGN KEY ("support_session_id") REFERENCES "public"."support_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_job_fk" FOREIGN KEY ("tenant_id","job_id") REFERENCES "public"."import_jobs"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "import_jobs_one_running" ON "import_jobs" USING btree ("tenant_id") WHERE "import_jobs"."finished_at" is null;--> statement-breakpoint
CREATE INDEX "import_jobs_tenant_created" ON "import_jobs" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "import_rows_key" ON "import_rows" USING btree ("tenant_id","job_id","key");--> statement-breakpoint
CREATE INDEX "import_rows_product" ON "import_rows" USING btree ("tenant_id","product_id") WHERE "import_rows"."product_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "variants_tenant_sku_upper" ON "variants" USING btree ("tenant_id",upper("sku")) WHERE "variants"."sku" is not null;--> statement-breakpoint
-- =============================================================================
-- PRODUCT IMPORT PI·1 · 5 (docs/plans/2026-11-12-product-import.md). Hand-written below.
--
-- variants_tenant_sku_upper (above): the app treats SKUs case-blind (writeProducts); this makes the database agree, so
--   two saves at once can't store KS-1 and ks-1. It fails to build where a shop already has such a pair: before
--   applying, `select tenant_id, upper(sku), count(*) from variants where sku is not null group by 1, 2 having count(*) > 1`
--   must return nothing (frata_proof: nothing, 2026-11-12).
-- import_jobs, import_rows: the shop's own rows both ways (ADR-0002). A row's job and its product are the shop's own
--   by composite keys, so the database refuses another shop's id (tenancy.sql § 72). A deleted draft leaves its rows
--   with no product (SET NULL on product_id only). The app never deletes a job or a row, never moves one to another
--   shop, never changes a job's file, mapping or who started it; it updates only progress, the end, and a row's cells
--   (nulled when the job ends: they hold costs).
-- frata_admin: none. anon, authenticated, service_role: none (Supabase grants new objects to them by default).
-- =============================================================================
alter table import_rows add constraint import_rows_product_fk foreign key (tenant_id, product_id) references products (tenant_id, id) on delete set null (product_id);
--> statement-breakpoint
revoke all on import_jobs, import_rows from anon, authenticated, service_role;
--> statement-breakpoint
alter table import_jobs enable row level security;
--> statement-breakpoint
alter table import_rows enable row level security;
--> statement-breakpoint
grant select, insert on import_jobs, import_rows to frata_app;
--> statement-breakpoint
grant update (file_hash, next_chunk, added, left_out, in_shop, updated_at, finished_at, drafts_deleted_at) on import_jobs to frata_app;
--> statement-breakpoint
grant update (cells) on import_rows to frata_app;
--> statement-breakpoint
create policy tenant_rows on import_jobs for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint
create policy tenant_rows on import_rows for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());