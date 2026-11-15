CREATE TABLE "partner_passkey_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_member_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"opens_at" timestamp with time zone,
	"approved_by" uuid,
	"approved_kind" text,
	"approved_at" timestamp with time zone,
	"used_at" timestamp with time zone,
	CONSTRAINT "partner_passkey_requests_kind" CHECK ("partner_passkey_requests"."approved_kind" is null or "partner_passkey_requests"."approved_kind" in ('owner','staff'))
);
--> statement-breakpoint
CREATE TABLE "partner_passkey_tries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_passkey_tries_kind" CHECK ("partner_passkey_tries"."kind" in ('check','request','approve'))
);
--> statement-breakpoint
CREATE TABLE "partner_passkeys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_member_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"credential_id" text NOT NULL,
	"public_key" text NOT NULL,
	"counter" bigint DEFAULT 0 NOT NULL,
	"transports" text[] DEFAULT '{}'::text[] NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "partner_passkeys_name" CHECK (char_length("partner_passkeys"."name") between 1 and 40)
);
--> statement-breakpoint
CREATE TABLE "partner_stepups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_member_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"passkey_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_webauthn_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_member_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"challenge" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	CONSTRAINT "partner_webauthn_challenges_purpose" CHECK ("partner_webauthn_challenges"."purpose" in ('confirm','add'))
);
--> statement-breakpoint
ALTER TABLE "staff_notices" DROP CONSTRAINT "staff_notices_kind";--> statement-breakpoint
ALTER TABLE "partner_passkey_requests" ADD CONSTRAINT "partner_passkey_requests_partner_member_id_partner_members_id_fk" FOREIGN KEY ("partner_member_id") REFERENCES "public"."partner_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_passkeys" ADD CONSTRAINT "partner_passkeys_partner_member_id_partner_members_id_fk" FOREIGN KEY ("partner_member_id") REFERENCES "public"."partner_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_stepups" ADD CONSTRAINT "partner_stepups_partner_member_id_partner_members_id_fk" FOREIGN KEY ("partner_member_id") REFERENCES "public"."partner_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_stepups" ADD CONSTRAINT "partner_stepups_passkey_id_partner_passkeys_id_fk" FOREIGN KEY ("passkey_id") REFERENCES "public"."partner_passkeys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_webauthn_challenges" ADD CONSTRAINT "partner_webauthn_challenges_partner_member_id_partner_members_id_fk" FOREIGN KEY ("partner_member_id") REFERENCES "public"."partner_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "partner_passkey_requests_member" ON "partner_passkey_requests" USING btree ("partner_member_id","created_at");--> statement-breakpoint
CREATE INDEX "partner_passkey_tries_user" ON "partner_passkey_tries" USING btree ("user_id","kind","at");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_passkeys_credential" ON "partner_passkeys" USING btree ("credential_id");--> statement-breakpoint
CREATE INDEX "partner_passkeys_member" ON "partner_passkeys" USING btree ("partner_member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_stepups_token" ON "partner_stepups" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "partner_stepups_user" ON "partner_stepups" USING btree ("user_id","session_id");--> statement-breakpoint
CREATE INDEX "partner_webauthn_challenges_user" ON "partner_webauthn_challenges" USING btree ("user_id","session_id");--> statement-breakpoint
ALTER TABLE "staff_notices" ADD CONSTRAINT "staff_notices_kind" CHECK ("staff_notices"."kind" in ('staff_added','staff_removed','request_approved','passkey_added','passkey_removed','partner_passkey_added','partner_passkey_removed','partner_request_made','partner_request_approved'));