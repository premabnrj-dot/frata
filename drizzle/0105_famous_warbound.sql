ALTER TABLE "tenant_counters" DROP CONSTRAINT "tenant_counters_kind";--> statement-breakpoint
ALTER TABLE "credit_note_lines" ADD COLUMN "restocked_qty" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_counters" ADD CONSTRAINT "tenant_counters_kind" CHECK ("tenant_counters"."kind" in ('order','invoice','bill','credit','goodwill'));--> statement-breakpoint
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_restocked" CHECK ("credit_note_lines"."restocked_qty" >= 0 and "credit_note_lines"."restocked_qty" <= "credit_note_lines"."qty");