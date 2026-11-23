CREATE TABLE "studio_binds" (
	"token" text PRIMARY KEY NOT NULL,
	"xact" text NOT NULL,
	"tenant_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"staff_stepup_id" uuid,
	"partner_stepup_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_messages" (
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "studio_messages_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"text" text,
	"proposal_id" uuid,
	"event_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_messages_kind" CHECK ("studio_messages"."kind" in ('person','agent','card','status')),
	CONSTRAINT "studio_messages_text" CHECK ("studio_messages"."text" is null or length("studio_messages"."text") <= 2000)
);
--> statement-breakpoint
CREATE TABLE "studio_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"tool_call_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"value" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_at" timestamp with time zone,
	"applied_by" uuid,
	"refused_at" timestamp with time zone,
	"refused_reason" text,
	"dismissed_at" timestamp with time zone,
	CONSTRAINT "studio_proposals_once" UNIQUE("tool_call_id"),
	CONSTRAINT "studio_proposals_scope" UNIQUE("tenant_id","partner_id","id"),
	CONSTRAINT "studio_proposals_kind" CHECK ("studio_proposals"."kind" in ('tokens','logo')),
	CONSTRAINT "studio_proposals_caps" CHECK (octet_length("studio_proposals"."value"::text) <= 73728 and ("studio_proposals"."refused_reason" is null or length("studio_proposals"."refused_reason") <= 300))
);
--> statement-breakpoint
CREATE TABLE "studio_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"partner_member_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"runtime_id" text,
	"vault_id" text,
	"file_id" text,
	"build_key_id" uuid,
	"event_cursor" text,
	"advancing_until" timestamp with time zone,
	"last_read_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"end_reason" text,
	"cleaned_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "studio_sessions_scope" UNIQUE("tenant_id","partner_id","id"),
	CONSTRAINT "studio_sessions_end_reason" CHECK ("studio_sessions"."end_reason" is null or "studio_sessions"."end_reason" in ('stopped','switch','idle','age','actor','start_failed','restart')),
	CONSTRAINT "studio_sessions_ended" CHECK (("studio_sessions"."ended_at" is null) = ("studio_sessions"."end_reason" is null))
);
--> statement-breakpoint
CREATE TABLE "studio_spend_days" (
	"day" text PRIMARY KEY NOT NULL,
	"reserved_micro" bigint DEFAULT 0 NOT NULL,
	"measured_micro" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_spend_people" (
	"day" text NOT NULL,
	"user_id" uuid NOT NULL,
	"reserved_micro" bigint DEFAULT 0 NOT NULL,
	"measured_micro" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "studio_spend_people_day_user_id_pk" PRIMARY KEY("day","user_id")
);
--> statement-breakpoint
CREATE TABLE "studio_spend_sessions" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"spent_micro" bigint DEFAULT 0 NOT NULL,
	"largest_micro" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_spend_turns" (
	"turn_id" uuid PRIMARY KEY NOT NULL,
	"day" text NOT NULL,
	"user_id" uuid NOT NULL,
	"reserved_micro" bigint NOT NULL,
	"measured_micro" bigint,
	"settled_at" timestamp with time zone,
	"test" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_tool_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"turn_id" uuid NOT NULL,
	"tool_use_id" text NOT NULL,
	"name" text NOT NULL,
	"input" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"executed_at" timestamp with time zone,
	"result" jsonb,
	"is_error" boolean,
	"answered_at" timestamp with time zone,
	CONSTRAINT "studio_tool_calls_once" UNIQUE("session_id","tool_use_id"),
	CONSTRAINT "studio_tool_calls_scope" UNIQUE("tenant_id","partner_id","id"),
	CONSTRAINT "studio_tool_calls_caps" CHECK (octet_length("studio_tool_calls"."input"::text) <= 73728 and ("studio_tool_calls"."result" is null or octet_length("studio_tool_calls"."result"::text) <= 16384))
);
--> statement-breakpoint
CREATE TABLE "studio_turn_keys" (
	"turn_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"staff_stepup_id" uuid NOT NULL,
	"partner_stepup_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"user_message_event_id" text,
	"ended_at" timestamp with time zone,
	"paused_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"failed_reason" text,
	CONSTRAINT "studio_turns_scope" UNIQUE("tenant_id","partner_id","id"),
	CONSTRAINT "studio_turns_full" UNIQUE("tenant_id","partner_id","session_id","id"),
	CONSTRAINT "studio_turns_reason" CHECK (("studio_turns"."failed_at" is null) = ("studio_turns"."failed_reason" is null) and ("studio_turns"."failed_reason" is null or "studio_turns"."failed_reason" in ('start','send','budget','runtime','actor','switch','expired','workspace')))
);
--> statement-breakpoint
ALTER TABLE "studio_messages" ADD CONSTRAINT "studio_messages_proposal" FOREIGN KEY ("tenant_id","partner_id","proposal_id") REFERENCES "public"."studio_proposals"("tenant_id","partner_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_messages" ADD CONSTRAINT "studio_messages_session" FOREIGN KEY ("tenant_id","partner_id","session_id") REFERENCES "public"."studio_sessions"("tenant_id","partner_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_proposals" ADD CONSTRAINT "studio_proposals_session" FOREIGN KEY ("tenant_id","partner_id","session_id") REFERENCES "public"."studio_sessions"("tenant_id","partner_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_proposals" ADD CONSTRAINT "studio_proposals_call" FOREIGN KEY ("tenant_id","partner_id","tool_call_id") REFERENCES "public"."studio_tool_calls"("tenant_id","partner_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_sessions" ADD CONSTRAINT "studio_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_sessions" ADD CONSTRAINT "studio_sessions_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_sessions" ADD CONSTRAINT "studio_sessions_partner_member_id_partner_members_id_fk" FOREIGN KEY ("partner_member_id") REFERENCES "public"."partner_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_spend_sessions" ADD CONSTRAINT "studio_spend_sessions_session_id_studio_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."studio_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_spend_turns" ADD CONSTRAINT "studio_spend_turns_turn_id_studio_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."studio_turns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_tool_calls" ADD CONSTRAINT "studio_tool_calls_session" FOREIGN KEY ("tenant_id","partner_id","session_id") REFERENCES "public"."studio_sessions"("tenant_id","partner_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_tool_calls" ADD CONSTRAINT "studio_tool_calls_turn" FOREIGN KEY ("tenant_id","partner_id","session_id","turn_id") REFERENCES "public"."studio_turns"("tenant_id","partner_id","session_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_turn_keys" ADD CONSTRAINT "studio_turn_keys_turn_id_studio_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."studio_turns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_turn_keys" ADD CONSTRAINT "studio_turn_keys_staff_stepup_id_staff_stepups_id_fk" FOREIGN KEY ("staff_stepup_id") REFERENCES "public"."staff_stepups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_turn_keys" ADD CONSTRAINT "studio_turn_keys_partner_stepup_id_partner_stepups_id_fk" FOREIGN KEY ("partner_stepup_id") REFERENCES "public"."partner_stepups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_turns" ADD CONSTRAINT "studio_turns_session" FOREIGN KEY ("tenant_id","partner_id","session_id") REFERENCES "public"."studio_sessions"("tenant_id","partner_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "studio_binds_age" ON "studio_binds" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_messages_event" ON "studio_messages" USING btree ("session_id","event_id") WHERE "studio_messages"."event_id" is not null;--> statement-breakpoint
CREATE INDEX "studio_messages_keyset" ON "studio_messages" USING btree ("session_id","seq");--> statement-breakpoint
CREATE INDEX "studio_proposals_session" ON "studio_proposals" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_sessions_runtime" ON "studio_sessions" USING btree ("runtime_id");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_sessions_one_open" ON "studio_sessions" USING btree ("tenant_id","user_id") WHERE "studio_sessions"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "studio_sessions_open" ON "studio_sessions" USING btree ("last_read_at") WHERE "studio_sessions"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "studio_sessions_ended" ON "studio_sessions" USING btree ("ended_at") WHERE "studio_sessions"."ended_at" is not null and "studio_sessions"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "studio_tool_calls_pending" ON "studio_tool_calls" USING btree ("session_id") WHERE "studio_tool_calls"."answered_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "studio_turns_one_open" ON "studio_turns" USING btree ("session_id") WHERE "studio_turns"."ended_at" is null and "studio_turns"."paused_at" is null and "studio_turns"."failed_at" is null;--> statement-breakpoint
CREATE INDEX "studio_turns_session" ON "studio_turns" USING btree ("session_id","sent_at");