CREATE TABLE "collection_handle_history" (
	"tenant_id" uuid NOT NULL,
	"handle" text NOT NULL,
	"collection_id" uuid NOT NULL,
	"retired_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_handle_history_tenant_id_handle_pk" PRIMARY KEY("tenant_id","handle")
);
--> statement-breakpoint
ALTER TABLE "collections" ADD COLUMN "seo_title" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "collections" ADD COLUMN "seo_description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "collection_handle_history" ADD CONSTRAINT "collection_handle_history_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_handle_history" ADD CONSTRAINT "collection_handle_history_collection_fk" FOREIGN KEY ("tenant_id","collection_id") REFERENCES "public"."collections"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "collection_handle_history_collection" ON "collection_handle_history" USING btree ("tenant_id","collection_id");--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_seo" CHECK (length("collections"."seo_title") <= 200 and length("collections"."seo_description") <= 400);--> statement-breakpoint
-- Access (ADR-0002): frata_app reads and appends; an old address is never re-pointed or removed (only by its collection's delete).
revoke all on collection_handle_history from anon, authenticated;--> statement-breakpoint
alter table collection_handle_history enable row level security;--> statement-breakpoint
grant select, insert on collection_handle_history to frata_app;--> statement-breakpoint
create policy tenant_rows on collection_handle_history for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
