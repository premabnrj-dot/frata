-- One-address P1·4 (plan docs/plans/2026-11-16-one-address-checkout.md): an invoice of a code-site store with no logo
-- for paper freezes the brand's PNG rendition at packing (tenants/<t>/documents/<sha256>.png, made by Frrata's server).
-- The CHECK widens to that name and nothing else. NOT VALID then VALIDATE: the scan takes no lock that stops packing.
ALTER TABLE "orders" DROP CONSTRAINT "orders_invoice_logo";--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_invoice_logo" CHECK ("orders"."invoice_logo" is null or "orders"."invoice_logo" ~ ('^https://[a-z0-9]+\.public\.blob\.vercel-storage\.com/tenants/' || "orders"."tenant_id"::text || '/documents/([0-9a-f-]{36}|[0-9a-f]{64})\.png$')) NOT VALID;--> statement-breakpoint
ALTER TABLE "orders" VALIDATE CONSTRAINT "orders_invoice_logo";
