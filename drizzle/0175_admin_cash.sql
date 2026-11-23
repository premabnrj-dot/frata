CREATE TABLE "cash_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_accounts_name" CHECK (length(btrim("cash_accounts"."name")) between 1 and 60)
);
--> statement-breakpoint
CREATE TABLE "cash_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"as_of" date NOT NULL,
	"balance_paise" bigint NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_balances_amount" CHECK ("cash_balances"."balance_paise" between -100000000000 and 100000000000),
	CONSTRAINT "cash_balances_day" CHECK ("cash_balances"."as_of" between '2020-01-01' and '2100-12-31'),
	CONSTRAINT "cash_balances_note" CHECK ("cash_balances"."note" is null or length("cash_balances"."note") <= 300)
);
--> statement-breakpoint
CREATE TABLE "cash_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"amount_paise" bigint NOT NULL,
	"happened_on" date,
	"expected_on" date,
	"account_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_entries_kind" CHECK ("cash_entries"."kind" in ('funding','loan','grant','owner_capital','other_in','gst_paid','tds_paid','tax_paid','loan_repayment','owner_draw','other_out')),
	CONSTRAINT "cash_entries_amount" CHECK ("cash_entries"."amount_paise" between 1 and 100000000000),
	CONSTRAINT "cash_entries_when" CHECK (("cash_entries"."happened_on" is not null and "cash_entries"."expected_on" is null) or ("cash_entries"."happened_on" is null and "cash_entries"."expected_on" is not null)),
	CONSTRAINT "cash_entries_days" CHECK (("cash_entries"."happened_on" is null or "cash_entries"."happened_on" between '2020-01-01' and '2100-12-31') and ("cash_entries"."expected_on" is null or "cash_entries"."expected_on" between '2020-01-01' and '2100-12-31')),
	CONSTRAINT "cash_entries_note" CHECK ("cash_entries"."note" is null or length("cash_entries"."note") <= 300)
);
--> statement-breakpoint
CREATE TABLE "cash_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"floor_paise" bigint,
	"main_account_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_settings_one" CHECK ("cash_settings"."id" = 1),
	CONSTRAINT "cash_settings_floor" CHECK ("cash_settings"."floor_paise" is null or "cash_settings"."floor_paise" between 0 and 100000000000)
);
--> statement-breakpoint
ALTER TABLE "cash_balances" ADD CONSTRAINT "cash_balances_account_fk" FOREIGN KEY ("account_id") REFERENCES "public"."cash_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_entries" ADD CONSTRAINT "cash_entries_account_fk" FOREIGN KEY ("account_id") REFERENCES "public"."cash_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_settings" ADD CONSTRAINT "cash_settings_main_fk" FOREIGN KEY ("main_account_id") REFERENCES "public"."cash_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cash_balances_latest" ON "cash_balances" USING btree ("account_id","as_of","created_at","id");--> statement-breakpoint
CREATE INDEX "cash_entries_happened" ON "cash_entries" USING btree ("happened_on");--> statement-breakpoint
CREATE INDEX "cash_entries_planned" ON "cash_entries" USING btree ("expected_on") WHERE "cash_entries"."happened_on" is null;--> statement-breakpoint
CREATE INDEX "frrata_invoices_test" ON "frrata_invoices" USING btree ("tenant_id","id") WHERE "frrata_invoices"."test_mode";--> statement-breakpoint
CREATE INDEX "frrata_payments_captured" ON "frrata_payments" USING btree ("captured_at") WHERE "frrata_payments"."captured_at" is not null;--> statement-breakpoint
CREATE INDEX "frrata_payments_refunded" ON "frrata_payments" USING btree ("refunded_at") WHERE "frrata_payments"."refunded_at" is not null;
-- ═══ ACCESS (hand-written, appended to the generated file as 0172 does; plan docs/plans/2026-11-23-admin-cashflow.md task 3; tenancy,
-- security and speed reviews 2026-11-23) — the shape of 0172 (Costs): frata_admin reads and writes the four tables directly
-- (src/lib/admin/cash.ts, fenced by check:tenant § 10 as the Cash family); no other role holds anything. A balance is appended and may be
-- deleted (Undo), never edited; an account is added and renamed, never deleted; the settings row is seeded here and only updated. ═══
--> statement-breakpoint
revoke all on cash_accounts, cash_balances, cash_entries, cash_settings from public, anon, authenticated, service_role, frata_app, frata_builder;
--> statement-breakpoint
alter table cash_accounts enable row level security;
--> statement-breakpoint
alter table cash_balances enable row level security;
--> statement-breakpoint
alter table cash_entries enable row level security;
--> statement-breakpoint
alter table cash_settings enable row level security;
--> statement-breakpoint
grant select, insert, update on cash_accounts to frata_admin;
--> statement-breakpoint
grant select, insert, delete on cash_balances to frata_admin;
--> statement-breakpoint
grant select, insert, update, delete on cash_entries to frata_admin;
--> statement-breakpoint
grant select, update on cash_settings to frata_admin;
--> statement-breakpoint
create policy admin_cash on cash_accounts for all to frata_admin using (true) with check (true);
--> statement-breakpoint
create policy admin_cash on cash_balances for all to frata_admin using (true) with check (true);
--> statement-breakpoint
create policy admin_cash on cash_entries for all to frata_admin using (true) with check (true);
--> statement-breakpoint
create policy admin_cash on cash_settings for all to frata_admin using (true) with check (true);
--> statement-breakpoint
insert into cash_settings (id) values (1) on conflict (id) do nothing;
