ALTER TABLE "plan_versions" DROP CONSTRAINT "plan_versions_features";--> statement-breakpoint
ALTER TABLE "module_pauses" DROP CONSTRAINT "module_pauses_module";--> statement-breakpoint
ALTER TABLE "tenant_addons" DROP CONSTRAINT "tenant_addons_module";--> statement-breakpoint
ALTER TABLE "tenant_modules" DROP CONSTRAINT "tenant_modules_module";--> statement-breakpoint
ALTER TABLE "plan_versions" ADD CONSTRAINT "plan_versions_features" CHECK ("plan_versions"."features" <@ array['rto_shield','true_profit','reviews','marketplace_export','size_fit','cart_flows','gst']::text[]);--> statement-breakpoint
ALTER TABLE "module_pauses" ADD CONSTRAINT "module_pauses_module" CHECK ("module_pauses"."module" in ('communication','rto_shield','ship','true_profit','reviews','marketplace_export','size_fit','cart_flows','gst'));--> statement-breakpoint
ALTER TABLE "tenant_addons" ADD CONSTRAINT "tenant_addons_module" CHECK ("tenant_addons"."module" in ('rto_shield','true_profit','reviews','marketplace_export','size_fit','cart_flows','gst'));--> statement-breakpoint
ALTER TABLE "tenant_modules" ADD CONSTRAINT "tenant_modules_module" CHECK ("tenant_modules"."module" in ('communication','rto_shield','ship','true_profit','reviews','marketplace_export','size_fit','cart_flows','gst'));--> statement-breakpoint
-- GST app (owner, 2026-11-09): a module included in Growth and Scale, on only when the merchant switches it on.
-- GST on invoices and credit notes stays core for every plan. Adding a module to a plan version gives a shop more
-- for the same price, so the current versions take it in place (no price changes; Launch stays as it is).
update plan_versions v set features = array_append(v.features, 'gst') from plans p
 where p.id = v.plan_id and p.code in ('growth', 'scale') and not ('gst' = any(v.features));
