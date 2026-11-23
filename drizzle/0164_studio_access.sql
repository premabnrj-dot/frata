-- Custom SQL migration file, put your code below! --
-- ═══ STUDIO'S AGENT V3a: ACCESS (docs/plans/2026-11-22-v3a-runtime.md R2; ADR-0020 § 4–5 as amended 2026-11-22;
--     the R2 tenancy audit folded in 2026-11-23) ═══════════════════════════════════════════════════════════════════
-- Shop tables (studio_sessions, studio_turns, studio_tool_calls, studio_proposals, studio_messages): frata_app only,
-- through two policies each: the usual permissive one on the store, and a RESTRICTIVE one to public on the store AND
-- the partner Studio is bound to in THIS transaction (app_current_partner()).
-- THE BIND IS HELD BY THE DATABASE, not by code: app_current_partner() answers only for a row in `studio_binds` whose
-- random token sits in the `app.studio_bind` setting AND whose transaction id is this transaction's, for the current
-- store. Only two definers write that row: app_studio_partner (the signed-in person's live partner membership on THIS
-- store: Frrata staff and partner step-ups both live, an owner or an assigned Lead) and app_studio_bind_turn (an open
-- turn whose person app_turn_actor still answers for). Setting a variable by hand binds nothing.
-- Studio IGNORES the passkeys-off switch (0151): it always needs the real staff and partner step-ups, which sign-out
-- deletes, so a cron turn ends when its person signs out; while the switch is on, Studio refuses.
-- No grant to frata_builder or frata_admin in V3a. frata_app never deletes; turns close only through definers that
-- settle their spend. Platform scope (studio_turn_keys, studio_spend_*, studio_binds): no role holds any privilege; a
-- restrictive deny-all policy; read and written only by the definers below (the partner_stepups pattern, 0129).
-- Every definer: security definer, search_path '', EXECUTE revoked from public, anon, authenticated, service_role,
-- frata_builder and frata_admin, granted to frata_app only where the app calls it. Ids only to the cron.

-- ── Platform scope: definers only ───────────────────────────────────────────────────────────────────────────────────
alter table studio_turn_keys enable row level security;--> statement-breakpoint
alter table studio_spend_sessions enable row level security;--> statement-breakpoint
alter table studio_spend_turns enable row level security;--> statement-breakpoint
alter table studio_spend_days enable row level security;--> statement-breakpoint
alter table studio_spend_people enable row level security;--> statement-breakpoint
alter table studio_binds enable row level security;--> statement-breakpoint
revoke all on studio_turn_keys, studio_spend_sessions, studio_spend_turns, studio_spend_days, studio_spend_people, studio_binds
  from public, anon, authenticated, service_role, frata_app, frata_admin, frata_builder;--> statement-breakpoint
create policy definer_only on studio_turn_keys as restrictive for all to public using (false) with check (false);--> statement-breakpoint
create policy definer_only on studio_spend_sessions as restrictive for all to public using (false) with check (false);--> statement-breakpoint
create policy definer_only on studio_spend_turns as restrictive for all to public using (false) with check (false);--> statement-breakpoint
create policy definer_only on studio_spend_days as restrictive for all to public using (false) with check (false);--> statement-breakpoint
create policy definer_only on studio_spend_people as restrictive for all to public using (false) with check (false);--> statement-breakpoint
create policy definer_only on studio_binds as restrictive for all to public using (false) with check (false);--> statement-breakpoint

-- ── The partner this transaction is bound to, or null ───────────────────────────────────────────────────────────────
create or replace function app_current_partner() returns uuid
  language sql stable security definer set search_path = '' as $$
  select b.partner_id from public.studio_binds b
   where b.token = nullif(current_setting('app.studio_bind', true), '')
     and b.xact = pg_current_xact_id_if_assigned()::text
     and b.tenant_id = public.app_current_tenant()
$$;--> statement-breakpoint

-- Internal: write this transaction's bind (and sweep binds over an hour old).
create or replace function app_studio_write_bind(p_tenant uuid, p_partner uuid) returns void
  language plpgsql volatile security definer set search_path = '' as $$
declare v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  delete from public.studio_binds where created_at < now() - interval '1 hour';
  insert into public.studio_binds (token, xact, tenant_id, partner_id) values (v_token, pg_current_xact_id()::text, p_tenant, p_partner);
  perform set_config('app.studio_bind', v_token, true);
end $$;--> statement-breakpoint

-- ── Shop tables ──────────────────────────────────────────────────────────────────────────────────────────────────────
revoke all on studio_sessions, studio_turns, studio_tool_calls, studio_proposals, studio_messages
  from public, anon, authenticated, service_role, frata_builder, frata_admin;--> statement-breakpoint
grant select, insert on studio_sessions to frata_app;--> statement-breakpoint
grant update (runtime_id, vault_id, file_id, build_key_id, event_cursor, advancing_until, last_read_at, last_activity_at)
  on studio_sessions to frata_app;--> statement-breakpoint
grant select on studio_turns to frata_app;--> statement-breakpoint
grant update (started_at, user_message_event_id) on studio_turns to frata_app;--> statement-breakpoint
grant select, insert on studio_tool_calls to frata_app;--> statement-breakpoint
grant update (executed_at, result, is_error, answered_at) on studio_tool_calls to frata_app;--> statement-breakpoint
grant select, insert on studio_proposals to frata_app;--> statement-breakpoint
grant update (applied_at, applied_by, refused_at, refused_reason, dismissed_at) on studio_proposals to frata_app;--> statement-breakpoint
grant select, insert on studio_messages to frata_app;--> statement-breakpoint
grant usage on sequence studio_messages_seq_seq to frata_app;--> statement-breakpoint
grant execute on function app_current_partner() to frata_app;--> statement-breakpoint

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

-- ── Internal: live Frrata staff on this browser session: the REAL staff step-up (never the passkeys-off switch). ──
create or replace function app_studio_staff_ok(p_uid uuid, p_session uuid, p_hash text) returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_staff ps where ps.user_id = p_uid)
     and public.app_staff_live_stepup(p_uid, p_session, p_hash) is not null
$$;--> statement-breakpoint

-- ── Internal: the person as a partner on store p_tenant, without the step-up (the person still there at all). An
--    owner or a Lead of a live, approved partner; a `members` row on that store with role partner pointing at that
--    membership (never a support visit, never the store's own owner); the store's live link to that partner; a Lead
--    assigned to the store. ──
create or replace function app_studio_person(p_uid uuid, p_tenant uuid) returns table (member_id uuid, partner_id uuid)
  language sql stable security definer set search_path = '' as $$
  select me.member_id, me.partner_id from public.app_pm_live(p_uid) me
   where me.role in ('owner', 'lead')
     and exists (select 1 from public.members m where m.tenant_id = p_tenant and m.user_id = p_uid and m.role = 'partner' and m.partner_member_id = me.member_id)
     and exists (select 1 from public.partner_links l where l.tenant_id = p_tenant and l.partner_id = me.partner_id and l.removed_at is null)
     and (me.role = 'owner' or exists (select 1 from public.partner_assignments a where a.partner_member_id = me.member_id and a.tenant_id = p_tenant))
$$;--> statement-breakpoint

-- ── Internal: as app_studio_person, with the REAL partner step-up on this browser session live. ──
create or replace function app_studio_member(p_uid uuid, p_session uuid, p_hash text, p_tenant uuid) returns table (member_id uuid, partner_id uuid)
  language sql stable security definer set search_path = '' as $$
  select p.member_id, p.partner_id from public.app_studio_person(p_uid, p_tenant) p
   where public.app_partner_live_stepup(p_uid, p_session, p_hash) is not null
$$;--> statement-breakpoint

-- ── withStudio: binds the signed-in person's partner on the current store, or binds nothing (null). ──
create or replace function app_studio_partner(p_uid uuid, p_session uuid, p_staff_hash text, p_partner_hash text) returns uuid
  language plpgsql volatile security definer set search_path = '' as $$
declare v_t uuid := public.app_current_tenant(); v_p uuid;
begin
  if v_t is null or p_uid is null or p_session is null then return null; end if;
  if not public.app_studio_staff_ok(p_uid, p_session, p_staff_hash) then return null; end if;
  select m.partner_id into v_p from public.app_studio_member(p_uid, p_session, p_partner_hash, v_t) m;
  if v_p is null then return null; end if;
  perform public.app_studio_write_bind(v_t, v_p);
  return v_p;
end $$;--> statement-breakpoint

-- ── asTurn and the cron's advance: an open turn on the current store whose person is still live binds its partner. ──
create or replace function app_studio_bind_turn(p_turn uuid) returns uuid
  language plpgsql volatile security definer set search_path = '' as $$
declare r record;
begin
  select a.* into r from public.app_turn_actor(p_turn) a where a.tenant_id = public.app_current_tenant();
  if r.partner_id is null then return null; end if;
  perform public.app_studio_write_bind(r.tenant_id, r.partner_id);
  return r.partner_id;
end $$;--> statement-breakpoint

-- ── Send: one turn, its person and step-ups kept apart, its reserve held against the day caps (inside withStudio,
--    after app_studio_partner bound the partner). Locks: the person's day row, then the platform's, each inserted
--    first so FOR UPDATE has a row to hold. Raises a refusal code. ──
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

-- ── The person behind an open turn, re-checked now, or nothing. Takes the turn id only: the person, browser session
--    and step-ups come from the definer-only row written at Send. Ids only. ──
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

-- ── The bound session's measured spend so far and its largest request (the budget formula's inputs). ──
create or replace function app_studio_spend_of(p_session uuid) returns table (spent_micro bigint, largest_micro bigint)
  language sql stable security definer set search_path = '' as $$
  select coalesce(x.spent_micro, 0), coalesce(x.largest_micro, 0) from public.studio_sessions s
    left join public.studio_spend_sessions x on x.session_id = s.id
   where s.id = p_session and s.tenant_id = public.app_current_tenant() and s.partner_id = public.app_current_partner()
$$;--> statement-breakpoint

-- Internal: settle one turn's spend (the measured cost uncapped on the reserve's own day; null keeps the reserve).
create or replace function app_studio_settle(p_turn uuid, p_session uuid, p_measured bigint, p_largest bigint) returns void
  language plpgsql volatile security definer set search_path = '' as $$
declare r record;
begin
  delete from public.studio_turn_keys where turn_id = p_turn;
  if p_measured is null or p_measured < 0 then return; end if;
  select * into r from public.studio_spend_turns where turn_id = p_turn and settled_at is null for update;
  if r.turn_id is null then return; end if;
  update public.studio_spend_turns set measured_micro = p_measured, settled_at = now() where turn_id = p_turn;
  update public.studio_spend_people set reserved_micro = greatest(0, reserved_micro - r.reserved_micro), measured_micro = measured_micro + p_measured
   where day = r.day and user_id = r.user_id;
  update public.studio_spend_days set reserved_micro = greatest(0, reserved_micro - r.reserved_micro), measured_micro = measured_micro + p_measured
   where day = r.day;
  update public.studio_spend_sessions set spent_micro = spent_micro + p_measured, largest_micro = greatest(largest_micro, coalesce(p_largest, 0))
   where session_id = p_session;
end $$;--> statement-breakpoint

-- ── Close a turn of the BOUND partner and settle it: ended (end_turn), paused (budget_reached) or failed (a reason). ──
create or replace function app_studio_close_turn(p_turn uuid, p_how text, p_reason text, p_measured bigint, p_largest bigint) returns boolean
  language plpgsql volatile security definer set search_path = '' as $$
declare t record;
begin
  if p_how not in ('ended', 'paused', 'failed') or (p_how = 'failed') <> (p_reason is not null) then raise exception 'bad_input' using errcode = 'P0001'; end if;
  select x.* into t from public.studio_turns x
   where x.id = p_turn and x.tenant_id = public.app_current_tenant() and x.partner_id = public.app_current_partner()
     and x.ended_at is null and x.paused_at is null and x.failed_at is null
   for update;
  if t.id is null then return false; end if;
  update public.studio_turns set
    ended_at = case when p_how = 'ended' then now() end,
    paused_at = case when p_how = 'paused' then now() end,
    failed_at = case when p_how = 'failed' then now() end,
    failed_reason = case when p_how = 'failed' then p_reason end
   where id = t.id;
  perform public.app_studio_settle(t.id, t.session_id, p_measured, p_largest);
  update public.studio_sessions set last_activity_at = now() where id = t.session_id;
  return true;
end $$;--> statement-breakpoint

-- ── End a session on the current store (the person's Stop through withStudio, or the cron: switch, idle, age, a gone
--    person, a failed start, a restart). Its open turn fails with the matching reason and settles at the measured cost
--    given (null keeps the reserve counted). No partner bind needed: it reads no partner's rows and ends work only. ──
create or replace function app_studio_end_session(p_session uuid, p_reason text, p_measured bigint) returns boolean
  language plpgsql volatile security definer set search_path = '' as $$
declare s record; t record;
begin
  if p_reason not in ('stopped', 'switch', 'idle', 'age', 'actor', 'start_failed', 'restart') then raise exception 'bad_input' using errcode = 'P0001'; end if;
  select x.* into s from public.studio_sessions x where x.id = p_session and x.tenant_id = public.app_current_tenant() and x.ended_at is null for update;
  if s.id is null then return false; end if;
  select x.* into t from public.studio_turns x where x.session_id = s.id and x.ended_at is null and x.paused_at is null and x.failed_at is null for update;
  if t.id is not null then
    update public.studio_turns set failed_at = now(),
      failed_reason = case p_reason when 'stopped' then 'runtime' when 'switch' then 'switch' when 'actor' then 'actor' when 'start_failed' then 'start' else 'expired' end
     where id = t.id;
    perform public.app_studio_settle(t.id, s.id, p_measured, null);
  end if;
  update public.studio_sessions set ended_at = now(), end_reason = p_reason where id = s.id;
  return true;
end $$;--> statement-breakpoint

-- ── The cron's facts about one session of the current store: times and whether its person is still there (without
--    the step-up). No partner's content. ──
create or replace function app_studio_session_facts(p_session uuid)
  returns table (created_at timestamptz, last_activity_at timestamptz, ended_at timestamptz, cleaned_at timestamptz, person_live boolean)
  language sql stable security definer set search_path = '' as $$
  select s.created_at, s.last_activity_at, s.ended_at, s.cleaned_at,
         exists (select 1 from public.app_studio_person(s.user_id, s.tenant_id) p where p.partner_id = s.partner_id and p.member_id = s.partner_member_id)
           and exists (select 1 from public.platform_staff ps where ps.user_id = s.user_id)
    from public.studio_sessions s where s.id = p_session and s.tenant_id = public.app_current_tenant()
$$;--> statement-breakpoint

-- ── An ENDED session's vendor ids and build key, for the cron to clean up; then mark it cleaned or deleted. ──
create or replace function app_studio_cleanup_of(p_session uuid)
  returns table (runtime_id text, vault_id text, file_id text, build_key_id uuid)
  language sql stable security definer set search_path = '' as $$
  select s.runtime_id, s.vault_id, s.file_id, s.build_key_id from public.studio_sessions s
   where s.id = p_session and s.tenant_id = public.app_current_tenant() and s.ended_at is not null
$$;--> statement-breakpoint
create or replace function app_studio_mark(p_session uuid, p_what text) returns boolean
  language plpgsql volatile security definer set search_path = '' as $$
declare n integer;
begin
  if p_what = 'cleaned' then
    update public.studio_sessions set cleaned_at = now() where id = p_session and tenant_id = public.app_current_tenant() and ended_at is not null and cleaned_at is null;
  elsif p_what = 'deleted' then
    update public.studio_sessions set deleted_at = now() where id = p_session and tenant_id = public.app_current_tenant() and cleaned_at is not null and deleted_at is null;
  else raise exception 'bad_input' using errcode = 'P0001'; end if;
  get diagnostics n = row_count;
  return n = 1;
end $$;--> statement-breakpoint

-- ── The cron's work list across stores: ids and a kind only (tenancy audit H4; the S4 rule). `advance`: an open turn,
--    oldest read first (with its turn id); `end`: an open session with no open turn; `clean`: ended, not yet cleaned;
--    `delete`: ended over 30 days, not yet deleted at Anthropic. Each kind capped. ──
create or replace function app_studio_due(p_limit integer) returns table (session_id uuid, tenant_id uuid, turn_id uuid, kind text)
  language sql stable security definer set search_path = '' as $$
  (select s.id, s.tenant_id, t.id, 'advance' from public.studio_sessions s
     join public.studio_turns t on t.session_id = s.id and t.ended_at is null and t.paused_at is null and t.failed_at is null
    where s.ended_at is null
    order by s.last_read_at nulls first limit greatest(1, least(p_limit, 100)))
  union all
  (select s.id, s.tenant_id, null::uuid, 'end' from public.studio_sessions s
    where s.ended_at is null and not exists (select 1 from public.studio_turns t where t.session_id = s.id and t.ended_at is null and t.paused_at is null and t.failed_at is null)
    order by s.last_activity_at limit greatest(1, least(p_limit, 100)))
  union all
  (select s.id, s.tenant_id, null::uuid, 'clean' from public.studio_sessions s where s.ended_at is not null and s.cleaned_at is null
    order by s.ended_at limit greatest(1, least(p_limit, 100)))
  union all
  (select s.id, s.tenant_id, null::uuid, 'delete' from public.studio_sessions s
    where s.ended_at < now() - interval '30 days' and s.cleaned_at is not null and s.deleted_at is null
    order by s.ended_at limit greatest(1, least(p_limit, 100)))
$$;--> statement-breakpoint

revoke all on function app_current_partner(), app_studio_write_bind(uuid, uuid), app_studio_staff_ok(uuid, uuid, text), app_studio_person(uuid, uuid),
  app_studio_member(uuid, uuid, text, uuid), app_studio_partner(uuid, uuid, text, text), app_studio_bind_turn(uuid),
  app_studio_open_turn(uuid, uuid, uuid, text, text, bigint, text, bigint, bigint, integer, boolean), app_turn_actor(uuid),
  app_studio_spend_of(uuid), app_studio_settle(uuid, uuid, bigint, bigint), app_studio_close_turn(uuid, text, text, bigint, bigint),
  app_studio_end_session(uuid, text, bigint), app_studio_session_facts(uuid), app_studio_cleanup_of(uuid), app_studio_mark(uuid, text),
  app_studio_due(integer)
  from public, anon, authenticated, service_role, frata_app, frata_admin, frata_builder;--> statement-breakpoint
grant execute on function app_current_partner(), app_studio_partner(uuid, uuid, text, text), app_studio_bind_turn(uuid),
  app_studio_open_turn(uuid, uuid, uuid, text, text, bigint, text, bigint, bigint, integer, boolean), app_turn_actor(uuid),
  app_studio_spend_of(uuid), app_studio_close_turn(uuid, text, text, bigint, bigint), app_studio_end_session(uuid, text, bigint),
  app_studio_session_facts(uuid), app_studio_cleanup_of(uuid), app_studio_mark(uuid, text), app_studio_due(integer) to frata_app;
