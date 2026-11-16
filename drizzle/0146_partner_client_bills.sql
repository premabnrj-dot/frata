CREATE TABLE "partner_bill_tries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_client_bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"label" text NOT NULL,
	"number" text,
	"amount" bigint NOT NULL,
	"due_on" date NOT NULL,
	"paid_at" timestamp with time zone,
	"paid_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "partner_client_bills_label" CHECK (length("partner_client_bills"."label") between 1 and 60),
	CONSTRAINT "partner_client_bills_number" CHECK ("partner_client_bills"."number" is null or "partner_client_bills"."number" ~ '^[A-Za-z0-9/-]{1,20}$'),
	CONSTRAINT "partner_client_bills_amount" CHECK ("partner_client_bills"."amount" between 100 and 10000000000),
	CONSTRAINT "partner_client_bills_paid" CHECK (("partner_client_bills"."paid_at" is null) = ("partner_client_bills"."paid_by" is null))
);
--> statement-breakpoint
CREATE TABLE "partner_client_deals" (
	"partner_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount" bigint NOT NULL,
	"renews_on" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	CONSTRAINT "partner_client_deals_partner_id_tenant_id_pk" PRIMARY KEY("partner_id","tenant_id"),
	CONSTRAINT "partner_client_deals_kind" CHECK ("partner_client_deals"."kind" in ('project','retainer')),
	CONSTRAINT "partner_client_deals_amount" CHECK ("partner_client_deals"."amount" between 100 and 10000000000),
	CONSTRAINT "partner_client_deals_renews" CHECK ("partner_client_deals"."kind" = 'retainer' or "partner_client_deals"."renews_on" is null)
);
--> statement-breakpoint
ALTER TABLE "partner_client_bills" ADD CONSTRAINT "partner_client_bills_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_client_bills" ADD CONSTRAINT "partner_client_bills_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_client_bills" ADD CONSTRAINT "partner_client_bills_paid_by_partner_members_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."partner_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_client_bills" ADD CONSTRAINT "partner_client_bills_created_by_partner_members_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."partner_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_client_deals" ADD CONSTRAINT "partner_client_deals_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_client_deals" ADD CONSTRAINT "partner_client_deals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_client_deals" ADD CONSTRAINT "partner_client_deals_updated_by_partner_members_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."partner_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "partner_bill_tries_user" ON "partner_bill_tries" USING btree ("user_id","at");--> statement-breakpoint
CREATE INDEX "partner_bill_tries_at" ON "partner_bill_tries" USING btree ("at");--> statement-breakpoint
CREATE INDEX "partner_client_bills_client" ON "partner_client_bills" USING btree ("partner_id","tenant_id","due_on");--> statement-breakpoint
CREATE INDEX "partner_client_bills_unpaid" ON "partner_client_bills" USING btree ("partner_id","due_on") WHERE "partner_client_bills"."paid_at" is null;--> statement-breakpoint
-- P2 Clients: a partner's own bills reach no Frrata role; the definers in 0147 are the only door (tenancy.sql § 85).
alter table partner_client_deals enable row level security;--> statement-breakpoint
alter table partner_client_bills enable row level security;--> statement-breakpoint
alter table partner_bill_tries enable row level security;--> statement-breakpoint
revoke all on partner_client_deals, partner_client_bills, partner_bill_tries
  from public, anon, authenticated, service_role, frata_app, frata_admin, frata_builder;--> statement-breakpoint
create policy definer_only on partner_client_deals as restrictive for all to public using (false) with check (false);--> statement-breakpoint
create policy definer_only on partner_client_bills as restrictive for all to public using (false) with check (false);--> statement-breakpoint
create policy definer_only on partner_bill_tries as restrictive for all to public using (false) with check (false);
