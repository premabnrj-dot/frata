CREATE TABLE "wa_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"waba_id" text NOT NULL,
	"phone_number_id" text NOT NULL,
	"business_id" text,
	"display_phone" text NOT NULL,
	"verified_name" text,
	"coexistence" boolean NOT NULL,
	"token_enc" text,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"connected_by" uuid NOT NULL,
	"disconnected_at" timestamp with time zone,
	"disconnected_by" uuid,
	"quality" text,
	"limit_tier" text,
	"name_status" text,
	"payment_ok" boolean,
	"currency" text,
	"token_rejected_at" timestamp with time zone,
	"history_sync_at" timestamp with time zone,
	"checked_at" timestamp with time zone,
	CONSTRAINT "wa_connections_ids" CHECK (waba_id ~ '^[0-9]{5,20}$' and phone_number_id ~ '^[0-9]{5,20}$' and (business_id is null or business_id ~ '^[0-9]{5,20}$')),
	CONSTRAINT "wa_connections_closed" CHECK (("wa_connections"."disconnected_at" is null) = ("wa_connections"."disconnected_by" is null) and ("wa_connections"."disconnected_at" is null) = ("wa_connections"."token_enc" is not null))
);
--> statement-breakpoint
ALTER TABLE "wa_connections" ADD CONSTRAINT "wa_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "wa_connections_one_open" ON "wa_connections" USING btree ("tenant_id") WHERE "wa_connections"."disconnected_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "wa_connections_number_open" ON "wa_connections" USING btree ("phone_number_id") WHERE "wa_connections"."disconnected_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "wa_connections_waba_open" ON "wa_connections" USING btree ("waba_id") WHERE "wa_connections"."disconnected_at" is null;--> statement-breakpoint
CREATE INDEX "wa_connections_tenant" ON "wa_connections" USING btree ("tenant_id");