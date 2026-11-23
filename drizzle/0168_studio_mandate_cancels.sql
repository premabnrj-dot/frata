CREATE TABLE "partner_mandate_cancels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"token_id" text NOT NULL,
	"due_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	"tries" smallint DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_mandate_cancels_token_shape" CHECK ("partner_mandate_cancels"."token_id" ~ '^token_[A-Za-z0-9]{6,40}$'),
	CONSTRAINT "partner_mandate_cancels_error" CHECK ("partner_mandate_cancels"."error" is null or length("partner_mandate_cancels"."error") <= 40)
);
--> statement-breakpoint
ALTER TABLE "partner_mandate_cancels" ADD CONSTRAINT "partner_mandate_cancels_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "partner_mandate_cancels_token" ON "partner_mandate_cancels" USING btree ("partner_id","token_id");--> statement-breakpoint
CREATE INDEX "partner_mandate_cancels_due" ON "partner_mandate_cancels" USING btree ("due_at") WHERE "partner_mandate_cancels"."cancelled_at" is null;--> statement-breakpoint
-- C1·B (security H2, M1): a pending cancel moves from the one slot on partner_billing into the queue before the slot goes.
insert into partner_mandate_cancels (partner_id, token_id, due_at)
  select b.partner_id, b.cancel_token_id, coalesce(b.token_cancel_due_at, now()) from partner_billing b
   where b.cancel_token_id is not null and b.token_cancelled_at is null and b.cancel_token_id ~ '^token_[A-Za-z0-9]{6,40}$'
  on conflict (partner_id, token_id) do nothing;--> statement-breakpoint
ALTER TABLE "partner_billing" DROP COLUMN "cancel_token_id";--> statement-breakpoint
ALTER TABLE "partner_billing" DROP COLUMN "token_cancel_due_at";--> statement-breakpoint
ALTER TABLE "partner_billing" DROP COLUMN "token_cancelled_at";--> statement-breakpoint
-- No Frrata role reads the queue; the definers in 0169 are the only door (tenancy.sql § 89).
alter table partner_mandate_cancels enable row level security;--> statement-breakpoint
revoke all on partner_mandate_cancels from public, anon, authenticated, service_role, frata_app, frata_admin, frata_builder;--> statement-breakpoint
create policy definer_only on partner_mandate_cancels as restrictive for all to public using (false) with check (false);
