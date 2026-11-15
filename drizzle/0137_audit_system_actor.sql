ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_kind";--> statement-breakpoint
ALTER TABLE "audit_events" ALTER COLUMN "actor_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_who" CHECK (("audit_events"."actor_kind" = 'system') = ("audit_events"."actor_user_id" is null) and ("audit_events"."actor_kind" <> 'system' or "audit_events"."actor_email" is null));--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_kind" CHECK ("audit_events"."actor_kind" in ('member','staff','support','system'));