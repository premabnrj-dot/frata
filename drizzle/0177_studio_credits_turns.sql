ALTER TABLE "studio_spend_turns" ADD COLUMN "credit_use_id" uuid;--> statement-breakpoint
ALTER TABLE "studio_spend_turns" ADD CONSTRAINT "studio_spend_turns_use" UNIQUE("credit_use_id");--> statement-breakpoint
-- ═══ V3b K3 (docs/plans/2026-11-24-v3b-first.md): a Studio turn is paid in the partner's credits ════════════════════
-- Send reserves through app_pc_reserve (the person's own call, its own statement), then, in the transaction that opens
-- the turn, ties the use to it here. Every end of a turn already passes app_studio_settle once its cost is known (ended,
-- paused, failed, a session's end, the cron's settle of an ended session): it now settles the use with the same measured
-- cost (app_pc_settle charges at most the reserve), or, for a turn that failed, gives every credit back with its reason.
-- A use never tied (the process died between the reserve and the turn) is returned by the credits run's stale sweep.

-- ── Tie a credit use to the bound person's own open turn: the use the bound partner's member reserved for a turn on this
--    store's live link, open, and tied to nothing else. False otherwise (the caller gives the use back). ──
create or replace function app_studio_turn_use(p_turn uuid, p_use uuid) returns boolean
  language plpgsql volatile security definer set search_path = '' as $$
declare b record;
begin
  select x.* into b from public.app_studio_bound() x;
  if b.token is null or p_turn is null or p_use is null then return false; end if;
  if not exists (select 1 from public.studio_turns t join public.studio_sessions s on s.id = t.session_id
      where t.id = p_turn and t.tenant_id = b.tenant_id and t.partner_id = b.partner_id and s.user_id = b.user_id and s.partner_member_id = b.member_id
        and t.ended_at is null and t.paused_at is null and t.failed_at is null) then return false; end if;
  if not exists (select 1 from public.partner_credit_uses u join public.partner_links k on k.id = u.link_id and k.partner_id = u.partner_id
      where u.id = p_use and u.partner_id = b.partner_id and u.member_id = b.member_id and u.kind = 'turn' and u.closed_at is null
        and k.tenant_id = b.tenant_id and k.removed_at is null) then return false; end if;
  update public.studio_spend_turns set credit_use_id = p_use, test = false where turn_id = p_turn and credit_use_id is null;
  return found;
exception when unique_violation then return false;
end $$;--> statement-breakpoint

-- Internal: settle one turn (as 0167), and its credit use. Ended, paused, or ended by the person (Stop, a store switch,
-- removed): charged what it measured, once known (unit economics review 2026-11-24: Stop is the person's choice, and its
-- proposals stay usable). A failure on our side ('frrata': the start, the send, the budget raise, the runtime, the
-- workspace) or an expiry ('timeout') gives every credit back. The use records the RAW measured cost; its charge is capped
-- at the reserve by app_pc_settle (the same review: a capped figure hides an overshoot). One lock order for every path
-- (security review 2026-11-24, M1: two settles of one partner deadlocked): the spend rows first, the credit use last.
create or replace function app_studio_settle(p_turn uuid, p_session uuid, p_measured bigint, p_largest bigint, p_cap boolean) returns void
  language plpgsql volatile security definer set search_path = '' as $$
declare r record; v bigint; t record; v_back text;
begin
  delete from public.studio_turn_keys where turn_id = p_turn;
  select st.credit_use_id as use_id, tn.failed_at, tn.failed_reason, ss.end_reason into t
    from public.studio_spend_turns st join public.studio_turns tn on tn.id = st.turn_id join public.studio_sessions ss on ss.id = tn.session_id
   where st.turn_id = p_turn;
  v_back := case when t.failed_at is null or t.end_reason in ('stopped', 'switch', 'actor') then null
                 when t.failed_reason = 'expired' then 'timeout' else 'frrata' end;
  if p_measured is null or p_measured < 0 then
    -- The cost isn't known yet: a failure of ours gives the credits back now (its cost settles later, uncharged); anything
    -- else holds them until the settle that knows the cost.
    if t.use_id is not null and v_back is not null then perform public.app_pc_return(t.use_id, v_back); end if;
    return;
  end if;
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
  if r.credit_use_id is null then return; end if;
  if v_back is not null then perform public.app_pc_return(r.credit_use_id, v_back);
  else perform public.app_pc_settle(r.credit_use_id, p_measured); end if;
end $$;--> statement-breakpoint

-- ── The credits run's stale sweep (as 0164), but never a use whose turn is still running: its own end settles it
--    (security review 2026-11-24, L1: a sweep of a long turn made it free). ──
create or replace function app_pc_stale_uses(p_older interval, p_limit integer) returns table (id uuid)
  language sql stable security definer set search_path = '' as $$
  select u.id from public.partner_credit_uses u where u.closed_at is null and u.created_at < now() - greatest(p_older, interval '1 hour')
     and not exists (select 1 from public.studio_spend_turns st join public.studio_turns tn on tn.id = st.turn_id
                       join public.studio_sessions ss on ss.id = tn.session_id
                      where st.credit_use_id = u.id and st.settled_at is null and ss.ended_at is null)
   order by u.created_at limit least(p_limit, 200)
$$;--> statement-breakpoint

-- ── End a session (as 0167), its end recorded BEFORE its open turn settles, so the settle reads why it ended (a Stop is
--    charged what it measured, not given back as a failure of ours). Nothing else changes. ──
create or replace function app_studio_end_session(p_session uuid, p_reason text, p_measured bigint) returns boolean
  language plpgsql volatile security definer set search_path = '' as $$
declare s record; t record; b record;
begin
  if p_reason not in ('stopped', 'switch', 'idle', 'age', 'actor', 'start_failed', 'restart') then raise exception 'bad_input' using errcode = 'P0001'; end if;
  select x.* into s from public.studio_sessions x where x.id = p_session and x.tenant_id = public.app_current_tenant() and x.ended_at is null for update;
  if s.id is null then return false; end if;
  select x.* into b from public.app_studio_bound() x;
  if p_reason in ('stopped', 'restart') and (b.token is null or b.user_id <> s.user_id or b.partner_id <> s.partner_id) then return false; end if;
  update public.studio_sessions set ended_at = now(), end_reason = p_reason where id = s.id;
  select x.* into t from public.studio_turns x where x.session_id = s.id and x.ended_at is null and x.paused_at is null and x.failed_at is null for update;
  if t.id is not null then
    update public.studio_turns set failed_at = now(),
      failed_reason = case p_reason when 'stopped' then 'runtime' when 'switch' then 'switch' when 'actor' then 'actor' when 'start_failed' then 'start' else 'expired' end
     where id = t.id;
    perform public.app_studio_settle(t.id, s.id, p_measured, null, b.token is null or b.user_id <> s.user_id);
  end if;
  return true;
end $$;--> statement-breakpoint

revoke all on function app_studio_turn_use(uuid, uuid) from public, anon, authenticated, service_role, frata_app, frata_admin, frata_builder;--> statement-breakpoint
grant execute on function app_studio_turn_use(uuid, uuid) to frata_app;
