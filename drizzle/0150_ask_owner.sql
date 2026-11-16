ALTER TABLE "notices" DROP CONSTRAINT "notices_source";--> statement-breakpoint
ALTER TABLE "notices" ADD CONSTRAINT "notices_source" CHECK ("notices"."source_kind" in ('billing_notice','support_session','handover','admin','addon_trial','edit_payment','content','ask_owner'));--> statement-breakpoint
-- =============================================================================
-- PARTNER PUBLISHING PP1 (docs/specs/2026-11-16-partner-publishing.md § PP1 plan, task 4; owner decisions 1–5,
-- 2026-11-16). Hand-written below the generated CHECK. After handover a partner sees Policies, Business and GST, the
-- grievance officer and the invoice signatory and series read-only, with Ask the owner: one needs_you line to the
-- store's owners and Managers, at most one a page an India day, written here. Everything comes from the rows: the store
-- from app_current_tenant() (never an argument), whether the caller is the store's live partner from members joined to
-- a live partner person (app_pm_live) and a live link, whether the store has an owner from members. The words are worded
-- on read from the page (src/domains/email/notices.ts): title and body stay null, the page is the fixed href, and the
-- partner is named only through `by`. frata_app keeps no insert on notices (0097): notice_write writes it.
-- =============================================================================
create or replace function app_ask_owner(p_uid uuid, p_page text) returns boolean
  language plpgsql volatile security definer set search_path = '' as $$
declare t uuid := public.app_current_tenant();
begin
  if t is null or p_uid is null then return false; end if;
  if p_page is null or p_page not in ('policies', 'business', 'contact', 'invoices') then return false; end if;
  -- A live partner of THIS store: its members row (role partner, never a Builder), its person live in a live, approved
  -- partner, and the store's link to that partner not removed.
  if not exists (select 1 from public.members m
                   join public.app_pm_live(p_uid) me on me.member_id = m.partner_member_id
                   join public.partner_links l on l.tenant_id = m.tenant_id and l.partner_id = me.partner_id and l.removed_at is null
                  where m.tenant_id = t and m.user_id = p_uid and m.role = 'partner') then return false; end if;
  -- Before handover nothing is locked, so there is no one to ask.
  if not exists (select 1 from public.members m where m.tenant_id = t and m.role = 'owner') then return false; end if;
  -- One line a page an India day, whoever asks: two asks at once wait here, and the second sees the first's line.
  perform pg_advisory_xact_lock(hashtext('ask_owner:' || t::text || ':' || p_page));
  if exists (select 1 from public.notices n where n.tenant_id = t and n.source_kind = 'ask_owner' and n.href = '/console/settings/' || p_page
              and n.created_at >= (date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata')) then return false; end if;
  perform public.notice_write(t, 'needs_you', 'ask_owner', null, null, null, '/console/settings/' || p_page, false, true, null, p_uid);
  return true;
end $$;
--> statement-breakpoint
revoke all on function app_ask_owner(uuid, text) from public, anon, authenticated, service_role, frata_admin, frata_builder;
--> statement-breakpoint
grant execute on function app_ask_owner(uuid, text) to frata_app;
--> statement-breakpoint
-- The members a notice may reach (ids and roles; no addresses), this shop only, as 0131; a partner's ask reaches owners
-- and Managers only (seesAsks in src/domains/settings/owner-only.ts is its twin). The notice is an argument now, with a
-- default, so the sender deployed before this migration (no argument) keeps working until the new code lands; no
-- ask_owner notice can exist before then (only the new code calls app_ask_owner). Dropped and made again: its grants too.
drop function if exists app_notice_members();
--> statement-breakpoint
create function app_notice_members(p_notice uuid default null) returns table (user_id uuid, role text)
  language sql stable security definer set search_path = '' as $$
  select m.user_id, m.role from public.members m where m.tenant_id = public.app_current_tenant()
     and m.role in ('owner', 'admin', 'staff', 'partner')
     and (m.role in ('owner', 'admin') or not exists (select 1 from public.notices n where n.tenant_id = m.tenant_id and n.id = p_notice and n.source_kind = 'ask_owner')) $$;
--> statement-breakpoint
revoke all on function app_notice_members(uuid) from public, anon, authenticated, service_role, frata_admin, frata_builder;
--> statement-breakpoint
grant execute on function app_notice_members(uuid) to frata_app;
