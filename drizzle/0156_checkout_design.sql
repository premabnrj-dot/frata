CREATE TABLE "checkout_design" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"header" text DEFAULT 'left' NOT NULL,
	"back_link" boolean DEFAULT true NOT NULL,
	"policy_rows" smallint DEFAULT 1 NOT NULL,
	"trust" text[] DEFAULT array['delivery','returns','cod','secure']::text[] NOT NULL,
	"heading" text DEFAULT '' NOT NULL,
	"thanks" text DEFAULT '' NOT NULL,
	"previous" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "checkout_design_tenant" UNIQUE("tenant_id"),
	CONSTRAINT "checkout_design_header" CHECK ("checkout_design"."header" in ('left','centre')),
	CONSTRAINT "checkout_design_rows" CHECK ("checkout_design"."policy_rows" in (1,2)),
	CONSTRAINT "checkout_design_trust" CHECK (cardinality("checkout_design"."trust") <= 4 and "checkout_design"."trust" <@ array['delivery','returns','cod','secure','gst']::text[] and array_position("checkout_design"."trust", null) is null),
	CONSTRAINT "checkout_design_lines" CHECK (char_length("checkout_design"."heading") <= 24 and char_length("checkout_design"."thanks") <= 120),
	CONSTRAINT "checkout_design_previous_size" CHECK ("checkout_design"."previous" is null or octet_length("checkout_design"."previous"::text) <= 4096)
);
--> statement-breakpoint
DROP INDEX "brand_proposals_one_open";--> statement-breakpoint
ALTER TABLE "brand_proposals" ADD COLUMN "kind" text DEFAULT 'brand' NOT NULL;--> statement-breakpoint
ALTER TABLE "checkout_design" ADD CONSTRAINT "checkout_design_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "brand_proposals_one_open" ON "brand_proposals" USING btree ("tenant_id","kind") WHERE "brand_proposals"."decided_at" is null;--> statement-breakpoint
ALTER TABLE "brand_proposals" ADD CONSTRAINT "brand_proposals_kind" CHECK ("brand_proposals"."kind" in ('brand','checkout'));--> statement-breakpoint
-- =============================================================================
-- CHECKOUT DESIGN — ACCESS (one-address plan P2·1; spec docs/specs/2026-11-16-one-address-checkout.md § 3; grants as
-- P1·2, drizzle/0155). Hand-written below the generated table.
--
-- checkout_design: the store's own row only (tenant_rows, using and with check, no null branch). frata_app: select,
--   insert and the design's columns to update (never tenant_id or id: a row can't move); no delete. frata_admin: none.
--   anon, authenticated, service_role: none.
-- frata_builder (a partner's Builder, preview only, ADR-0015, O9): the live design's named columns under builder_rows
--   and builder_only; never `previous`, `updated_by` or `updated_at`.
-- brand_proposals gains `kind` (brand | checkout): a partner's checkout change on an open store waits for the owner as a
--   brand change does (O17), one open of each kind a store. app_brand_notice points the owner's line at the page the
--   change is for. Its words stay unwritten in the row (worded on read from the proposal's kind and summary).
-- =============================================================================
revoke all on checkout_design from anon, authenticated, service_role;
--> statement-breakpoint
alter table checkout_design enable row level security;
--> statement-breakpoint
grant select, insert on checkout_design to frata_app;
--> statement-breakpoint
grant update (header, back_link, policy_rows, trust, heading, thanks, previous, version, updated_at, updated_by) on checkout_design to frata_app;
--> statement-breakpoint
create policy tenant_rows on checkout_design for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint
grant select (tenant_id, header, back_link, policy_rows, trust, heading, thanks) on checkout_design to frata_builder;
--> statement-breakpoint
create policy builder_rows on checkout_design as permissive for select to frata_builder using (tenant_id = app_current_tenant());
--> statement-breakpoint
create policy builder_only on checkout_design as restrictive for select to frata_builder using ((select app_member_role()) = 'builder');
--> statement-breakpoint
-- 0155's, pointing a checkout change at its own tab. Same signature: its grants stay.
create or replace function app_brand_notice(p_proposal uuid) returns uuid
  language plpgsql volatile security definer set search_path = '' as $$
declare t uuid := public.app_current_tenant(); p record;
begin
  if t is null or p_proposal is null then return null; end if;
  select bp.id, bp.proposed_by, bp.kind into p from public.brand_proposals bp where bp.tenant_id = t and bp.id = p_proposal and bp.decided_at is null;
  if p.id is null then return null; end if;
  if exists (select 1 from public.notices n where n.tenant_id = t and n.source_kind = 'brand' and n.source_id = p.id) then return null; end if;
  return public.notice_write(t, 'needs_you', 'brand', p.id, null, null, case p.kind when 'checkout' then '/console/brand/checkout' else '/console/brand' end, false, true, null, p.proposed_by);
end $$;
--> statement-breakpoint
revoke all on function app_brand_notice(uuid) from public, anon, authenticated, service_role, frata_admin, frata_builder;
--> statement-breakpoint
grant execute on function app_brand_notice(uuid) to frata_app;
