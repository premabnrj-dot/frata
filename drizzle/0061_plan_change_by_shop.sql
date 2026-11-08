ALTER TABLE "frrata_invoice_lines" DROP CONSTRAINT "frrata_invoice_lines_kind";--> statement-breakpoint
ALTER TABLE "tenant_plans" ADD COLUMN "by_shop" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "frrata_invoice_lines" ADD CONSTRAINT "frrata_invoice_lines_kind" CHECK ("frrata_invoice_lines"."kind" in ('plan','addon','fee','over','credit','carry','change'));