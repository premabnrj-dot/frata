CREATE TABLE "platform_switches" (
	"key" text PRIMARY KEY NOT NULL,
	"until" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"set_by" text NOT NULL,
	"reason" text NOT NULL,
	CONSTRAINT "platform_switches_key" CHECK ("platform_switches"."key" in ('passkeys_off')),
	CONSTRAINT "platform_switches_reason" CHECK (length("platform_switches"."reason") between 1 and 200)
);
--> statement-breakpoint
-- =============================================================================
-- PASSKEYS OFF SWITCH (owner, 2026-11-16: "offer me option to turn off pass key, currently I feel they are frictions …
-- we should be able to turn it on when we want … I want to be able to test the system without any frictions").
-- Hand-written. While a `passkeys_off` row's `until` is in the future, the two step-up rules that every staff and
-- partner check reads answer "checked just now" for a person who already qualifies: a platform_staff member (staff), a
-- live partner person (partner: accepted, partner approved, not declined, suspended or removed). Nothing else moves:
-- signing in still needs the email sign-in, roles and store access are unchanged, Builders and members are unaffected,
-- and the row ends itself at `until`. The table has no grant to any role (definers only, as staff_stepups). Set and
-- cleared by Frrata's operator through the Supabase SQL editor on the owner's word, each with an audit row.
-- =============================================================================
alter table platform_switches enable row level security;--> statement-breakpoint
revoke all on platform_switches from public, anon, authenticated, service_role, frata_app, frata_admin, frata_builder;--> statement-breakpoint
create policy definer_only on platform_switches as restrictive for all to public using (false) with check (false);--> statement-breakpoint
create or replace function app_passkeys_off() returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_switches w where w.key = 'passkeys_off' and w.until > now())
$$;--> statement-breakpoint
revoke all on function app_passkeys_off() from public, anon, authenticated, service_role, frata_app, frata_admin, frata_builder;--> statement-breakpoint
-- As 0109, plus the switch (a staff member only: the join to platform_staff stays the gate).
create or replace function app_staff_live_stepup(p_uid uuid, p_session uuid, p_hash text) returns timestamptz
  language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select s.created_at from public.staff_stepups s join public.platform_staff ps on ps.user_id = s.user_id
      where s.user_id = p_uid and s.session_id = p_session and s.token_hash = p_hash and s.expires_at > now()
      order by s.created_at desc limit 1),
    (select now() where public.app_passkeys_off() and exists (select 1 from public.platform_staff ps where ps.user_id = p_uid)))
$$;--> statement-breakpoint
-- As 0129, plus the switch (a live partner person only: app_pm_live stays the gate).
create or replace function app_partner_live_stepup(p_uid uuid, p_session uuid, p_hash text) returns timestamptz
  language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select s.created_at from public.partner_stepups s
       join public.app_pm_live(p_uid) me on me.member_id = s.partner_member_id
      where s.user_id = p_uid and s.session_id = p_session and s.token_hash = p_hash and s.expires_at > now()
      order by s.created_at desc limit 1),
    (select now() where public.app_passkeys_off() and exists (select 1 from public.app_pm_live(p_uid))))
$$;--> statement-breakpoint
revoke all on function app_staff_live_stepup(uuid, uuid, text), app_partner_live_stepup(uuid, uuid, text)
  from public, anon, authenticated, service_role, frata_app, frata_admin, frata_builder;--> statement-breakpoint
-- As 0129, with the partner check reading the switch too (pcookie is 0129's pconf, unchanged).
create or replace function app_access_for(p_user uuid, p_session uuid default null, p_stepup text default null, p_partner text default null) returns jsonb
  language sql stable security definer set search_path = '' as $$
  with conf as (select public.app_staff_live_stepup(p_user, p_session, p_stepup) as at),
  pcookie as (select s.partner_member_id as member_id, s.created_at as at from public.partner_stepups s
              join public.app_pm_live(p_user) me on me.member_id = s.partner_member_id
             where p_partner is not null and s.user_id = p_user and s.session_id = p_session and s.token_hash = p_partner and s.expires_at > now()
             order by s.created_at desc limit 1),
  -- 0151: with the passkeys-off switch on, every live partner membership of this person counts as checked just now.
  pconf as (select member_id, at from pcookie
            union all
            select me.member_id, now() from public.app_pm_live(p_user) me
             where public.app_passkeys_off() and not exists (select 1 from pcookie)),
  prow as (select m.tenant_id, m.partner_member_id from public.members m
             join public.app_pm_live(p_user) me on me.member_id = m.partner_member_id
             join public.partner_links l on l.partner_id = me.partner_id and l.tenant_id = m.tenant_id and l.removed_at is null
            where m.user_id = p_user)
  select jsonb_build_object(
    'staffRole', (select ps.role from public.platform_staff ps where ps.user_id = p_user),
    'staffConfirmedAt', (select at from conf),
    'partnerConfirmedAt', (select max(at) from pconf),
    -- Stores this person works on as a partner but cannot open until they confirm with a passkey on this session.
    'partnerHeld', coalesce((select jsonb_agg(r.tenant_id) from prow r where not exists (select 1 from pconf c where c.member_id = r.partner_member_id)), '[]'::jsonb),
    'memberships', coalesce((
      select jsonb_agg(d.x order by d.name)
      from (
        select distinct on (u.tenant_id) u.tenant_id, u.tenant_name as name,
          jsonb_build_object('tenantId', u.tenant_id, 'tenantName', u.tenant_name,
                             'role', u.role, 'supportSessionId', u.support_session_id) as x
        from (
          select s.tenant_id, t.name as tenant_name, 'owner'::text as role, s.id as support_session_id, 0 as pref
            from public.support_sessions s
            join public.tenants t on t.id = s.tenant_id
            join public.platform_staff ps on ps.user_id = s.staff_user_id
           where s.staff_user_id = p_user and s.ended_at is null and s.expires_at > now()
             and (select at from conf) is not null
          union all
          select m.tenant_id, t.name, m.role, null::uuid, 1
            from public.members m join public.tenants t on t.id = m.tenant_id
           where m.user_id = p_user
             and (m.partner_member_id is null or exists (
                   select 1 from prow r join pconf c on c.member_id = r.partner_member_id
                    where r.tenant_id = m.tenant_id and r.partner_member_id = m.partner_member_id))
        ) u
        order by u.tenant_id, u.pref
      ) d), '[]'::jsonb))
$$;--> statement-breakpoint
