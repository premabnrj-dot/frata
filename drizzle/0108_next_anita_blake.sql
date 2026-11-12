-- Owner, 2026-11-12: a returned item isn't billable. A billed order's fee can now be given back in parts: kind
-- 'outcome' (it came back or was lost: once per order, ever) or 'return' (items returned on a credit note after billing:
-- at most once per order per invoice). Column first, then the key that uses it (drizzle-kit wrote them the other way).
ALTER TABLE "frrata_fee_credits" ADD COLUMN "kind" text DEFAULT 'outcome' NOT NULL;--> statement-breakpoint
ALTER TABLE "frrata_fee_credits" DROP CONSTRAINT "frrata_fee_credits_order";--> statement-breakpoint
ALTER TABLE "frrata_fee_credits" ADD CONSTRAINT "frrata_fee_credits_pk" PRIMARY KEY("invoice_id","order_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "frrata_fee_credits_outcome_once" ON "frrata_fee_credits" USING btree ("order_id") WHERE "frrata_fee_credits"."kind" = 'outcome';--> statement-breakpoint
ALTER TABLE "frrata_fee_credits" ADD CONSTRAINT "frrata_fee_credits_kind" CHECK ("frrata_fee_credits"."kind" in ('outcome', 'return'));
