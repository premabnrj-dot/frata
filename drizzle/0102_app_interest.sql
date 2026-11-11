CREATE TABLE "app_interest" (
	"tenant_id" uuid NOT NULL,
	"module" text NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_interest_pk" PRIMARY KEY("tenant_id","module","user_id"),
	CONSTRAINT "app_interest_module" CHECK ("app_interest"."module" in ('communication','rto_shield','ship','true_profit','reviews','marketplace_export','size_fit','cart_flows','gst','ekcode','product_video'))
);
--> statement-breakpoint
ALTER TABLE "app_interest" ADD CONSTRAINT "app_interest_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- =============================================================================
-- APPS GALLERY A1 — "Tell me when it's ready" (plan docs/plans/2026-11-11-apps-gallery.md; tenancy review 2026-11-11).
-- The shop's own rows for frata_app (select, insert, delete; no update), both ways on app_current_tenant(). Admin reads
-- only through app_admin_interest: per app, how many shops and people, and which shops (to send them a Notice).
-- =============================================================================
revoke all on app_interest from public, anon, authenticated, service_role, frata_admin;--> statement-breakpoint
alter table app_interest enable row level security;--> statement-breakpoint
grant select, insert, delete on app_interest to frata_app;--> statement-breakpoint
create policy tenant_rows on app_interest for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());--> statement-breakpoint
create or replace function app_admin_interest(p_uid uuid) returns table (module text, tenant_id uuid, shop text, people bigint, first_at timestamptz)
  language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.platform_staff s where s.user_id = p_uid) then raise exception 'not_staff' using errcode = 'P0001'; end if;
  return query select i.module, t.id, t.name, count(*)::bigint, min(i.created_at)
    from public.app_interest i join public.tenants t on t.id = i.tenant_id
    join public.members m on m.tenant_id = i.tenant_id and m.user_id = i.user_id
   group by i.module, t.id, t.name order by i.module, min(i.created_at) limit 2000;
end $$;--> statement-breakpoint
revoke all on function app_admin_interest(uuid) from public, anon, authenticated, service_role, frata_app;--> statement-breakpoint
grant execute on function app_admin_interest(uuid) to frata_admin;
