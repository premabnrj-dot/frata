CREATE TABLE "credit_note_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"credit_note_id" uuid NOT NULL,
	"order_line_id" uuid NOT NULL,
	"qty" integer NOT NULL,
	"taxable" bigint NOT NULL,
	"gst" bigint NOT NULL,
	"gst_bps" integer NOT NULL,
	CONSTRAINT "credit_note_lines_money" CHECK ("credit_note_lines"."qty" >= 0 and "credit_note_lines"."taxable" >= 0 and "credit_note_lines"."gst" >= 0 and "credit_note_lines"."gst_bps" >= 0)
);
--> statement-breakpoint
ALTER TABLE "credit_notes" DROP CONSTRAINT "credit_notes_reason";--> statement-breakpoint
DROP INDEX "credit_notes_order";--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "kind" text DEFAULT 'reversal' NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_tenant_id_key" UNIQUE("tenant_id","id");--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_tenant_id_key" UNIQUE("tenant_id","id");--> statement-breakpoint
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_note_fk" FOREIGN KEY ("tenant_id","credit_note_id") REFERENCES "public"."credit_notes"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_line_fk" FOREIGN KEY ("tenant_id","order_line_id") REFERENCES "public"."order_lines"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_note_lines_note" ON "credit_note_lines" USING btree ("tenant_id","credit_note_id");--> statement-breakpoint
CREATE INDEX "credit_note_lines_line" ON "credit_note_lines" USING btree ("tenant_id","order_line_id");--> statement-breakpoint
CREATE INDEX "credit_notes_issued" ON "credit_notes" USING btree ("tenant_id","issued_at");--> statement-breakpoint
CREATE INDEX "credit_notes_order" ON "credit_notes" USING btree ("tenant_id","order_id");--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_kind" CHECK ("credit_notes"."kind" in ('reversal','return','discount','goodwill') and ("credit_notes"."kind" <> 'goodwill' or ("credit_notes"."cgst" = 0 and "credit_notes"."sgst" = 0 and "credit_notes"."igst" = 0)));--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_reason" CHECK ("credit_notes"."reason" in ('cancelled','came_back','returned','discount','goodwill'));--> statement-breakpoint
-- =============================================================================
-- GST PLAN PHASE 2: several credit notes per order (docs/plans/2026-11-09-gst-core-and-categories.md § 2). Hand-written.
-- credit_note_lines: the shop's own rows (frata_app under RLS), read and insert only, final once written like its note
-- (credit_note_final(), 0053). frata_admin and the API roles: nothing (tenancy audit 2026-11-09).
-- =============================================================================
revoke all on credit_note_lines from anon, authenticated, service_role;
--> statement-breakpoint
alter table credit_note_lines enable row level security;
--> statement-breakpoint
grant select, insert on credit_note_lines to frata_app;
--> statement-breakpoint
create policy tenant_rows on credit_note_lines for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint
create trigger credit_note_lines_final before update or delete on credit_note_lines for each row execute function credit_note_final();
--> statement-breakpoint
create trigger credit_note_lines_no_truncate before truncate on credit_note_lines for each statement execute function credit_note_final();
