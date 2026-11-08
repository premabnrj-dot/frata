CREATE TABLE "billing_accounts" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"legal_name" text DEFAULT '' NOT NULL,
	"gstin" text,
	"address" text DEFAULT '' NOT NULL,
	"state_code" text,
	"email" text DEFAULT '' NOT NULL,
	"gateway_customer_id" text,
	"mandate_token_id" text,
	"mandate_method" text,
	"mandate_max" bigint,
	"mandate_at" timestamp with time zone,
	"mandate_revoked_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_accounts_gstin" CHECK ("billing_accounts"."gstin" is null or "billing_accounts"."gstin" ~ '^[0-9]{2}[A-Z0-9]{13}$'),
	CONSTRAINT "billing_accounts_state" CHECK ("billing_accounts"."state_code" is null or "billing_accounts"."state_code" ~ '^[0-9]{2}$'),
	CONSTRAINT "billing_accounts_sizes" CHECK (length("billing_accounts"."legal_name") <= 200 and length("billing_accounts"."address") <= 400 and length("billing_accounts"."email") <= 254)
);
--> statement-breakpoint
CREATE TABLE "frrata_fee_credits" (
	"tenant_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"fee" bigint NOT NULL,
	CONSTRAINT "frrata_fee_credits_order" PRIMARY KEY("order_id"),
	CONSTRAINT "frrata_fee_credits_money" CHECK ("frrata_fee_credits"."fee" >= 0)
);
--> statement-breakpoint
CREATE TABLE "frrata_invoice_fees" (
	"tenant_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"billable_at" timestamp with time zone NOT NULL,
	"base" bigint NOT NULL,
	"fee_bps" integer NOT NULL,
	"fee" bigint NOT NULL,
	CONSTRAINT "frrata_invoice_fees_order" PRIMARY KEY("order_id"),
	CONSTRAINT "frrata_invoice_fees_tenant_order_key" UNIQUE("tenant_id","order_id"),
	CONSTRAINT "frrata_invoice_fees_money" CHECK ("frrata_invoice_fees"."base" >= 0 and "frrata_invoice_fees"."fee" >= 0 and "frrata_invoice_fees"."fee_bps" between 0 and 10000)
);
--> statement-breakpoint
CREATE TABLE "frrata_invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"kind" text NOT NULL,
	"description" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"quantity" integer NOT NULL,
	"rate_bps" integer,
	"taxable" bigint NOT NULL,
	CONSTRAINT "frrata_invoice_lines_kind" CHECK ("frrata_invoice_lines"."kind" in ('plan','addon','fee','over','credit','carry'))
);
--> statement-breakpoint
CREATE TABLE "frrata_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"drafted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"taxable" bigint NOT NULL,
	"cgst" bigint NOT NULL,
	"sgst" bigint NOT NULL,
	"igst" bigint NOT NULL,
	"total" bigint NOT NULL,
	"carry_in" bigint DEFAULT 0 NOT NULL,
	"carry_out" bigint DEFAULT 0 NOT NULL,
	"rolled" boolean DEFAULT false NOT NULL,
	"orders_billed" integer DEFAULT 0 NOT NULL,
	"included_orders" integer DEFAULT 0 NOT NULL,
	"number" text,
	"issued_at" timestamp with time zone,
	"issued_by" uuid,
	"buyer_name" text,
	"buyer_gstin" text,
	"buyer_address" text,
	"place_of_supply" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "frrata_invoices_tenant_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "frrata_invoices_issued" CHECK ("frrata_invoices"."number" is null or "frrata_invoices"."issued_at" is not null),
	CONSTRAINT "frrata_invoices_money" CHECK ("frrata_invoices"."taxable" >= 0 and "frrata_invoices"."cgst" >= 0 and "frrata_invoices"."sgst" >= 0 and "frrata_invoices"."igst" >= 0 and ("frrata_invoices"."total" = "frrata_invoices"."taxable" + "frrata_invoices"."cgst" + "frrata_invoices"."sgst" + "frrata_invoices"."igst" or "frrata_invoices"."rolled")),
	CONSTRAINT "frrata_invoices_period_order" CHECK ("frrata_invoices"."period_end" > "frrata_invoices"."period_start")
);
--> statement-breakpoint
CREATE TABLE "platform_counters" (
	"kind" text NOT NULL,
	"fy" text NOT NULL,
	"next" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "platform_counters_kind_fy_pk" PRIMARY KEY("kind","fy"),
	CONSTRAINT "platform_counters_kind" CHECK ("platform_counters"."kind" in ('invoice', 'credit')),
	CONSTRAINT "platform_counters_next" CHECK ("platform_counters"."next" >= 1)
);
--> statement-breakpoint
ALTER TABLE "billing_accounts" ADD CONSTRAINT "billing_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frrata_fee_credits" ADD CONSTRAINT "frrata_fee_credits_invoice_fk" FOREIGN KEY ("tenant_id","invoice_id") REFERENCES "public"."frrata_invoices"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frrata_fee_credits" ADD CONSTRAINT "frrata_fee_credits_fee_fk" FOREIGN KEY ("tenant_id","order_id") REFERENCES "public"."frrata_invoice_fees"("tenant_id","order_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frrata_invoice_fees" ADD CONSTRAINT "frrata_invoice_fees_invoice_fk" FOREIGN KEY ("tenant_id","invoice_id") REFERENCES "public"."frrata_invoices"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frrata_invoice_fees" ADD CONSTRAINT "frrata_invoice_fees_order_fk" FOREIGN KEY ("tenant_id","order_id") REFERENCES "public"."orders"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frrata_invoice_lines" ADD CONSTRAINT "frrata_invoice_lines_invoice_fk" FOREIGN KEY ("tenant_id","invoice_id") REFERENCES "public"."frrata_invoices"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frrata_invoices" ADD CONSTRAINT "frrata_invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "frrata_fee_credits_invoice" ON "frrata_fee_credits" USING btree ("tenant_id","invoice_id");--> statement-breakpoint
CREATE INDEX "frrata_invoice_fees_invoice" ON "frrata_invoice_fees" USING btree ("tenant_id","invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "frrata_invoice_lines_position" ON "frrata_invoice_lines" USING btree ("invoice_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "frrata_invoices_tenant_period" ON "frrata_invoices" USING btree ("tenant_id","period_start");--> statement-breakpoint
CREATE UNIQUE INDEX "frrata_invoices_number" ON "frrata_invoices" USING btree ("number");--> statement-breakpoint
CREATE INDEX "frrata_invoices_period" ON "frrata_invoices" USING btree ("period_start");