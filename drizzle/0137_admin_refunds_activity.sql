DROP INDEX "audit_events_at";--> statement-breakpoint
ALTER TABLE "frrata_payments" ADD COLUMN "refund_amount" bigint;--> statement-breakpoint
ALTER TABLE "frrata_payments" ADD COLUMN "refund_utr" text;--> statement-breakpoint
ALTER TABLE "frrata_payments" ADD COLUMN "refunded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "frrata_payments" ADD COLUMN "refunded_by" uuid;--> statement-breakpoint
CREATE INDEX "audit_events_at_id" ON "audit_events" USING btree ("at","id");--> statement-breakpoint
CREATE INDEX "audit_events_actor_at" ON "audit_events" USING btree ("actor_user_id","at","id");--> statement-breakpoint
CREATE INDEX "audit_events_kind_at" ON "audit_events" USING btree (split_part("action", '.', 1),"at","id");--> statement-breakpoint
CREATE INDEX "partner_passkey_requests_open" ON "partner_passkey_requests" USING btree ("created_at") WHERE "partner_passkey_requests"."used_at" is null and "partner_passkey_requests"."declined_at" is null and "partner_passkey_requests"."approved_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "frrata_payments_refund_utr" ON "frrata_payments" USING btree (upper(btrim("refund_utr"))) WHERE "frrata_payments"."refund_utr" is not null;--> statement-breakpoint
CREATE INDEX "frrata_payments_to_refund" ON "frrata_payments" USING btree ("created_at") WHERE "frrata_payments"."over_paid" > 0 and "frrata_payments"."refunded_at" is null;--> statement-breakpoint
ALTER TABLE "frrata_payments" ADD CONSTRAINT "frrata_payments_refund_whole" CHECK (("frrata_payments"."refund_amount" is null) = ("frrata_payments"."refund_utr" is null) and ("frrata_payments"."refund_utr" is null) = ("frrata_payments"."refunded_at" is null) and ("frrata_payments"."refunded_at" is null) = ("frrata_payments"."refunded_by" is null));