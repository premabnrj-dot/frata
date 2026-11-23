CREATE TABLE "cost_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"vendor" text,
	"category" text NOT NULL,
	"kind" text NOT NULL,
	"cadence" text,
	"amount" bigint NOT NULL,
	"currency" text NOT NULL,
	"varies" boolean DEFAULT false NOT NULL,
	"anchor_on" date NOT NULL,
	"ends_on" date,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cost_items_kind" CHECK ("cost_items"."kind" in ('recurring', 'one_time')),
	CONSTRAINT "cost_items_cadence" CHECK ("cost_items"."cadence" is null or "cost_items"."cadence" in ('monthly', 'quarterly', 'yearly')),
	CONSTRAINT "cost_items_kind_cadence" CHECK (("cost_items"."kind" = 'recurring') = ("cost_items"."cadence" is not null)),
	CONSTRAINT "cost_items_currency" CHECK ("cost_items"."currency" in ('INR', 'USD')),
	CONSTRAINT "cost_items_category" CHECK ("cost_items"."category" in ('infrastructure', 'ai', 'messaging', 'software', 'marketing', 'legal', 'people', 'design', 'other')),
	CONSTRAINT "cost_items_amount" CHECK ("cost_items"."amount" between 1 and 1000000000000),
	CONSTRAINT "cost_items_name" CHECK (length(btrim("cost_items"."name")) between 1 and 80),
	CONSTRAINT "cost_items_vendor" CHECK ("cost_items"."vendor" is null or length("cost_items"."vendor") <= 80),
	CONSTRAINT "cost_items_note" CHECK ("cost_items"."note" is null or length("cost_items"."note") <= 300),
	CONSTRAINT "cost_items_days" CHECK ("cost_items"."anchor_on" between '2020-01-01' and '2100-12-31' and ("cost_items"."ends_on" is null or "cost_items"."ends_on" between '2020-01-01' and '2100-12-31')),
	CONSTRAINT "cost_items_once" CHECK ("cost_items"."kind" <> 'one_time' or (not "cost_items"."varies" and "cost_items"."ends_on" is null))
);
--> statement-breakpoint
CREATE TABLE "cost_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"period_for" date NOT NULL,
	"paid_on" date NOT NULL,
	"amount" bigint NOT NULL,
	"currency" text NOT NULL,
	"inr_paise" bigint NOT NULL,
	"gst_paise" bigint,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cost_payments_currency" CHECK ("cost_payments"."currency" in ('INR', 'USD')),
	CONSTRAINT "cost_payments_amount" CHECK ("cost_payments"."amount" between 1 and 1000000000000 and "cost_payments"."inr_paise" between 1 and 1000000000000),
	CONSTRAINT "cost_payments_inr" CHECK ("cost_payments"."currency" <> 'INR' or "cost_payments"."inr_paise" = "cost_payments"."amount"),
	CONSTRAINT "cost_payments_gst" CHECK ("cost_payments"."gst_paise" is null or "cost_payments"."gst_paise" between 0 and "cost_payments"."inr_paise"),
	CONSTRAINT "cost_payments_days" CHECK ("cost_payments"."paid_on" between '2020-01-01' and '2100-12-31' and "cost_payments"."period_for" between '2020-01-01' and '2100-12-31'),
	CONSTRAINT "cost_payments_note" CHECK ("cost_payments"."note" is null or length("cost_payments"."note") <= 300)
);
--> statement-breakpoint
ALTER TABLE "cost_payments" ADD CONSTRAINT "cost_payments_item_fk" FOREIGN KEY ("item_id") REFERENCES "public"."cost_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cost_items_live" ON "cost_items" USING btree ("kind","ends_on");--> statement-breakpoint
CREATE UNIQUE INDEX "cost_payments_period" ON "cost_payments" USING btree ("item_id","period_for");--> statement-breakpoint
CREATE INDEX "cost_payments_paid" ON "cost_payments" USING btree ("paid_on","id");
-- ═══ ACCESS (hand-written, appended to the generated file as 0163 does; plan docs/plans/2026-11-23-admin-costs.md task 2;
-- tenancy review 2026-11-23) — the shape of 0093 (Infrastructure), NOT the definer_only one: frata_admin reads and writes
-- the two tables directly (src/lib/admin/costs.ts, fenced by check:tenant § 10); no other role holds anything. An item is
-- ended, never deleted; a payment may be deleted (Undo) but never edited. ═══
--> statement-breakpoint
revoke all on cost_items, cost_payments from public, anon, authenticated, service_role, frata_app, frata_builder;
--> statement-breakpoint
alter table cost_items enable row level security;
--> statement-breakpoint
alter table cost_payments enable row level security;
--> statement-breakpoint
grant select, insert, update on cost_items to frata_admin;
--> statement-breakpoint
grant select, insert, delete on cost_payments to frata_admin;
--> statement-breakpoint
create policy admin_costs on cost_items for all to frata_admin using (true) with check (true);
--> statement-breakpoint
create policy admin_costs on cost_payments for all to frata_admin using (true) with check (true);
--> statement-breakpoint
-- The day's USD/INR rate for prefilling "Left your account" (the card statement's figure still wins). A one-row read of
-- fx_rates; app_fx_rate_latest stays frata_app's and tenancy.sql § 89 still proves frata_admin cannot run it.
create or replace function admin_fx_rate_latest() returns table (day date, rate_e4 integer)
  language sql stable security definer set search_path = '' as $$
  select r.day, r.rate_e4 from public.fx_rates r order by r.day desc limit 1
$$;
--> statement-breakpoint
revoke all on function admin_fx_rate_latest() from public, anon, authenticated, service_role, frata_app, frata_builder;
--> statement-breakpoint
grant execute on function admin_fx_rate_latest() to frata_admin;
