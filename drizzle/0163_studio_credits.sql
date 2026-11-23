-- The partner tables' (partner_id, id) keys first: the foreign keys below carry the partner (tenancy H2).
ALTER TABLE "partner_links" ADD CONSTRAINT "partner_links_partner_id_key" UNIQUE("partner_id","id");--> statement-breakpoint
ALTER TABLE "partner_members" ADD CONSTRAINT "partner_members_partner_id_key" UNIQUE("partner_id","id");--> statement-breakpoint
CREATE TABLE "fx_rates" (
	"day" date PRIMARY KEY NOT NULL,
	"rate_e4" integer NOT NULL,
	"source" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fx_rates_rate" CHECK ("fx_rates"."rate_e4" between 500000 and 2000000),
	CONSTRAINT "fx_rates_source" CHECK ("fx_rates"."source" in ('fbil','frankfurter_fbil','manual'))
);
--> statement-breakpoint
CREATE TABLE "partner_billing" (
	"partner_id" uuid PRIMARY KEY NOT NULL,
	"legal_name" text,
	"gstin" text,
	"pan" text,
	"state_code" text,
	"address" text,
	"invoice_email" text,
	"details_at" timestamp with time zone,
	"alert_low" boolean DEFAULT true NOT NULL,
	"alert_budget" boolean DEFAULT true NOT NULL,
	"new_site_budget" integer DEFAULT 300 NOT NULL,
	"low_alerted_at" timestamp with time zone,
	"customer_id" text,
	"token_id" text,
	"mandate_method" text,
	"mandate_max" bigint,
	"mandate_at" timestamp with time zone,
	"mandate_revoked_at" timestamp with time zone,
	"cancel_token_id" text,
	"token_cancel_due_at" timestamp with time zone,
	"token_cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_billing_name" CHECK ("partner_billing"."legal_name" is null or length("partner_billing"."legal_name") between 1 and 120),
	CONSTRAINT "partner_billing_gstin" CHECK ("partner_billing"."gstin" is null or "partner_billing"."gstin" ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
	CONSTRAINT "partner_billing_pan_shape" CHECK ("partner_billing"."pan" is null or "partner_billing"."pan" ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
	CONSTRAINT "partner_billing_state" CHECK ("partner_billing"."state_code" is null or "partner_billing"."state_code" ~ '^[0-9]{2}$'),
	CONSTRAINT "partner_billing_address" CHECK ("partner_billing"."address" is null or length("partner_billing"."address") between 1 and 300),
	CONSTRAINT "partner_billing_email" CHECK ("partner_billing"."invoice_email" is null or (length("partner_billing"."invoice_email") <= 254 and "partner_billing"."invoice_email" ~ '^[^@\s]+@[^@\s]+$')),
	CONSTRAINT "partner_billing_site_budget" CHECK ("partner_billing"."new_site_budget" between 1 and 100000),
	CONSTRAINT "partner_billing_method" CHECK ("partner_billing"."mandate_method" is null or "partner_billing"."mandate_method" in ('upi','card')),
	CONSTRAINT "partner_billing_mandate" CHECK (("partner_billing"."token_id" is null) = ("partner_billing"."mandate_method" is null))
);
--> statement-breakpoint
CREATE TABLE "partner_client_budgets" (
	"partner_id" uuid NOT NULL,
	"link_id" uuid NOT NULL,
	"credits" integer NOT NULL,
	"set_by" uuid NOT NULL,
	"set_at" timestamp with time zone DEFAULT now() NOT NULL,
	"warned_at" timestamp with time zone,
	CONSTRAINT "partner_client_budgets_partner_id_link_id_pk" PRIMARY KEY("partner_id","link_id"),
	CONSTRAINT "partner_client_budgets_credits" CHECK ("partner_client_budgets"."credits" between 1 and 100000)
);
--> statement-breakpoint
CREATE TABLE "partner_credit_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"credits" integer NOT NULL,
	"lot_id" uuid,
	"use_id" uuid,
	"purchase_id" uuid,
	"expires_at" timestamp with time zone,
	"test" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_credit_entries_partner_id_key" UNIQUE("partner_id","id"),
	CONSTRAINT "partner_credit_entries_kind" CHECK ("partner_credit_entries"."kind" in ('grant','pack','credits','seat','return','reserve','release','void','clawback')),
	CONSTRAINT "partner_credit_entries_lot" CHECK (("partner_credit_entries"."kind" in ('grant','pack','credits','seat','return')) = ("partner_credit_entries"."lot_id" is null)
    and ("partner_credit_entries"."kind" in ('grant','pack','credits','seat','return')) = ("partner_credit_entries"."expires_at" is not null)),
	CONSTRAINT "partner_credit_entries_sign" CHECK (case when "partner_credit_entries"."kind" in ('grant','pack','credits','seat','return') or "partner_credit_entries"."kind" = 'release' then "partner_credit_entries"."credits" > 0 else "partner_credit_entries"."credits" < 0 end),
	CONSTRAINT "partner_credit_entries_use" CHECK (case when "partner_credit_entries"."kind" in ('reserve','release') then "partner_credit_entries"."use_id" is not null when "partner_credit_entries"."kind" = 'return' then true else "partner_credit_entries"."use_id" is null end),
	CONSTRAINT "partner_credit_entries_bought" CHECK (("partner_credit_entries"."kind" in ('pack','credits','seat')) = ("partner_credit_entries"."purchase_id" is not null) or "partner_credit_entries"."kind" = 'clawback'),
	CONSTRAINT "partner_credit_entries_draw" CHECK ("partner_credit_entries"."kind" not in ('reserve','release','void','clawback') or not "partner_credit_entries"."test")
);
--> statement-breakpoint
CREATE TABLE "partner_credit_notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"link_id" uuid,
	"purchase_id" uuid,
	"dedupe" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"tries" smallint DEFAULT 0 NOT NULL,
	"failed_at" timestamp with time zone,
	"error" text,
	CONSTRAINT "partner_credit_notices_kind" CHECK ("partner_credit_notices"."kind" in ('low','budget_80','predebit','renewal_failed','paid','details_changed','lapsed')),
	CONSTRAINT "partner_credit_notices_error" CHECK ("partner_credit_notices"."error" is null or length("partner_credit_notices"."error") <= 40)
);
--> statement-breakpoint
CREATE TABLE "partner_credit_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"credits" integer NOT NULL,
	"plan" text,
	"seat_id" uuid,
	"for_period_end" timestamp with time zone,
	"attempt" smallint DEFAULT 1 NOT NULL,
	"method" text,
	"mandate_max" bigint,
	"taxable" bigint NOT NULL,
	"cgst" bigint NOT NULL,
	"sgst" bigint NOT NULL,
	"igst" bigint NOT NULL,
	"total" bigint NOT NULL,
	"test" boolean NOT NULL,
	"invoice_test" boolean NOT NULL,
	"buyer_name" text NOT NULL,
	"buyer_gstin" text,
	"buyer_state" text NOT NULL,
	"buyer_address" text NOT NULL,
	"seller_name" text NOT NULL,
	"seller_gstin" text,
	"seller_address" text NOT NULL,
	"sac" text NOT NULL,
	"prefix" text NOT NULL,
	"fy" text NOT NULL,
	"receipt" text NOT NULL,
	"gateway_order_id" text,
	"payment_id" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"notice_queued_at" timestamp with time zone,
	"notice_sent_at" timestamp with time zone,
	"debit_after" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"failed_reason" text,
	"closed_at" timestamp with time zone,
	"closed_reason" text,
	"refund_due_at" timestamp with time zone,
	"refund_payment_id" text,
	"refund_amount" bigint,
	"refund_claimed_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"refund_gateway_id" text,
	"disputed_at" timestamp with time zone,
	CONSTRAINT "partner_credit_purchases_partner_id_key" UNIQUE("partner_id","id"),
	CONSTRAINT "partner_credit_purchases_kind" CHECK ("partner_credit_purchases"."kind" in ('pack','credits','seat_start','seat_renewal')),
	CONSTRAINT "partner_credit_purchases_seat" CHECK (("partner_credit_purchases"."kind" in ('seat_start','seat_renewal')) = ("partner_credit_purchases"."plan" is not null and "partner_credit_purchases"."method" is not null and "partner_credit_purchases"."mandate_max" is not null)),
	CONSTRAINT "partner_credit_purchases_renewal" CHECK (("partner_credit_purchases"."kind" = 'seat_renewal') = ("partner_credit_purchases"."seat_id" is not null and "partner_credit_purchases"."for_period_end" is not null)),
	CONSTRAINT "partner_credit_purchases_credits" CHECK ("partner_credit_purchases"."credits" between 1 and 4000),
	CONSTRAINT "partner_credit_purchases_money" CHECK ("partner_credit_purchases"."taxable" > 0 and "partner_credit_purchases"."cgst" >= 0 and "partner_credit_purchases"."sgst" >= 0 and "partner_credit_purchases"."igst" >= 0 and "partner_credit_purchases"."total" = "partner_credit_purchases"."taxable" + "partner_credit_purchases"."cgst" + "partner_credit_purchases"."sgst" + "partner_credit_purchases"."igst"),
	CONSTRAINT "partner_credit_purchases_once" CHECK (num_nonnulls("partner_credit_purchases"."paid_at", "partner_credit_purchases"."failed_at", "partner_credit_purchases"."closed_at") <= 1),
	CONSTRAINT "partner_credit_purchases_reason" CHECK (("partner_credit_purchases"."failed_reason" is null or length("partner_credit_purchases"."failed_reason") <= 160) and ("partner_credit_purchases"."closed_reason" is null or length("partner_credit_purchases"."closed_reason") <= 80))
);
--> statement-breakpoint
CREATE TABLE "partner_credit_tries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_credit_tries_kind" CHECK ("partner_credit_tries"."kind" in ('buy','confirm','budget','details','alerts','seat','pdf','csv'))
);
--> statement-breakpoint
CREATE TABLE "partner_credit_uses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"link_id" uuid NOT NULL,
	"member_id" uuid,
	"kind" text NOT NULL,
	"what" text NOT NULL,
	"reserved" integer NOT NULL,
	"estimate" integer,
	"real_money" boolean NOT NULL,
	"list_micro" bigint,
	"rate_e4" integer,
	"loading_bp" integer DEFAULT 11000 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"returned_at" timestamp with time zone,
	"return_reason" text,
	CONSTRAINT "partner_credit_uses_partner_id_key" UNIQUE("partner_id","id"),
	CONSTRAINT "partner_credit_uses_kind" CHECK ("partner_credit_uses"."kind" in ('preview','turn') and "partner_credit_uses"."what" in ('start','looks','home','collection','product','page','edit','fix','preview','logo')),
	CONSTRAINT "partner_credit_uses_reserved" CHECK ("partner_credit_uses"."reserved" between 1 and 120),
	CONSTRAINT "partner_credit_uses_cost" CHECK (("partner_credit_uses"."list_micro" is null or "partner_credit_uses"."list_micro" >= 0) and ("partner_credit_uses"."rate_e4" is null or "partner_credit_uses"."rate_e4" > 0)),
	CONSTRAINT "partner_credit_uses_return" CHECK (("partner_credit_uses"."returned_at" is null or "partner_credit_uses"."closed_at" is not null) and (("partner_credit_uses"."returned_at" is null) = ("partner_credit_uses"."return_reason" is null))
    and ("partner_credit_uses"."return_reason" is null or "partner_credit_uses"."return_reason" in ('frrata','timeout','cancelled')))
);
--> statement-breakpoint
CREATE TABLE "partner_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"purchase_id" uuid NOT NULL,
	"number" text NOT NULL,
	"test" boolean NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"buyer_name" text NOT NULL,
	"buyer_gstin" text,
	"buyer_state" text NOT NULL,
	"buyer_address" text NOT NULL,
	"place_of_supply" text NOT NULL,
	"seller_name" text NOT NULL,
	"seller_gstin" text,
	"seller_address" text NOT NULL,
	"sac" text NOT NULL,
	"kind" text NOT NULL,
	"plan" text,
	"credits" integer NOT NULL,
	"taxable" bigint NOT NULL,
	"cgst" bigint NOT NULL,
	"sgst" bigint NOT NULL,
	"igst" bigint NOT NULL,
	"total" bigint NOT NULL,
	CONSTRAINT "partner_invoices_partner_id_key" UNIQUE("partner_id","id"),
	CONSTRAINT "partner_invoices_money" CHECK ("partner_invoices"."total" = "partner_invoices"."taxable" + "partner_invoices"."cgst" + "partner_invoices"."sgst" + "partner_invoices"."igst")
);
--> statement-breakpoint
CREATE TABLE "partner_seats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"plan" text NOT NULL,
	"next_plan" text,
	"method" text NOT NULL,
	"test" boolean NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"cancel_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_seats_partner_id_key" UNIQUE("partner_id","id"),
	CONSTRAINT "partner_seats_plan" CHECK ("partner_seats"."plan" in ('studio','plus') and ("partner_seats"."next_plan" is null or "partner_seats"."next_plan" in ('studio','plus'))),
	CONSTRAINT "partner_seats_method" CHECK ("partner_seats"."method" in ('upi','card'))
);
--> statement-breakpoint
ALTER TABLE "partner_billing" ADD CONSTRAINT "partner_billing_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_client_budgets" ADD CONSTRAINT "partner_client_budgets_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_client_budgets" ADD CONSTRAINT "partner_client_budgets_link_fk" FOREIGN KEY ("partner_id","link_id") REFERENCES "public"."partner_links"("partner_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_client_budgets" ADD CONSTRAINT "partner_client_budgets_member_fk" FOREIGN KEY ("partner_id","set_by") REFERENCES "public"."partner_members"("partner_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_credit_entries" ADD CONSTRAINT "partner_credit_entries_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_credit_entries" ADD CONSTRAINT "partner_credit_entries_lot_fk" FOREIGN KEY ("partner_id","lot_id") REFERENCES "public"."partner_credit_entries"("partner_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_credit_entries" ADD CONSTRAINT "partner_credit_entries_use_fk" FOREIGN KEY ("partner_id","use_id") REFERENCES "public"."partner_credit_uses"("partner_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_credit_entries" ADD CONSTRAINT "partner_credit_entries_purchase_fk" FOREIGN KEY ("partner_id","purchase_id") REFERENCES "public"."partner_credit_purchases"("partner_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_credit_notices" ADD CONSTRAINT "partner_credit_notices_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_credit_notices" ADD CONSTRAINT "partner_credit_notices_purchase_fk" FOREIGN KEY ("partner_id","purchase_id") REFERENCES "public"."partner_credit_purchases"("partner_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_credit_purchases" ADD CONSTRAINT "partner_credit_purchases_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_credit_purchases" ADD CONSTRAINT "partner_credit_purchases_seat_fk" FOREIGN KEY ("partner_id","seat_id") REFERENCES "public"."partner_seats"("partner_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_credit_uses" ADD CONSTRAINT "partner_credit_uses_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_credit_uses" ADD CONSTRAINT "partner_credit_uses_link_fk" FOREIGN KEY ("partner_id","link_id") REFERENCES "public"."partner_links"("partner_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_credit_uses" ADD CONSTRAINT "partner_credit_uses_member_fk" FOREIGN KEY ("partner_id","member_id") REFERENCES "public"."partner_members"("partner_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_invoices" ADD CONSTRAINT "partner_invoices_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_invoices" ADD CONSTRAINT "partner_invoices_purchase_fk" FOREIGN KEY ("partner_id","purchase_id") REFERENCES "public"."partner_credit_purchases"("partner_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_seats" ADD CONSTRAINT "partner_seats_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "partner_billing_token" ON "partner_billing" USING btree ("token_id") WHERE "partner_billing"."token_id" is not null;--> statement-breakpoint
CREATE INDEX "partner_billing_pan" ON "partner_billing" USING btree ("pan") WHERE "partner_billing"."pan" is not null;--> statement-breakpoint
CREATE INDEX "partner_credit_entries_lots" ON "partner_credit_entries" USING btree ("partner_id","expires_at","id") WHERE "partner_credit_entries"."kind" in ('grant','pack','credits','seat','return');--> statement-breakpoint
CREATE INDEX "partner_credit_entries_use" ON "partner_credit_entries" USING btree ("use_id") WHERE "partner_credit_entries"."use_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "partner_credit_entries_one_grant" ON "partner_credit_entries" USING btree ("partner_id") WHERE "partner_credit_entries"."kind" = 'grant';--> statement-breakpoint
CREATE UNIQUE INDEX "partner_credit_entries_one_lot_a_purchase" ON "partner_credit_entries" USING btree ("purchase_id") WHERE "partner_credit_entries"."kind" in ('pack','credits','seat');--> statement-breakpoint
CREATE UNIQUE INDEX "partner_credit_notices_dedupe" ON "partner_credit_notices" USING btree ("dedupe");--> statement-breakpoint
CREATE INDEX "partner_credit_notices_due" ON "partner_credit_notices" USING btree ("created_at") WHERE "partner_credit_notices"."sent_at" is null and "partner_credit_notices"."failed_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "partner_credit_purchases_receipt" ON "partner_credit_purchases" USING btree ("receipt");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_credit_purchases_order" ON "partner_credit_purchases" USING btree ("gateway_order_id") WHERE "partner_credit_purchases"."gateway_order_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "partner_credit_purchases_payment" ON "partner_credit_purchases" USING btree ("payment_id") WHERE "partner_credit_purchases"."payment_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "partner_credit_purchases_one_open_seat" ON "partner_credit_purchases" USING btree ("seat_id") WHERE "partner_credit_purchases"."seat_id" is not null and "partner_credit_purchases"."paid_at" is null and "partner_credit_purchases"."failed_at" is null and "partner_credit_purchases"."closed_at" is null;--> statement-breakpoint
CREATE INDEX "partner_credit_purchases_partner" ON "partner_credit_purchases" USING btree ("partner_id","created_at");--> statement-breakpoint
CREATE INDEX "partner_credit_purchases_open" ON "partner_credit_purchases" USING btree ("created_at") WHERE "partner_credit_purchases"."paid_at" is null and "partner_credit_purchases"."failed_at" is null and "partner_credit_purchases"."closed_at" is null;--> statement-breakpoint
CREATE INDEX "partner_credit_purchases_refund" ON "partner_credit_purchases" USING btree ("refund_due_at") WHERE "partner_credit_purchases"."refund_due_at" is not null and "partner_credit_purchases"."refunded_at" is null;--> statement-breakpoint
CREATE INDEX "partner_credit_tries_user" ON "partner_credit_tries" USING btree ("user_id","kind","at");--> statement-breakpoint
CREATE INDEX "partner_credit_tries_at" ON "partner_credit_tries" USING btree ("at");--> statement-breakpoint
CREATE INDEX "partner_credit_uses_partner" ON "partner_credit_uses" USING btree ("partner_id","created_at","id");--> statement-breakpoint
CREATE INDEX "partner_credit_uses_open" ON "partner_credit_uses" USING btree ("partner_id") WHERE "partner_credit_uses"."closed_at" is null;--> statement-breakpoint
CREATE INDEX "partner_credit_uses_link" ON "partner_credit_uses" USING btree ("partner_id","link_id","created_at");--> statement-breakpoint
CREATE INDEX "partner_credit_uses_member" ON "partner_credit_uses" USING btree ("member_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_invoices_purchase" ON "partner_invoices" USING btree ("purchase_id");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_invoices_number" ON "partner_invoices" USING btree ("number");--> statement-breakpoint
CREATE INDEX "partner_invoices_partner" ON "partner_invoices" USING btree ("partner_id","issued_at");--> statement-breakpoint
CREATE INDEX "partner_invoices_issued" ON "partner_invoices" USING btree ("issued_at");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_seats_one_live" ON "partner_seats" USING btree ("partner_id") WHERE "partner_seats"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "partner_seats_due" ON "partner_seats" USING btree ("period_end") WHERE "partner_seats"."ended_at" is null;--> statement-breakpoint
--> statement-breakpoint
-- C1 Studio credits: no Frrata role reads these tables; the definers in 0164 are the only door (tenancy.sql § 89).
alter table partner_billing enable row level security;--> statement-breakpoint
alter table partner_seats enable row level security;--> statement-breakpoint
alter table partner_credit_purchases enable row level security;--> statement-breakpoint
alter table partner_invoices enable row level security;--> statement-breakpoint
alter table partner_credit_uses enable row level security;--> statement-breakpoint
alter table partner_credit_entries enable row level security;--> statement-breakpoint
alter table partner_client_budgets enable row level security;--> statement-breakpoint
alter table partner_credit_notices enable row level security;--> statement-breakpoint
alter table partner_credit_tries enable row level security;--> statement-breakpoint
alter table fx_rates enable row level security;--> statement-breakpoint
revoke all on partner_billing, partner_seats, partner_credit_purchases, partner_invoices, partner_credit_uses, partner_credit_entries,
  partner_client_budgets, partner_credit_notices, partner_credit_tries, fx_rates
  from public, anon, authenticated, service_role, frata_app, frata_admin, frata_builder;--> statement-breakpoint
create policy definer_only on partner_billing as restrictive for all to public using (false) with check (false);--> statement-breakpoint
create policy definer_only on partner_seats as restrictive for all to public using (false) with check (false);--> statement-breakpoint
create policy definer_only on partner_credit_purchases as restrictive for all to public using (false) with check (false);--> statement-breakpoint
create policy definer_only on partner_invoices as restrictive for all to public using (false) with check (false);--> statement-breakpoint
create policy definer_only on partner_credit_uses as restrictive for all to public using (false) with check (false);--> statement-breakpoint
create policy definer_only on partner_credit_entries as restrictive for all to public using (false) with check (false);--> statement-breakpoint
create policy definer_only on partner_client_budgets as restrictive for all to public using (false) with check (false);--> statement-breakpoint
create policy definer_only on partner_credit_notices as restrictive for all to public using (false) with check (false);--> statement-breakpoint
create policy definer_only on partner_credit_tries as restrictive for all to public using (false) with check (false);--> statement-breakpoint
create policy definer_only on fx_rates as restrictive for all to public using (false) with check (false);--> statement-breakpoint
-- Speed review (2026-11-22, measured at 10×): a lot's draws summed from the index alone (H-M1), and the platform's day
-- of list cost from the index alone (H1: 557 ms seq scan → 6–13 ms).
create index partner_credit_entries_draws on partner_credit_entries (lot_id) include (credits) where lot_id is not null;--> statement-breakpoint
create index partner_credit_uses_day on partner_credit_uses (created_at) include (list_micro, rate_e4, closed_at, reserved, loading_bp);--> statement-breakpoint
-- Speed review (2026-11-23, 10×): a disputed purchase's clawbacks (823 ms seq scan of the ledger in every balance read);
-- a seat's attempts in the renewals read (3.8 s for 100 seats); a use's give-backs for the charged sums (index-only).
create index partner_credit_entries_clawbacks on partner_credit_entries (purchase_id) include (credits, lot_id) where kind = 'clawback';--> statement-breakpoint
create index partner_credit_entries_use_back on partner_credit_entries (use_id) include (kind, credits) where use_id is not null;--> statement-breakpoint
create index partner_credit_purchases_seat on partner_credit_purchases (seat_id, for_period_end) where seat_id is not null;--> statement-breakpoint
-- A notice names a link of its own partner only (impact review: every cross-reference carries the partner).
alter table partner_credit_notices add constraint partner_credit_notices_link_fk foreign key (partner_id, link_id) references partner_links (partner_id, id) on delete restrict;
