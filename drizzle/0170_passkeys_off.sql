ALTER TABLE "platform_switches" DROP CONSTRAINT "platform_switches_until";--> statement-breakpoint
ALTER TABLE "platform_switches" ALTER COLUMN "until" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "studio_turn_keys" ALTER COLUMN "staff_stepup_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "studio_turn_keys" ALTER COLUMN "partner_stepup_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_switches" ADD CONSTRAINT "platform_switches_until" CHECK ("platform_switches"."until" is null or "platform_switches"."until" <= "platform_switches"."created_at" + interval '30 days');