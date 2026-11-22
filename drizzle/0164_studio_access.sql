-- Custom SQL migration file, put your code below! --
-- ═══ STUDIO'S AGENT V3a: ACCESS (docs/plans/2026-11-22-v3a-runtime.md R2; ADR-0020 § 4–5 as amended 2026-11-22) ═══
-- Shop tables (studio_sessions, studio_turns, studio_tool_calls, studio_proposals, studio_messages): frata_app only,
-- through two policies each: the usual permissive one on the store, and a RESTRICTIVE one to public on the store AND the
-- partner (`app.partner_id`, read by app_current_partner(), nullif: unset matches nothing). Only two definers set
-- `app.partner_id`: app_studio_partner (from the signed-in person: their live partner membership on THIS store) and
-- app_studio_bind (a session of the current store: for the cron and asTurn only, held by check:studio). No grant to
-- frata_builder or frata_admin in V3a (tenancy audit H2). frata_app never deletes; turns close only through
-- app_studio_close_turn, which settles their spend.
-- Platform scope (studio_turn_keys, studio_spend_*): no role holds any privilege; a restrictive deny-all policy; read
-- and written only by the definers below (the partner_stepups pattern, drizzle/0129).
-- Every definer: security definer, search_path '', EXECUTE revoked from public, anon, authenticated, service_role,
-- frata_builder and frata_admin, granted to frata_app only where the app calls it.

create or replace function app_current_partner() returns uuid
  language sql stable as $$ select nullif(current_setting('app.partner_id', true), '')::uuid $$;--> statement-breakpoint
revoke all on function app_current_partner() from public, anon, authenticated, service_role, frata_builder, frata_admin;--> statement-breakpoint
grant execute on function app_current_partner() to frata_app;--> statement-breakpoint

-- ── Shop tables ──────────────────────────────────────────────────────────────────────────────────────────────────────
revoke all on studio_sessions, studio_turns, studio_tool_calls, studio_proposals, studio_messages
  from public, anon, authenticated, service_role, frata_builder, frata_admin;--> statement-breakpoint
grant select, insert on studio_sessions to frata_app;--> statement-breakpoint
grant update (runtime_id, vault_id, file_id, build_key_id, event_cursor, advancing_until, last_read_at, last_activity_at, ended_at, end_reason, cleaned_at, deleted_at)
  on studio_sessions to frata_app;--> statement-breakpoint
grant select on studio_turns to frata_app;--> statement-breakpoint
grant update (started_at, user_message_event_id) on studio_turns to frata_app;--> statement-breakpoint
grant select, insert on studio_tool_calls to frata_app;--> statement-breakpoint
grant update (executed_at, result, is_error, answered_at) on studio_tool_calls to frata_app;--> statement-breakpoint
grant select, insert on studio_proposals to frata_app;--> statement-breakpoint
grant update (applied_at, applied_by, refused_at, refused_reason, dismissed_at) on studio_proposals to frata_app;--> statement-breakpoint
grant select, insert on studio_messages to frata_app;--> statement-breakpoint

alter table studio_sessions enable row level security;--> statement-breakpoint
alter table studio_turns enable row level security;--> statement-breakpoint
alter table studio_tool_calls enable row level security;--> statement-breakpoint
alter table studio_proposals enable row level security;--> statement-breakpoint
alter table studio_messages enable row level security;--> statement-breakpoint

create policy tenant_rows on studio_sessions for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());--> statement-breakpoint
create policy tenant_rows on studio_turns for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());--> statement-breakpoint
create policy tenant_rows on studio_tool_calls for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());--> statement-breakpoint
create policy tenant_rows on studio_proposals for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());--> statement-breakpoint
create policy tenant_rows on studio_messages for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());--> statement-breakpoint

create policy partner_only on studio_sessions as restrictive for all to public
  using (tenant_id = app_current_tenant() and partner_id = app_current_partner()) with check (tenant_id = app_current_tenant() and partner_id = app_current_partner());--> statement-breakpoint
create policy partner_only on studio_turns as restrictive for all to public
  using (tenant_id = app_current_tenant() and partner_id = app_current_partner()) with check (tenant_id = app_current_tenant() and partner_id = app_current_partner());--> statement-breakpoint
create policy partner_only on studio_tool_calls as restrictive for all to public
  using (tenant_id = app_current_tenant() and partner_id = app_current_partner()) with check (tenant_id = app_current_tenant() and partner_id = app_current_partner());--> statement-breakpoint
create policy partner_only on studio_proposals as restrictive for all to public
  using (tenant_id = app_current_tenant() and partner_id = app_current_partner()) with check (tenant_id = app_current_tenant() and partner_id = app_current_partner());--> statement-breakpoint
create policy partner_only on studio_messages as restrictive for all to public
  using (tenant_id = app_current_tenant() and partner_id = app_current_partner()) with check (tenant_id = app_current_tenant() and partner_id = app_current_partner());--> statement-breakpoint

-- ── Platform scope: definers only ───────────────────────────────────────────────────────────────────────────────────
alter table studio_turn_keys enable row level security;--> statement-breakpoint
alter table studio_spend_sessions enable row level security;--> statement-breakpoint
alter table studio_spend_turns enable row level security;--> statement-breakpoint
alter table studio_spend_days enable row level security;--> statement-breakpoint
alter table studio_spend_people enable row level security;--> statement-breakpoint
revoke all on studio_turn_keys, studio_spend_sessions, studio_spend_turns, studio_spend_days, studio_spend_people
  from public, anon, authenticated, service_role, frata_app, frata_admin, frata_builder;--> statement-breakpoint
create policy definer_only on studio_turn_keys as restrictive for all to public using (false) with check (false);--> statement-breakpoint
create policy definer_only on studio_spend_sessions as restrictive for all to public using (false) with check (false);--> statement-breakpoint
create policy definer_only on studio_spend_turns as restrictive for all to public using (false) with check (false);--> statement-breakpoint
create policy definer_only on studio_spend_days as restrictive for all to public using (false) with check (false);--> statement-breakpoint
create policy definer_only on studio_spend_people as restrictive for all to public using (false) with check (false);--> statement-breakpoint

-- ── Internal: is this person live Frrata staff on this browser session (the staff passkey, or the audited switch)? ──
create or replace function app_studio_staff_ok(p_uid uuid, p_session uuid, p_hash text) returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_staff ps where ps.user_id = p_uid)
     and (public.app_passkeys_off() or public.app_staff_live_stepup(p_uid, p_session, p_hash) is not null)
$$;--> statement-breakpoint

-- ── Internal: the person's live partner membership on store p_tenant, as Studio needs it, or nothing. An owner or a
--    Lead of a live, approved partner; their partner check live (or the switch); a `members` row on that store with
--    role partner pointing at that membership (never a support visit, never the store's own owner); the store's live
--    link to that partner; a Lead assigned to the store.
create or replace function app_studio_member(p_uid uuid, p_session uuid, p_hash text, p_tenant uuid)
  returns table (member_id uuid, partner_id uuid)
  language sql stable security definer set search_path = '' as $$
  select me.member_id, me.partner_id from public.app_pm_live(p_uid) me
   where me.role in ('owner', 'lead')
     and (public.app_passkeys_off() or public.app_partner_live_stepup(p_uid, p_session, p_hash) is not null)
     and exists (select 1 from public.members m where m.tenant_id = p_tenant and m.user_id = p_uid and m.role = 'partner' and m.partner_member_id = me.member_id)
     and exists (select 1 from public.partner_links l where l.tenant_id = p_tenant and l.partner_id = me.partner_id and l.removed_at is null)
     and (me.role = 'owner' or exists (select 1 from public.partner_assignments a where a.partner_member_id = me.member_id and a.tenant_id = p_tenant))
$$;--> statement-breakpoint

-- ── withStudio: binds `app.partner_id` for the signed-in person on the current store, or binds nothing (null). ──
create or replace function app_studio_partner(p_uid uuid, p_session uuid, p_staff_hash text, p_partner_hash text) returns uuid
  language plpgsql volatile security definer set search_path = '' as $$
declare v_t uuid := public.app_current_tenant(); v_p uuid;
begin
  if v_t is null or p_uid is null or p_session is null then return null; end if;
  if not public.app_studio_staff_ok(p_uid, p_session, p_staff_hash) then return null; end if;
  select m.partner_id into v_p from public.app_studio_member(p_uid, p_session, p_partner_hash, v_t) m;
  if v_p is null then return null; end if;
  perform set_config('app.partner_id', v_p::text, true);
  return v_p;
end $$;--> statement-breakpoint

-- ── The cron's and asTurn's bind: a session of the CURRENT store (never another), its partner bound. ──
create or replace function app_studio_bind(p_session uuid) returns uuid
  language plpgsql volatile security definer set search_path = '' as $$
declare v_p uuid;
begin
  select s.partner_id into v_p from public.studio_sessions s where s.id = p_session and s.tenant_id = public.app_current_tenant();
  if v_p is null then return null; end if;
  perform set_config('app.partner_id', v_p::text, true);
  return v_p;
end $$;--> statement-breakpoint

-- ── Send: one turn, its person and step-ups kept apart, its reserve held against the day caps (called inside
--    withStudio, after app_studio_partner bound the partner). Locks: the person's day row, then the platform's,
--    each inserted first so FOR UPDATE has a row to hold (unit economics F4). Raises a refusal code. ──
create or replace function app_studio_open_turn(p_session uuid, p_uid uuid, p_auth_session uuid, p_staff_hash text, p_partner_hash text,
  p_ceiling bigint, p_day text, p_person_cap bigint, p_platform_cap bigint, p_open_cap integer, p_new boolean) returns uuid
  language plpgsql volatile security definer set search_path = '' as $$
declare s record; v_turn uuid; pr record; dr record; v_open integer;
begin
  if p_ceiling is null or p_ceiling <= 0 or p_day !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'bad_input' using errcode = 'P0001'; end if;
  select x.* into s from public.studio_sessions x
   where x.id = p_session and x.tenant_id = public.app_current_tenant() and x.partner_id = public.app_current_partner()
     and x.user_id = p_uid and x.ended_at is null;
  if s.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  insert into public.studio_spend_people (day, user_id) values (p_day, p_uid) on conflict do nothing;
  insert into public.studio_spend_days (day) values (p_day) on conflict do nothing;
  select * into pr from public.studio_spend_people where day = p_day and user_id = p_uid for update;
  select * into dr from public.studio_spend_days where day = p_day for update;
  if p_new then
    select count(*) into v_open from public.studio_sessions x where x.ended_at is null and x.id <> p_session;
    if v_open >= p_open_cap then raise exception 'sessions' using errcode = 'P0001'; end if;
  end if;
  if pr.reserved_micro + pr.measured_micro + p_ceiling > p_person_cap then raise exception 'person_day' using errcode = 'P0001'; end if;
  if dr.reserved_micro + dr.measured_micro + p_ceiling > p_platform_cap then raise exception 'platform_day' using errcode = 'P0001'; end if;
  if exists (select 1 from public.studio_turns t where t.session_id = p_session and t.ended_at is null and t.paused_at is null and t.failed_at is null) then
    raise exception 'turn_open' using errcode = 'P0001';
  end if;
  insert into public.studio_turns (tenant_id, partner_id, session_id) values (s.tenant_id, s.partner_id, s.id) returning id into v_turn;
  insert into public.studio_turn_keys (turn_id, user_id, auth_session, staff_hash, partner_hash) values (v_turn, p_uid, p_auth_session, p_staff_hash, p_partner_hash);
  insert into public.studio_spend_turns (turn_id, day, user_id, reserved_micro) values (v_turn, p_day, p_uid, p_ceiling);
  insert into public.studio_spend_sessions (session_id) values (s.id) on conflict do nothing;
  update public.studio_spend_people set reserved_micro = reserved_micro + p_ceiling where day = p_day and user_id = p_uid;
  update public.studio_spend_days set reserved_micro = reserved_micro + p_ceiling where day = p_day;
  update public.studio_sessions set last_activity_at = now() where id = s.id;
  return v_turn;
end $$;--> statement-breakpoint

-- ── asTurn and the cron: the person behind an open turn, re-checked now, or nothing. Takes the turn id only: the
--    person, browser session and step-ups come from the definer-only row written at Send (tenancy audit M). Ids only. ──
create or replace function app_turn_actor(p_turn uuid)
  returns table (tenant_id uuid, partner_id uuid, session_id uuid, user_id uuid, member_id uuid)
  language sql stable security definer set search_path = '' as $$
  select t.tenant_id, t.partner_id, t.session_id, k.user_id, m.member_id
    from public.studio_turns t
    join public.studio_sessions s on s.id = t.session_id and s.tenant_id = t.tenant_id and s.partner_id = t.partner_id
    join public.studio_turn_keys k on k.turn_id = t.id and k.user_id = s.user_id
    cross join lateral public.app_studio_member(k.user_id, k.auth_session, k.partner_hash, t.tenant_id) m
   where t.id = p_turn and t.ended_at is null and t.paused_at is null and t.failed_at is null and s.ended_at is null
     and m.partner_id = s.partner_id and m.member_id = s.partner_member_id
     and public.app_studio_staff_ok(k.user_id, k.auth_session, k.staff_hash)
$$;--> statement-breakpoint

-- ── The session's measured spend so far and its largest request (the budget formula's inputs). Current store only. ──
create or replace function app_studio_spend_of(p_session uuid) returns table (spent_micro bigint, largest_micro bigint)
  language sql stable security definer set search_path = '' as $$
  select coalesce(x.spent_micro, 0), coalesce(x.largest_micro, 0) from public.studio_sessions s
    left join public.studio_spend_sessions x on x.session_id = s.id
   where s.id = p_session and s.tenant_id = public.app_current_tenant()
$$;--> statement-breakpoint

-- ── Close a turn and settle it: ended (end_turn), paused (budget_reached) or failed (a reason). The measured cost is
--    counted UNCAPPED against the reserve's own day rows (unit economics F3, F7); null measured keeps the reserve
--    counted (a turn whose cost is unknown spends nothing more). The turn's person and step-ups are deleted. ──
create or replace function app_studio_close_turn(p_turn uuid, p_how text, p_reason text, p_measured bigint, p_largest bigint) returns boolean
  language plpgsql volatile security definer set search_path = '' as $$
declare t record; r record;
begin
  if p_how not in ('ended', 'paused', 'failed') or (p_how = 'failed') <> (p_reason is not null) then raise exception 'bad_input' using errcode = 'P0001'; end if;
  select x.* into t from public.studio_turns x
   where x.id = p_turn and x.tenant_id = public.app_current_tenant() and x.ended_at is null and x.paused_at is null and x.failed_at is null
   for update;
  if t.id is null then return false; end if;
  update public.studio_turns set
    ended_at = case when p_how = 'ended' then now() end,
    paused_at = case when p_how = 'paused' then now() end,
    failed_at = case when p_how = 'failed' then now() end,
    failed_reason = case when p_how = 'failed' then p_reason end
   where id = t.id;
  delete from public.studio_turn_keys where turn_id = t.id;
  if p_measured is not null and p_measured >= 0 then
    select * into r from public.studio_spend_turns where turn_id = t.id and settled_at is null for update;
    if r.turn_id is not null then
      update public.studio_spend_turns set measured_micro = p_measured, settled_at = now() where turn_id = t.id;
      update public.studio_spend_people set reserved_micro = greatest(0, reserved_micro - r.reserved_micro), measured_micro = measured_micro + p_measured
       where day = r.day and user_id = r.user_id;
      update public.studio_spend_days set reserved_micro = greatest(0, reserved_micro - r.reserved_micro), measured_micro = measured_micro + p_measured
       where day = r.day;
      update public.studio_spend_sessions set spent_micro = spent_micro + p_measured, largest_micro = greatest(largest_micro, coalesce(p_largest, 0))
       where session_id = t.session_id;
    end if;
  end if;
  update public.studio_sessions set last_activity_at = now() where id = t.session_id;
  return true;
end $$;--> statement-breakpoint

-- ── The cron's work list across stores: ids and a kind only (tenancy audit H4; the S4 rule). `advance`: an open
--    session with an open turn, oldest read first; `end`: an open session to check for its end; `clean`: ended, its key,
--    vault and file not yet gone; `delete`: ended over 30 days, not yet deleted at Anthropic. Each kind capped. ──
create or replace function app_studio_due(p_limit integer) returns table (session_id uuid, tenant_id uuid, kind text)
  language sql stable security definer set search_path = '' as $$
  (select s.id, s.tenant_id, 'advance' from public.studio_sessions s
    where s.ended_at is null and exists (select 1 from public.studio_turns t where t.session_id = s.id and t.ended_at is null and t.paused_at is null and t.failed_at is null)
    order by s.last_read_at nulls first limit greatest(1, least(p_limit, 100)))
  union all
  (select s.id, s.tenant_id, 'end' from public.studio_sessions s
    where s.ended_at is null and not exists (select 1 from public.studio_turns t where t.session_id = s.id and t.ended_at is null and t.paused_at is null and t.failed_at is null)
    order by s.last_activity_at limit greatest(1, least(p_limit, 100)))
  union all
  (select s.id, s.tenant_id, 'clean' from public.studio_sessions s where s.ended_at is not null and s.cleaned_at is null
    order by s.ended_at limit greatest(1, least(p_limit, 100)))
  union all
  (select s.id, s.tenant_id, 'delete' from public.studio_sessions s
    where s.ended_at < now() - interval '30 days' and s.cleaned_at is not null and s.deleted_at is null
    order by s.ended_at limit greatest(1, least(p_limit, 100)))
$$;--> statement-breakpoint

revoke all on function app_studio_staff_ok(uuid, uuid, text), app_studio_member(uuid, uuid, text, uuid), app_studio_partner(uuid, uuid, text, text),
  app_studio_bind(uuid), app_studio_open_turn(uuid, uuid, uuid, text, text, bigint, text, bigint, bigint, integer, boolean), app_turn_actor(uuid),
  app_studio_spend_of(uuid), app_studio_close_turn(uuid, text, text, bigint, bigint), app_studio_due(integer)
  from public, anon, authenticated, service_role, frata_app, frata_admin, frata_builder;--> statement-breakpoint
grant execute on function app_studio_partner(uuid, uuid, text, text), app_studio_bind(uuid),
  app_studio_open_turn(uuid, uuid, uuid, text, text, bigint, text, bigint, bigint, integer, boolean), app_turn_actor(uuid),
  app_studio_spend_of(uuid), app_studio_close_turn(uuid, text, text, bigint, bigint), app_studio_due(integer) to frata_app;--> statement-breakpoint
grant usage on sequence studio_messages_seq_seq to frata_app;
