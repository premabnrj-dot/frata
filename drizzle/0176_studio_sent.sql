ALTER TABLE "studio_proposals" ADD COLUMN "brand_proposal_id" uuid;--> statement-breakpoint
ALTER TABLE "studio_proposals" ADD CONSTRAINT "studio_proposals_brand" FOREIGN KEY ("tenant_id","brand_proposal_id") REFERENCES "public"."brand_proposals"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- V3b K1: Apply records the waiting change its card became (the app writes it once, under the person's bind).
grant update (brand_proposal_id) on studio_proposals to frata_app;
