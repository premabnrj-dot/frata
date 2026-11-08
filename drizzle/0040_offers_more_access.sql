-- =============================================================================
-- OFFERS O·2 ACCESS (docs/plans/2026-11-08-offers-o2.md, plan review). Hand-written.
--
-- discount_targets / discount_tiers: the shop reads, adds and removes its OWN rows (a draft's targets and steps are
-- replaced whole when it is saved); never updated in place. frata_admin and the API roles: nothing.
-- discounts: the new terms join its column-level update grant. order_lines.product_discount is written at placement
-- only (a reprice keeps it), so the app gets no update on it.
-- variants: never sold above M.R.P. — the tag's M.R.P. (compare_at) is at least the price (Legal Metrology r.18(2)); NOT
-- VALID, so rows from before are not rechecked here, while every new write is.
-- The gift: a composite FK that, when the variant goes, clears only gift_variant_id (never tenant_id): Postgres 15+
-- column list (O·2 plan review 4); the offer then gives nothing until a new gift is chosen.
-- =============================================================================
revoke all on discount_targets, discount_tiers from anon, authenticated, service_role;
--> statement-breakpoint
alter table discount_targets enable row level security;
--> statement-breakpoint
alter table discount_tiers enable row level security;
--> statement-breakpoint
grant select, insert, delete on discount_targets, discount_tiers to frata_app;
--> statement-breakpoint
create policy tenant_rows on discount_targets for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint
create policy tenant_rows on discount_tiers for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint
grant update (targets, buy_qty, get_qty, get_bps, gift_variant_id, first_order) on discounts to frata_app;
--> statement-breakpoint
alter table variants add constraint variants_mrp check (compare_at is null or compare_at >= price) not valid;
--> statement-breakpoint
alter table discounts add constraint discounts_gift_fk foreign key (tenant_id, gift_variant_id) references variants (tenant_id, id) on delete set null (gift_variant_id);
