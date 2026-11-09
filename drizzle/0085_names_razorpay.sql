DROP INDEX "shop_names_current";--> statement-breakpoint
ALTER TABLE "shop_names" ADD COLUMN "added_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shop_names" ADD COLUMN "razorpay_ok_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shop_names" ADD COLUMN "razorpay_ok_by" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "shop_names_added" ON "shop_names" USING btree ("tenant_id") WHERE added_at is not null and retired_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "shop_names_current" ON "shop_names" USING btree ("tenant_id") WHERE retired_at is null and added_at is null;--> statement-breakpoint
ALTER TABLE "shop_names" ADD CONSTRAINT "shop_names_razorpay_by" CHECK (("shop_names"."razorpay_ok_at" is null) = ("shop_names"."razorpay_ok_by" is null));--> statement-breakpoint
ALTER TABLE "shop_names" ADD CONSTRAINT "shop_names_added_live" CHECK ("shop_names"."added_at" is null or ("shop_names"."retired_at" is null and not "shop_names"."retired_by_frrata"));