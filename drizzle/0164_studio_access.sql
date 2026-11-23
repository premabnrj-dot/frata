-- Custom SQL migration file, put your code below! --
-- ═══ STUDIO'S AGENT V3a: ACCESS (docs/plans/2026-11-22-v3a-runtime.md R2; ADR-0020 § 4–5 as amended 2026-11-22;
--     the R2 tenancy audits and security review folded in 2026-11-23) ════════════════════════════════════════════════
-- Shop tables (studio_sessions, studio_turns, studio_tool_calls, studio_proposals, studio_messages): frata_app only,
-- through two policies each: the usual permissive one on the store, and a RESTRICTIVE one to public on the store AND
-- the partner Studio is bound to in THIS transaction (app_current_partner()).
-- THE BIND IS HELD BY THE DATABASE: app_current_partner() answers only for a row in `studio_binds` whose random token
-- sits in the `app.studio_bind` setting AND whose transaction id is this transaction's, for the current store. The bind
-- proves a PERSON, not only a partner: it names the person, their partner membership and the two step-up rows that
-- proved them. Only two definers write it: app_studio_partner (the signed-in person: Frrata staff and partner step-ups
-- both REAL and live, an owner or an assigned Lead, on THIS store) and app_studio_bind_turn (an open turn whose person
-- app_turn_actor still answers for). Setting a variable by hand binds nothing.
-- Sessions are made, their vendor ids and build key recorded, turns opened and closed, spend settled and sessions
-- ended only through definers, each matching the bound person; frata_app writes tool calls, proposals and lines (under
-- a bind) and its own bookkeeping columns. Studio IGNORES the passkeys-off switch (0151): a turn keeps the ids of the
-- step-up rows that proved its person; sign-out or expiry ends them, and so the turn.
-- No grant to frata_builder or frata_admin in V3a. frata_app never deletes. Platform scope (studio_turn_keys,
-- studio_spend_*, studio_binds): no role holds any privilege; a restrictive deny-all policy; definers only.
-- Every definer: security definer, search_path '', EXECUTE revoked from public, anon, authenticated, service_role,
-- frata_builder and frata_admin, granted to frata_app only where the app calls it. Ids only to the cron.
-- The hard ceilings below hold whatever the code passes (security review M1): a turn ≤ $5, a person's day ≤ $50, the
-- platform's day ≤ $200, ≤ 70 sessions open (spec § 6.7, decision 29).

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

-- ── The bind of this transaction ─────────────────────────────────────────────────────────────────────────────────────
-- Internal: the bind row of this transaction on the current store, or nothing.
create or replace function app_studio_bound() returns setof public.studio_binds
  language sql stable security definer set search_path = '' as $$
  select b.* from public.studio_binds b
   where b.token = nullif(current_setting('app.studio_bind', true), '')
     and b.xact = pg_current_xact_id_if_assigned()::text
     and b.tenant_id = public.app_current_tenant()
$$;--> statement-breakpoint
create or replace function app_current_partner() returns uuid
  language sql stable security definer set search_path = '' as $$ select b.partner_id from public.app_studio_bound() b $$;--> statement-breakpoint
-- Internal: write this transaction's bind.
create or replace function app_studio_write_bind(p_tenant uuid, p_partner uuid, p_user uuid, p_member uuid, p_staff uuid, p_partner_stepup uuid) returns void
  language plpgsql volatile security definer set search_path = '' as $$
declare v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  insert into public.studio_binds (token, xact, tenant_id, partner_id, user_id, member_id, staff_stepup_id, partner_stepup_id)
    values (v_token, pg_current_xact_id()::text, p_tenant, p_partner, p_user, p_member, p_staff, p_partner_stepup);
  perform set_config('app.studio_bind', v_token, true);
end $$;--> statement-breakpoint
-- The cron: binds over an hour old are swept (never in a page's read: security review L6).
create or replace function app_studio_sweep_binds() returns integer
  language plpgsql volatile security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.studio_binds where created_at < now() - interval '1 hour';
  get diagnostics n = row_count;
  return n;
end $$;--> statement-breakpoint

-- ── Shop tables ──────────────────────────────────────────────────────────────────────────────────────────────────────
revoke all on studio_sessions, studio_turns, studio_tool_calls, studio_proposals, studio_messages
  from public, anon, authenticated, service_role, frata_builder, frata_admin;--> statement-breakpoint
revoke all on sequence studio_messages_seq_seq from public, anon, authenticated, service_role, frata_builder, frata_admin;--> statement-breakpoint
grant select on studio_sessions to frata_app;--> statement-breakpoint
grant update (event_cursor, advancing_until, last_read_at, last_activity_at) on studio_sessions to frata_app;--> statement-breakpoint
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

-- ── Internal: the person as a partner on store p_tenant (without step-ups). An owner or a Lead of a live, approved
--    partner; a `members` row on that store with role partner pointing at that membership (never a support visit,
--    never the store's own owner); the store's live link to that partner; a Lead assigned to the store. ──
create or replace function app_studio_person(p_uid uuid, p_tenant uuid) returns table (member_id uuid, partner_id uuid)
  language sql stable security definer set search_path = '' as $$
  select me.member_id, me.partner_id from public.app_pm_live(p_uid) me
   where me.role in ('owner', 'lead')
     and exists (select 1 from public.members m where m.tenant_id = p_tenant and m.user_id = p_uid and m.role = 'partner' and m.partner_member_id = me.member_id)
     and exists (select 1 from public.partner_links l where l.tenant_id = p_tenant and l.partner_id = me.partner_id and l.removed_at is null)
     and (me.role = 'owner' or exists (select 1 from public.partner_assignments a where a.partner_member_id = me.member_id and a.tenant_id = p_tenant))
$$;--> statement-breakpoint

-- ── Internal: the person on store p_tenant proved by the two step-up ROWS: Frrata staff with a live staff step-up, and
--    a live partner step-up of the same membership. The REAL step-ups, never the passkeys-off switch. ──
create or replace function app_studio_proved(p_uid uuid, p_tenant uuid, p_staff uuid, p_partner_stepup uuid) returns table (member_id uuid, partner_id uuid)
  language sql stable security definer set search_path = '' as $$
  select p.member_id, p.partner_id from public.app_studio_person(p_uid, p_tenant) p
   where exists (select 1 from public.platform_staff ps where ps.user_id = p_uid)
     and exists (select 1 from public.staff_stepups s where s.id = p_staff and s.user_id = p_uid and s.expires_at > now())
     and exists (select 1 from public.partner_stepups s where s.id = p_partner_stepup and s.user_id = p_uid and s.partner_member_id = p.member_id and s.expires_at > now())
$$;--> statement-breakpoint

-- ── withStudio: binds the signed-in person on the current store, or binds nothing (null). The browser session and the
--    two cookie hashes find the step-up rows (the same match app_staff_live_stepup and app_partner_live_stepup make). ──
create or replace function app_studio_partner(p_uid uuid, p_session uuid, p_staff_hash text, p_partner_hash text) returns uuid
  language plpgsql volatile security definer set search_path = '' as $$
declare v_t uuid := public.app_current_tenant(); v_staff uuid; v_ps uuid; m record;
begin
  if v_t is null or p_uid is null or p_session is null then return null; end if;
  select s.id into v_staff from public.staff_stepups s
   where s.user_id = p_uid and s.session_id = p_session and s.token_hash = p_staff_hash and s.expires_at > now() order by s.created_at desc limit 1;
  select s.id into v_ps from public.partner_stepups s
   where s.user_id = p_uid and s.session_id = p_session and s.token_hash = p_partner_hash and s.expires_at > now() order by s.created_at desc limit 1;
  if v_staff is null or v_ps is null then return null; end if;
  select x.* into m from public.app_studio_proved(p_uid, v_t, v_staff, v_ps) x;
  if m.partner_id is null then return null; end if;
  perform public.app_studio_write_bind(v_t, m.partner_id, p_uid, m.member_id, v_staff, v_ps);
  return m.partner_id;
end $$;--> statement-breakpoint

-- ── The person behind an open turn on the CURRENT store, re-checked now, or nothing. Ids only. ──
create or replace function app_turn_actor(p_turn uuid)
  returns table (tenant_id uuid, partner_id uuid, session_id uuid, user_id uuid, member_id uuid)
  language sql stable security definer set search_path = '' as $$
  select t.tenant_id, t.partner_id, t.session_id, k.user_id, m.member_id
    from public.studio_turns t
    join public.studio_sessions s on s.id = t.session_id and s.tenant_id = t.tenant_id and s.partner_id = t.partner_id
    join public.studio_turn_keys k on k.turn_id = t.id and k.user_id = s.user_id
    cross join lateral public.app_studio_proved(k.user_id, t.tenant_id, k.staff_stepup_id, k.partner_stepup_id) m
   where t.id = p_turn and t.tenant_id = public.app_current_tenant()
     and t.ended_at is null and t.paused_at is null and t.failed_at is null and s.ended_at is null
     and m.partner_id = s.partner_id and m.member_id = s.partner_member_id
$$;--> statement-breakpoint

-- ── asTurn and the cron's advance: an open turn on the current store whose person is still live binds them. ──
create or replace function app_studio_bind_turn(p_turn uuid) returns uuid
  language plpgsql volatile security definer set search_path = '' as $$
declare r record; k record;
begin
  select a.* into r from public.app_turn_actor(p_turn) a;
  if r.partner_id is null then return null; end if;
  select x.* into k from public.studio_turn_keys x where x.turn_id = p_turn;
  perform public.app_studio_write_bind(r.tenant_id, r.partner_id, r.user_id, r.member_id, k.staff_stepup_id, k.partner_stepup_id);
  return r.partner_id;
end $$;--> statement-breakpoint

-- ── A session for the bound person on the current store (one open a person a store: a unique index). ──
create or replace function app_studio_new_session() returns uuid
  language plpgsql volatile security definer set search_path = '' as $$
declare b record; v uuid;
begin
  select x.* into b from public.app_studio_bound() x;
  if b.token is null or b.staff_stepup_id is null then raise exception 'not_bound' using errcode = 'P0001'; end if;
  insert into public.studio_sessions (tenant_id, partner_id, partner_member_id, user_id)
    values (b.tenant_id, b.partner_id, b.member_id, b.user_id) returning id into v;
  return v;
end $$;--> statement-breakpoint

-- Internal: the bound person's own open session on the current store, held (the lock order everywhere: session, turn,
-- person's day, platform's day).
create or replace function app_studio_own_session(p_session uuid) returns public.studio_sessions
  language plpgsql volatile security definer set search_path = '' as $$
declare b record; s public.studio_sessions;
begin
  select x.* into b from public.app_studio_bound() x;
  if b.token is null then raise exception 'not_bound' using errcode = 'P0001'; end if;
  select x.* into s from public.studio_sessions x
   where x.id = p_session and x.tenant_id = b.tenant_id and x.partner_id = b.partner_id and x.user_id = b.user_id and x.partner_member_id = b.member_id
   for update;
  if s.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  return s;
end $$;--> statement-breakpoint

-- ── The bound person's session's vendor ids and build key, each written ONCE (security review L1). The key must be a
--    session build key of this store made by this person. ──
create or replace function app_studio_set_vendor(p_session uuid, p_kind text, p_value text) returns boolean
  language plpgsql volatile security definer set search_path = '' as $$
declare s public.studio_sessions := public.app_studio_own_session(p_session); n integer;
begin
  if p_value is null or length(p_value) not between 4 and 200 or p_value !~ '^[A-Za-z0-9_-]+$' then raise exception 'bad_input' using errcode = 'P0001'; end if;
  if p_kind = 'runtime' then update public.studio_sessions set runtime_id = p_value where id = s.id and runtime_id is null;
  elsif p_kind = 'vault' then update public.studio_sessions set vault_id = p_value where id = s.id and vault_id is null;
  elsif p_kind = 'file' then update public.studio_sessions set file_id = p_value where id = s.id and file_id is null;
  else raise exception 'bad_input' using errcode = 'P0001'; end if;
  get diagnostics n = row_count;
  return n = 1;
end $$;--> statement-breakpoint
create or replace function app_studio_set_key(p_session uuid, p_key uuid) returns boolean
  language plpgsql volatile security definer set search_path = '' as $$
declare s public.studio_sessions := public.app_studio_own_session(p_session); n integer;
begin
  if s.ended_at is not null then return false; end if;
  update public.studio_sessions x set build_key_id = p_key
   where x.id = s.id and x.build_key_id is null
     and exists (select 1 from public.storefront_keys k where k.id = p_key and k.tenant_id = s.tenant_id and k.kind = 'build'
                   and k.purpose = 'session' and k.created_by = s.user_id and k.revoked_at is null);
  get diagnostics n = row_count;
  return n = 1;
end $$;--> statement-breakpoint

-- ── Send: one turn on the bound person's own open session, its person kept as the step-up rows that proved them, its
--    reserve held against the day caps. The day is India's, worked out here; a new session is one with no turn yet;
--    every cap is required and held to the ceilings above. Raises a refusal code. ──
create or replace function app_studio_open_turn(p_session uuid, p_ceiling bigint, p_person_cap bigint, p_platform_cap bigint, p_open_cap integer) returns uuid
  language plpgsql volatile security definer set search_path = '' as $$
declare b record; s public.studio_sessions; v_turn uuid; pr record; dr record; v_open integer; v_day text; v_new boolean;
begin
  if p_ceiling is null or p_person_cap is null or p_platform_cap is null or p_open_cap is null
     or p_ceiling <= 0 or p_ceiling > 5000000 or p_person_cap > 50000000 or p_platform_cap > 200000000 or p_open_cap > 70 then
    raise exception 'bad_input' using errcode = 'P0001';
  end if;
  s := public.app_studio_own_session(p_session);
  if s.ended_at is not null then raise exception 'not_found' using errcode = 'P0001'; end if;
  select x.* into b from public.app_studio_bound() x;
  if b.staff_stepup_id is null or b.partner_stepup_id is null
     or not exists (select 1 from public.app_studio_proved(b.user_id, b.tenant_id, b.staff_stepup_id, b.partner_stepup_id)) then
    raise exception 'not_bound' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.studio_turns t where t.session_id = s.id and t.ended_at is null and t.paused_at is null and t.failed_at is null) then
    raise exception 'turn_open' using errcode = 'P0001';
  end if;
  v_day := to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD');
  v_new := not exists (select 1 from public.studio_turns t where t.session_id = s.id);
  insert into public.studio_spend_people (day, user_id) values (v_day, s.user_id) on conflict do nothing;
  insert into public.studio_spend_days (day) values (v_day) on conflict do nothing;
  select * into pr from public.studio_spend_people where day = v_day and user_id = s.user_id for update;
  select * into dr from public.studio_spend_days where day = v_day for update;
  if v_new then
    select count(*) into v_open from public.studio_sessions x where x.ended_at is null and x.id <> s.id;
    if v_open >= p_open_cap then raise exception 'sessions' using errcode = 'P0001'; end if;
  end if;
  if pr.reserved_micro + pr.measured_micro + p_ceiling > p_person_cap then raise exception 'person_day' using errcode = 'P0001'; end if;
  if dr.reserved_micro + dr.measured_micro + p_ceiling > p_platform_cap then raise exception 'platform_day' using errcode = 'P0001'; end if;
  insert into public.studio_turns (tenant_id, partner_id, session_id) values (s.tenant_id, s.partner_id, s.id) returning id into v_turn;
  insert into public.studio_turn_keys (turn_id, user_id, staff_stepup_id, partner_stepup_id) values (v_turn, s.user_id, b.staff_stepup_id, b.partner_stepup_id);
  insert into public.studio_spend_turns (turn_id, day, user_id, reserved_micro) values (v_turn, v_day, s.user_id, p_ceiling);
  insert into public.studio_spend_sessions (session_id) values (s.id) on conflict do nothing;
  update public.studio_spend_people set reserved_micro = reserved_micro + p_ceiling where day = v_day and user_id = s.user_id;
  update public.studio_spend_days set reserved_micro = reserved_micro + p_ceiling where day = v_day;
  update public.studio_sessions set last_activity_at = now() where id = s.id;
  return v_turn;
end $$;--> statement-breakpoint

-- ── The bound person's session's measured spend so far and its largest request (the budget formula's inputs). ──
create or replace function app_studio_spend_of(p_session uuid) returns table (spent_micro bigint, largest_micro bigint)
  language sql stable security definer set search_path = '' as $$
  select coalesce(x.spent_micro, 0), coalesce(x.largest_micro, 0) from public.studio_sessions s
    join public.app_studio_bound() b on b.tenant_id = s.tenant_id and b.partner_id = s.partner_id and b.user_id = s.user_id
    left join public.studio_spend_sessions x on x.session_id = s.id
   where s.id = p_session
$$;--> statement-breakpoint

-- Internal: settle one turn (the measured cost on the reserve's own day; null keeps the reserve counted; p_cap caps the
-- measured cost at the reserve when no bound person vouches for it).
create or replace function app_studio_settle(p_turn uuid, p_session uuid, p_measured bigint, p_largest bigint, p_cap boolean) returns void
  language plpgsql volatile security definer set search_path = '' as $$
declare r record; v bigint;
begin
  delete from public.studio_turn_keys where turn_id = p_turn;
  if p_measured is null or p_measured < 0 then return; end if;
  select * into r from public.studio_spend_turns where turn_id = p_turn and settled_at is null for update;
  if r.turn_id is null then return; end if;
  v := case when p_cap then least(p_measured, r.reserved_micro) else p_measured end;
  update public.studio_spend_turns set measured_micro = v, settled_at = now() where turn_id = p_turn;
  update public.studio_spend_people set reserved_micro = greatest(0, reserved_micro - r.reserved_micro), measured_micro = measured_micro + v
   where day = r.day and user_id = r.user_id;
  update public.studio_spend_days set reserved_micro = greatest(0, reserved_micro - r.reserved_micro), measured_micro = measured_micro + v
   where day = r.day;
  update public.studio_spend_sessions set spent_micro = spent_micro + v, largest_micro = greatest(largest_micro, coalesce(p_largest, 0))
   where session_id = p_session;
end $$;--> statement-breakpoint

-- ── Close a turn of the bound person and settle it: ended (end_turn), paused (budget_reached) or failed (a reason).
--    The measured cost is counted uncapped (unit economics F3). ──
create or replace function app_studio_close_turn(p_turn uuid, p_how text, p_reason text, p_measured bigint, p_largest bigint) returns boolean
  language plpgsql volatile security definer set search_path = '' as $$
declare t record; b record;
begin
  if p_how not in ('ended', 'paused', 'failed') or (p_how = 'failed') <> (p_reason is not null) then raise exception 'bad_input' using errcode = 'P0001'; end if;
  select x.* into b from public.app_studio_bound() x;
  if b.token is null then return false; end if;
  select x.* into t from public.studio_turns x join public.studio_sessions s on s.id = x.session_id
   where x.id = p_turn and x.tenant_id = b.tenant_id and x.partner_id = b.partner_id and s.user_id = b.user_id
     and x.ended_at is null and x.paused_at is null and x.failed_at is null
   for update of x;
  if t.id is null then return false; end if;
  update public.studio_turns set
    ended_at = case when p_how = 'ended' then now() end,
    paused_at = case when p_how = 'paused' then now() end,
    failed_at = case when p_how = 'failed' then now() end,
    failed_reason = case when p_how = 'failed' then p_reason end
   where id = t.id;
  perform public.app_studio_settle(t.id, t.session_id, p_measured, p_largest, false);
  update public.studio_sessions set last_activity_at = now() where id = t.session_id;
  return true;
end $$;--> statement-breakpoint

-- ── End a session on the current store. 'stopped' is the person's Stop: their own session, bound. The cron's reasons
--    need no bind and read no partner's content; then the measured cost is capped at the reserve (tenancy audit L1). ──
create or replace function app_studio_end_session(p_session uuid, p_reason text, p_measured bigint) returns boolean
  language plpgsql volatile security definer set search_path = '' as $$
declare s record; t record; b record;
begin
  if p_reason not in ('stopped', 'switch', 'idle', 'age', 'actor', 'start_failed', 'restart') then raise exception 'bad_input' using errcode = 'P0001'; end if;
  select x.* into s from public.studio_sessions x where x.id = p_session and x.tenant_id = public.app_current_tenant() and x.ended_at is null for update;
  if s.id is null then return false; end if;
  select x.* into b from public.app_studio_bound() x;
  if p_reason in ('stopped', 'restart') and (b.token is null or b.user_id <> s.user_id or b.partner_id <> s.partner_id) then return false; end if;
  select x.* into t from public.studio_turns x where x.session_id = s.id and x.ended_at is null and x.paused_at is null and x.failed_at is null for update;
  if t.id is not null then
    update public.studio_turns set failed_at = now(),
      failed_reason = case p_reason when 'stopped' then 'runtime' when 'switch' then 'switch' when 'actor' then 'actor' when 'start_failed' then 'start' else 'expired' end
     where id = t.id;
    perform public.app_studio_settle(t.id, s.id, p_measured, null, b.token is null or b.user_id <> s.user_id);
  end if;
  update public.studio_sessions set ended_at = now(), end_reason = p_reason where id = s.id;
  return true;
end $$;--> statement-breakpoint

-- ── The cron's facts about one session of the current store: times and whether its person is still there (without the
--    step-up). No partner's content. ──
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
   where s.id = p_session and s.tenant_id = public.app_current_tenant() and s.ended_at is not null and s.cleaned_at is null
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

-- ── A session's runtime id once it is due for deletion at Anthropic (ended over 30 days, cleaned, not yet deleted):
--    the delete step's only input (cleanup_of answers nothing once a session is cleaned). ──
create or replace function app_studio_delete_of(p_session uuid) returns text
  language sql stable security definer set search_path = '' as $$
  select s.runtime_id from public.studio_sessions s
   where s.id = p_session and s.tenant_id = public.app_current_tenant() and s.ended_at < now() - interval '30 days'
     and s.cleaned_at is not null and s.deleted_at is null
$$;--> statement-breakpoint

-- ── The cron's work list across stores: ids and a kind only (the S4 rule). `advance`: an open turn, oldest read first
--    (with its turn id); `end`: an open session with no open turn; `clean`: ended, not yet cleaned; `delete`: ended over
--    30 days, not yet deleted at Anthropic. Each kind capped. ──
create or replace function app_studio_due(p_limit integer) returns table (session_id uuid, tenant_id uuid, turn_id uuid, kind text)
  language sql stable security definer set search_path = '' as $$
  (select s.id, s.tenant_id, t.id, 'advance' from public.studio_sessions s
     join public.studio_turns t on t.session_id = s.id and t.ended_at is null and t.paused_at is null and t.failed_at is null
    where s.ended_at is null
    order by s.last_read_at nulls first limit greatest(1, least(coalesce(p_limit, 100), 100)))
  union all
  (select s.id, s.tenant_id, null::uuid, 'end' from public.studio_sessions s
    where s.ended_at is null and not exists (select 1 from public.studio_turns t where t.session_id = s.id and t.ended_at is null and t.paused_at is null and t.failed_at is null)
    order by s.last_activity_at limit greatest(1, least(coalesce(p_limit, 100), 100)))
  union all
  (select s.id, s.tenant_id, null::uuid, 'clean' from public.studio_sessions s where s.ended_at is not null and s.cleaned_at is null
    order by s.ended_at limit greatest(1, least(coalesce(p_limit, 100), 100)))
  union all
  (select s.id, s.tenant_id, null::uuid, 'delete' from public.studio_sessions s
    where s.ended_at < now() - interval '30 days' and s.cleaned_at is not null and s.deleted_at is null
    order by s.ended_at limit greatest(1, least(coalesce(p_limit, 100), 100)))
$$;--> statement-breakpoint

revoke all on function app_studio_bound(), app_current_partner(), app_studio_write_bind(uuid, uuid, uuid, uuid, uuid, uuid), app_studio_sweep_binds(),
  app_studio_person(uuid, uuid), app_studio_proved(uuid, uuid, uuid, uuid), app_studio_partner(uuid, uuid, text, text), app_turn_actor(uuid),
  app_studio_bind_turn(uuid), app_studio_new_session(), app_studio_own_session(uuid), app_studio_set_vendor(uuid, text, text), app_studio_set_key(uuid, uuid),
  app_studio_open_turn(uuid, bigint, bigint, bigint, integer), app_studio_spend_of(uuid), app_studio_settle(uuid, uuid, bigint, bigint, boolean),
  app_studio_close_turn(uuid, text, text, bigint, bigint), app_studio_end_session(uuid, text, bigint), app_studio_session_facts(uuid),
  app_studio_cleanup_of(uuid), app_studio_delete_of(uuid), app_studio_mark(uuid, text), app_studio_due(integer)
  from public, anon, authenticated, service_role, frata_app, frata_admin, frata_builder;--> statement-breakpoint
grant execute on function app_current_partner(), app_studio_sweep_binds(), app_studio_partner(uuid, uuid, text, text), app_turn_actor(uuid),
  app_studio_bind_turn(uuid), app_studio_new_session(), app_studio_set_vendor(uuid, text, text), app_studio_set_key(uuid, uuid),
  app_studio_open_turn(uuid, bigint, bigint, bigint, integer), app_studio_spend_of(uuid), app_studio_close_turn(uuid, text, text, bigint, bigint),
  app_studio_end_session(uuid, text, bigint), app_studio_session_facts(uuid), app_studio_cleanup_of(uuid), app_studio_delete_of(uuid),
  app_studio_mark(uuid, text), app_studio_due(integer) to frata_app;
