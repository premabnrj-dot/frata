CREATE TABLE "brand_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"record" jsonb NOT NULL,
	"summary" text NOT NULL,
	"base_version" integer NOT NULL,
	"proposed_by" uuid NOT NULL,
	"proposed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decision" text,
	"decided_by" uuid,
	CONSTRAINT "brand_proposals_tenant_id" UNIQUE("tenant_id","id"),
	CONSTRAINT "brand_proposals_record_size" CHECK (octet_length("brand_proposals"."record"::text) <= 8192),
	CONSTRAINT "brand_proposals_summary" CHECK (char_length("brand_proposals"."summary") between 1 and 120),
	CONSTRAINT "brand_proposals_decision" CHECK (("brand_proposals"."decided_at" is null) = ("brand_proposals"."decision" is null) and ("brand_proposals"."decision" is null or "brand_proposals"."decision" in ('approved','declined','replaced')))
);
--> statement-breakpoint
CREATE TABLE "brand_seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"color_accent" text NOT NULL,
	"color_on" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "brand_seasons_tenant_id" UNIQUE("tenant_id","id"),
	CONSTRAINT "brand_seasons_name" CHECK (char_length("brand_seasons"."name") between 1 and 40),
	CONSTRAINT "brand_seasons_ends" CHECK ("brand_seasons"."ends_at" is null or "brand_seasons"."ends_at" > "brand_seasons"."starts_at"),
	CONSTRAINT "brand_seasons_colours" CHECK ("brand_seasons"."color_accent" ~ '^#[0-9A-F]{6}$' and "brand_seasons"."color_on" ~ '^#[0-9A-F]{6}$')
);
--> statement-breakpoint
CREATE TABLE "brand_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"logo_mark_url" text,
	"logo_stacked_url" text,
	"logo_reversed_url" text,
	"color_bg" text NOT NULL,
	"color_panel" text NOT NULL,
	"color_text" text NOT NULL,
	"color_muted" text NOT NULL,
	"color_accent" text NOT NULL,
	"color_on" text NOT NULL,
	"color_edge" text NOT NULL,
	"color_line" text NOT NULL,
	"color_good" text NOT NULL,
	"color_warn" text NOT NULL,
	"color_bad" text NOT NULL,
	"font_display" text NOT NULL,
	"font_body" text NOT NULL,
	"radius" smallint NOT NULL,
	"density" text NOT NULL,
	"previous" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "brand_tokens_tenant" UNIQUE("tenant_id"),
	CONSTRAINT "brand_tokens_mark" CHECK ("brand_tokens"."logo_mark_url" is null or "brand_tokens"."logo_mark_url" ~ ('^https://[a-z0-9]+\.public\.blob\.vercel-storage\.com/tenants/' || "brand_tokens"."tenant_id"::text || '/brand/([0-9a-f-]{36}-400\.(webp|jpg)|[0-9a-f]{64}\.svg)$')),
	CONSTRAINT "brand_tokens_stacked" CHECK ("brand_tokens"."logo_stacked_url" is null or "brand_tokens"."logo_stacked_url" ~ ('^https://[a-z0-9]+\.public\.blob\.vercel-storage\.com/tenants/' || "brand_tokens"."tenant_id"::text || '/brand/([0-9a-f-]{36}-400\.(webp|jpg)|[0-9a-f]{64}\.svg)$')),
	CONSTRAINT "brand_tokens_reversed" CHECK ("brand_tokens"."logo_reversed_url" is null or "brand_tokens"."logo_reversed_url" ~ ('^https://[a-z0-9]+\.public\.blob\.vercel-storage\.com/tenants/' || "brand_tokens"."tenant_id"::text || '/brand/([0-9a-f-]{36}-400\.(webp|jpg)|[0-9a-f]{64}\.svg)$')),
	CONSTRAINT "brand_tokens_colours" CHECK ("brand_tokens"."color_bg" ~ '^#[0-9A-F]{6}$' and "brand_tokens"."color_panel" ~ '^#[0-9A-F]{6}$' and "brand_tokens"."color_text" ~ '^#[0-9A-F]{6}$' and "brand_tokens"."color_muted" ~ '^#[0-9A-F]{6}$' and "brand_tokens"."color_accent" ~ '^#[0-9A-F]{6}$' and "brand_tokens"."color_on" ~ '^#[0-9A-F]{6}$' and "brand_tokens"."color_edge" ~ '^#[0-9A-F]{6}$' and "brand_tokens"."color_line" ~ '^#[0-9A-F]{6}$' and "brand_tokens"."color_good" ~ '^#[0-9A-F]{6}$' and "brand_tokens"."color_warn" ~ '^#[0-9A-F]{6}$' and "brand_tokens"."color_bad" ~ '^#[0-9A-F]{6}$'),
	CONSTRAINT "brand_tokens_fonts" CHECK ("brand_tokens"."font_display" in ('fraunces','cormorant','inter','playfair','dmserif','schibsted','mukta','tiro') and "brand_tokens"."font_body" in ('fraunces','cormorant','inter','playfair','dmserif','schibsted','mukta','tiro')),
	CONSTRAINT "brand_tokens_radius" CHECK ("brand_tokens"."radius" in (0,4,8,12,16)),
	CONSTRAINT "brand_tokens_density" CHECK ("brand_tokens"."density" in ('compact','standard','roomy')),
	CONSTRAINT "brand_tokens_previous_size" CHECK ("brand_tokens"."previous" is null or octet_length("brand_tokens"."previous"::text) <= 8192)
);
--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_invoice_logo";--> statement-breakpoint
ALTER TABLE "notices" DROP CONSTRAINT "notices_source";--> statement-breakpoint
ALTER TABLE "brand_proposals" ADD CONSTRAINT "brand_proposals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_seasons" ADD CONSTRAINT "brand_seasons_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_tokens" ADD CONSTRAINT "brand_tokens_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "brand_proposals_one_open" ON "brand_proposals" USING btree ("tenant_id") WHERE "brand_proposals"."decided_at" is null;--> statement-breakpoint
CREATE INDEX "brand_seasons_tenant_starts" ON "brand_seasons" USING btree ("tenant_id","starts_at");--> statement-breakpoint
ALTER TABLE "shop_settings" ADD CONSTRAINT "shop_settings_logo" CHECK ("shop_settings"."logo_url" is null or "shop_settings"."logo_url" ~ ('^https://[a-z0-9]+\.public\.blob\.vercel-storage\.com/tenants/' || "shop_settings"."tenant_id"::text || '/brand/([0-9a-f-]{36}-400\.(webp|jpg)|[0-9a-f]{64}\.svg)$'));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_invoice_logo" CHECK ("orders"."invoice_logo" is null or "orders"."invoice_logo" ~ ('^https://[a-z0-9]+\.public\.blob\.vercel-storage\.com/tenants/' || "orders"."tenant_id"::text || '/documents/([0-9a-f-]{36}|[0-9a-f]{64})\.png$')) NOT VALID;--> statement-breakpoint
ALTER TABLE "orders" VALIDATE CONSTRAINT "orders_invoice_logo";--> statement-breakpoint
ALTER TABLE "notices" ADD CONSTRAINT "notices_source" CHECK ("notices"."source_kind" in ('billing_notice','support_session','handover','admin','addon_trial','edit_payment','content','ask_owner','brand'));--> statement-breakpoint
-- =============================================================================
-- ONE BRAND RECORD — ACCESS (one-address plan P1·2; spec docs/specs/2026-11-16-one-address-checkout.md § 5; tenancy
-- and security reviews folded into the plan, 2026-11-16). Hand-written below the generated tables.
--
-- brand_tokens, brand_seasons, brand_proposals: the store's own rows only (tenant_rows, using and with check, no null
--   branch). frata_app: brand_tokens select, insert and the record's columns to update (never tenant_id or id: a row
--   can't move); brand_seasons select, insert, update, delete; brand_proposals select, insert and its decision columns.
--   frata_admin: none. anon, authenticated, service_role: none.
-- frata_builder (a partner's Builder, preview only, ADR-0015): the live record's named columns under builder_rows and
--   builder_only; never `previous`, `updated_by` or a proposal; nothing on seasons or proposals. shop_settings gains
--   builder select on (tenant_id, logo_url) only: what the Builder's preview reads (tenancy audit; the plan named three more).
-- shop_settings.logo_url: the generated CHECK above holds it to the store's own brand folder on Frrata's media store
--   (production read 2026-11-16: 1 logo, 0 outside the shape). orders.invoice_logo also takes the brand's PNG rendition
--   (documents/<sha256>.png), frozen at packing when doc_logo is empty: NOT VALID then VALIDATE, no lock that stops packing.
-- The owner's line: app_brand_notice(proposal) writes one needs_you notice for an open proposal of THIS store (from
--   app_current_tenant(), never an argument's store); app_notice_members gives it to owners and Managers only.
-- =============================================================================
revoke all on brand_tokens, brand_seasons, brand_proposals from anon, authenticated, service_role;
--> statement-breakpoint
alter table brand_tokens enable row level security;
--> statement-breakpoint
alter table brand_seasons enable row level security;
--> statement-breakpoint
alter table brand_proposals enable row level security;
--> statement-breakpoint
grant select, insert on brand_tokens to frata_app;
--> statement-breakpoint
grant update (logo_mark_url, logo_stacked_url, logo_reversed_url, color_bg, color_panel, color_text, color_muted, color_accent, color_on,
  color_edge, color_line, color_good, color_warn, color_bad, font_display, font_body, radius, density, previous, version, updated_at, updated_by)
  on brand_tokens to frata_app;
--> statement-breakpoint
grant select, insert, delete on brand_seasons to frata_app;
--> statement-breakpoint
grant update (name, starts_at, ends_at, color_accent, color_on, updated_at, updated_by) on brand_seasons to frata_app;
--> statement-breakpoint
grant select, insert on brand_proposals to frata_app;
--> statement-breakpoint
grant update (decided_at, decision, decided_by) on brand_proposals to frata_app;
--> statement-breakpoint
create policy tenant_rows on brand_tokens for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint
create policy tenant_rows on brand_seasons for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint
create policy tenant_rows on brand_proposals for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint
-- A proposal is born open; a decided one never reopens or changes its outcome (frata_app updates only its decision
-- columns, once).
create or replace function app_brand_proposal_once() returns trigger
  language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.decided_at is not null then raise exception 'a change starts open' using errcode = 'check_violation'; end if;
  if tg_op = 'UPDATE' and old.decided_at is not null then raise exception 'a decided change stays decided' using errcode = 'check_violation'; end if;
  return new;
end $$;
--> statement-breakpoint
revoke all on function app_brand_proposal_once() from public, anon, authenticated, service_role, frata_app, frata_admin, frata_builder;
--> statement-breakpoint
create trigger brand_proposals_once before insert or update on brand_proposals for each row execute function app_brand_proposal_once();
--> statement-breakpoint

-- ── The Builder: the live record, preview only ───────────────────────────────────────────────────────────────────
grant select (tenant_id, logo_mark_url, logo_stacked_url, logo_reversed_url, color_bg, color_panel, color_text, color_muted, color_accent,
  color_on, color_edge, color_line, color_good, color_warn, color_bad, font_display, font_body, radius, density) on brand_tokens to frata_builder;
--> statement-breakpoint
grant select (tenant_id, logo_url) on shop_settings to frata_builder;
--> statement-breakpoint
do $$ declare t text; begin
  foreach t in array array['brand_tokens', 'shop_settings'] loop
    execute format('drop policy if exists builder_rows on %I', t);
    execute format('create policy builder_rows on %I as permissive for select to frata_builder using (tenant_id = app_current_tenant())', t);
    execute format('drop policy if exists builder_only on %I', t);
    execute format('create policy builder_only on %I as restrictive for select to frata_builder using ((select app_member_role()) = ''builder'')', t);
  end loop;
end $$;
--> statement-breakpoint

-- ── The owner's line in Notices (O17) ────────────────────────────────────────────────────────────────────────────
create or replace function app_brand_notice(p_proposal uuid) returns uuid
  language plpgsql volatile security definer set search_path = '' as $$
declare t uuid := public.app_current_tenant(); p record;
begin
  if t is null or p_proposal is null then return null; end if;
  select bp.id, bp.proposed_by into p from public.brand_proposals bp where bp.tenant_id = t and bp.id = p_proposal and bp.decided_at is null;
  if p.id is null then return null; end if;
  if exists (select 1 from public.notices n where n.tenant_id = t and n.source_kind = 'brand' and n.source_id = p.id) then return null; end if;
  return public.notice_write(t, 'needs_you', 'brand', p.id, null, null, '/console/brand', false, true, null, p.proposed_by);
end $$;
--> statement-breakpoint
revoke all on function app_brand_notice(uuid) from public, anon, authenticated, service_role, frata_admin, frata_builder;
--> statement-breakpoint
grant execute on function app_brand_notice(uuid) to frata_app;
--> statement-breakpoint
-- 0150's, with brand lines beside a partner's ask: owners and Managers only. Same signature: its grants stay.
create or replace function app_notice_members(p_notice uuid default null) returns table (user_id uuid, role text)
  language sql stable security definer set search_path = '' as $$
  select m.user_id, m.role from public.members m where m.tenant_id = public.app_current_tenant()
     and m.role in ('owner', 'admin', 'staff', 'partner')
     and (m.role in ('owner', 'admin') or not exists (select 1 from public.notices n where n.tenant_id = m.tenant_id and n.id = p_notice and n.source_kind in ('ask_owner', 'brand'))) $$;
--> statement-breakpoint
-- M5 (api-contract review): a season starting or ending moves the brand the API answers; the 5-minute drain's boundary
-- sweep names those stores too (0148's, plus brand_seasons), and the drain purges their `settings`. Same signature: its
-- grants stay.
create or replace function app_shops_with_boundary(p_since timestamptz, p_until timestamptz, p_after uuid default null) returns setof uuid
  language sql stable security definer set search_path = '' as $$
  select x.id from (
    select tenant_id id from public.products where publish_at > p_since and publish_at <= p_until
    union
    select tenant_id from public.discounts where ended_at is null and starts_at > p_since and starts_at <= p_until
    union
    select tenant_id from public.discounts where ended_at is null and ends_at > p_since and ends_at <= p_until
    union
    select tenant_id from public.brand_seasons where starts_at > p_since and starts_at <= p_until
    union
    select tenant_id from public.brand_seasons where ends_at > p_since and ends_at <= p_until
  ) x where p_after is null or x.id > p_after
  order by 1 limit 500
$$;
