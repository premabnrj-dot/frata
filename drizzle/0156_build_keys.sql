ALTER TABLE "storefront_keys" DROP CONSTRAINT "storefront_keys_kind";--> statement-breakpoint
ALTER TABLE "storefront_keys" DROP CONSTRAINT "storefront_keys_prefix";--> statement-breakpoint
ALTER TABLE "storefront_keys" DROP CONSTRAINT "storefront_keys_expiry";--> statement-breakpoint
ALTER TABLE "storefront_keys" ADD COLUMN "purpose" text;--> statement-breakpoint
ALTER TABLE "storefront_keys" ADD CONSTRAINT "storefront_keys_purpose" CHECK (("storefront_keys"."kind" = 'build') = ("storefront_keys"."purpose" is not null) and ("storefront_keys"."purpose" is null or "storefront_keys"."purpose" in ('session','preview','developer')));--> statement-breakpoint
ALTER TABLE "storefront_keys" ADD CONSTRAINT "storefront_keys_kind" CHECK ("storefront_keys"."kind" in ('public','test','build'));--> statement-breakpoint
ALTER TABLE "storefront_keys" ADD CONSTRAINT "storefront_keys_prefix" CHECK ("storefront_keys"."prefix" ~ '^frs_(pub|test|build)_[0-9A-Za-z]{6}$' and starts_with("storefront_keys"."prefix", case "storefront_keys"."kind" when 'public' then 'frs_pub_' else 'frs_' || "storefront_keys"."kind" || '_' end));--> statement-breakpoint
ALTER TABLE "storefront_keys" ADD CONSTRAINT "storefront_keys_expiry" CHECK (("storefront_keys"."kind" in ('test','build')) = ("storefront_keys"."expires_at" is not null));