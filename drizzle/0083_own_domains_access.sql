-- =============================================================================
-- OWN DOMAINS D2·2 ACCESS (plan docs/plans/2026-11-08-shop-addresses.md § D·2). Hand-written.
-- A shop reads its own domain rows (Settings › Shop address); no app writes: every write is a definer (D2·6).
-- Admin reads every row (Admin › Addresses, Domain health); its writes are definers too (D2·11), as 0069 did for names.
-- =============================================================================
revoke all on shop_domains from anon, authenticated, service_role;

--> statement-breakpoint
alter table shop_domains enable row level security;

--> statement-breakpoint
grant select on shop_domains to frata_app;

--> statement-breakpoint
create policy tenant_read on shop_domains for select to frata_app using (tenant_id = app_current_tenant());

--> statement-breakpoint
grant select on shop_domains to frata_admin;

--> statement-breakpoint
create policy admin_read on shop_domains for select to frata_admin using (true);

--> statement-breakpoint
-- shop_domains is the one record of own domains from here (tenancy audit D2·2): the old table is empty in
-- production and Admin may no longer add to it; app_tenant_for_host stops reading it when the lookup moves (D2·6).
revoke insert, update, delete on tenant_domains from frata_admin;
