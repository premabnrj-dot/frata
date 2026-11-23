ALTER TABLE "platform_switches" DROP CONSTRAINT "platform_switches_until";--> statement-breakpoint
ALTER TABLE "staff_notices" DROP CONSTRAINT "staff_notices_kind";--> statement-breakpoint
ALTER TABLE "platform_switches" ALTER COLUMN "until" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "studio_turn_keys" ALTER COLUMN "staff_stepup_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "studio_turn_keys" ALTER COLUMN "partner_stepup_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_switches" ADD CONSTRAINT "platform_switches_until" CHECK ("platform_switches"."until" is null or "platform_switches"."until" <= "platform_switches"."created_at" + interval '30 days');--> statement-breakpoint
ALTER TABLE "staff_notices" ADD CONSTRAINT "staff_notices_kind" CHECK ("staff_notices"."kind" in ('staff_added','staff_removed','request_approved','passkey_added','passkey_removed','partner_passkey_added','partner_passkey_removed','partner_request_made','partner_request_approved','partner_role_changed','passkeys_off','passkeys_on'));