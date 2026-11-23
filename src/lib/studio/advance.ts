import 'server-only'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { callAccepted } from '@/domains/studio/turn'
import { TOOL_ERRORS } from '@/domains/studio/tools'
import type { MicroUsd } from '@/domains/money/usd'
import type { Tx } from '@/lib/db'
import { withTenant } from '@/lib/db/tenant'
import { withBuilderScope } from '@/lib/db/actor'
import { LINE_MAX, studioMessages, studioSessions, studioToolCalls, studioTurns } from '@/lib/db/schema-studio'
import { asTurn, bindTurn, type TurnRef } from './as-turn'
import { CALL_MS } from './client'
import { managedRuntime } from './runtime-managed'
import { RuntimeError, type StudioEvent, type StudioRuntime } from './runtime'
import { runCall, type CallResult } from './tools'

// =============================================================================
// FILE: src/lib/studio/advance.ts — MOVES ONE OPEN TURN FORWARD (plan docs/plans/2026-11-22-v3a-runtime.md § Advance;
// ADR-0020 point 4). Called by the cron (every minute, across stores from app_studio_due's ids) and, later, after the
// chat's poll. Each step is a short store transaction in which the database binds the turn's person
// (app_studio_bind_turn); no transaction is held across a runtime call (check:studio):
//   1. the lease (90 s, one advance a session) and the session's runtime id and event cursor;
//   2. the events since the cursor; each tool call stored once (unique on its tool_use id) and accepted only inside the
//      open turn's window (after its user.message; ADR-0020 § 4), the agent's text stored once as lines;
//   3. at `requires_action`, every pending call run through asTurn (reads as frata_builder on ONE connection for the whole
//      advance: withBuilderScope) and its result stored, then the whole round answered in ONE send, then marked answered;
//   4. at `end_turn` the turn closes ended, at `budget_reached` paused, on a refusal or a session error failed
//      ('runtime'); each settles the measured delta of the session's list cost, uncapped (§ Spend cap).
// The person gone or Studio switched off: answered with an error and reported, and the cron ends the session.
// =============================================================================

export type AdvanceRef = { tenantId: string; turnId: string }
export type AdvanceOutcome =
  | 'busy' | 'not_started' | 'actor' | 'switch' | 'waiting' | 'answered' | 'ended' | 'paused' | 'failed' | 'error'

export type AdvanceOptions = {
  runtime?: StudioRuntime
  /** Wall-clock end (ms): no step starts that cannot finish before it. */
  deadline?: number
  /** After answering a round, keep reading this session for up to this long (the poll's after(): 20 s; the cron: 0). */
  followMs?: number
  /** Skip when an advance read this session less than this long ago (the poll's trigger: 5 s; the cron: 0). */
  minGapMs?: number
  /** Wait between reads while following (tests shorten it). */
  pauseMs?: number
}

const LEASE_S = 90
const PAGE = 100
const NAME_MAX = 64
const INPUT_MAX = 70 * 1024

type Lease = { sessionId: string; runtimeId: string; cursor: string | null; startedAt: Date | null; userMessageEventId: string | null }
type Batch = { idle: Extract<StudioEvent, { kind: 'idle' }> | null; terminal: 'error' | 'terminated' | null; moving: boolean; largest: MicroUsd; last: string | null }

const bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v ?? null)).length

/** A store transaction with the turn's person bound by the database; null when the person is gone. */
function bound<T>(ref: AdvanceRef, work: (tx: Tx, partnerId: string) => Promise<T>): Promise<T | null> {
  return withTenant(ref.tenantId, async (tx) => {
    const partnerId = await bindTurn(tx, ref.turnId)
    return partnerId ? work(tx, partnerId) : null
  })
}

async function takeLease(ref: AdvanceRef, minGapMs: number): Promise<Lease | 'busy' | 'not_started' | 'actor'> {
  const r = await bound(ref, async (tx) => {
    const [t] = await tx.select({ sessionId: studioTurns.sessionId, startedAt: studioTurns.startedAt, userMessageEventId: studioTurns.userMessageEventId })
      .from(studioTurns).where(and(eq(studioTurns.tenantId, ref.tenantId), eq(studioTurns.id, ref.turnId)))
    if (!t) return 'busy' as const
    const gap = minGapMs > 0 ? sql`and (${studioSessions.lastReadAt} is null or ${studioSessions.lastReadAt} < now() - make_interval(secs => ${minGapMs / 1000}))` : sql``
    const rows = await tx.execute(sql`update studio_sessions set advancing_until = now() + make_interval(secs => ${LEASE_S}), last_read_at = now()
      where id = ${t.sessionId} and tenant_id = ${ref.tenantId} and ended_at is null and runtime_id is not null
        and (advancing_until is null or advancing_until < now()) ${gap}
      returning runtime_id, event_cursor`)
    const s = (rows as unknown as { runtime_id: string; event_cursor: string | null }[])[0]
    if (!s) {
      const [x] = await tx.select({ runtimeId: studioSessions.runtimeId }).from(studioSessions).where(and(eq(studioSessions.tenantId, ref.tenantId), eq(studioSessions.id, t.sessionId)))
      return x && x.runtimeId === null ? 'not_started' as const : 'busy' as const
    }
    return { sessionId: t.sessionId, runtimeId: s.runtime_id, cursor: s.event_cursor, startedAt: t.startedAt, userMessageEventId: t.userMessageEventId }
  })
  return r ?? 'actor'
}

async function releaseLease(ref: AdvanceRef, sessionId: string): Promise<void> {
  await bound(ref, (tx) => tx.update(studioSessions).set({ advancingUntil: null })
    .where(and(eq(studioSessions.tenantId, ref.tenantId), eq(studioSessions.id, sessionId)))).catch(() => null)
}

/** Stores what the events say, once each, and moves the cursor. Returns where the turn stands. */
async function storeEvents(ref: AdvanceRef, lease: Lease, events: StudioEvent[]): Promise<Batch | null> {
  return bound(ref, async (tx, partnerId) => {
    const { tenantId } = ref, sessionId = lease.sessionId
    const batch: Batch = { idle: null, terminal: null, moving: false, largest: 0 as MicroUsd, last: null }
    for (const ev of events) {
      batch.last = ev.at
      if (ev.kind === 'user_message') {
        // The first user.message after the cursor while the turn has not started is this turn's: its call window opens.
        if (!lease.userMessageEventId) {
          await tx.update(studioTurns).set({ startedAt: sql`now()`, userMessageEventId: ev.id })
            .where(and(eq(studioTurns.tenantId, tenantId), eq(studioTurns.id, ref.turnId), isNull(studioTurns.userMessageEventId)))
          lease.userMessageEventId = ev.id
          lease.startedAt = new Date()
        }
        batch.idle = null; batch.moving = true
      } else if (ev.kind === 'tool_use') {
        const accepted = callAccepted({ sentAt: new Date(0), startedAt: lease.startedAt, endedAt: null, pausedAt: null, failedAt: null }, lease.userMessageEventId !== null)
        const fits = bytes(ev.input) <= INPUT_MAX
        const refusal = !accepted ? TOOL_ERRORS.window : !fits ? TOOL_ERRORS.input : null
        await tx.insert(studioToolCalls).values({
          tenantId, partnerId, sessionId, turnId: ref.turnId, toolUseId: ev.id, name: ev.name.slice(0, NAME_MAX), input: fits ? (ev.input ?? {}) : {},
          ...(refusal ? { executedAt: sql`now()`, result: { error: refusal }, isError: true } : {}),
        }).onConflictDoNothing({ target: [studioToolCalls.sessionId, studioToolCalls.toolUseId] })
        batch.idle = null; batch.moving = true
      } else if (ev.kind === 'agent_message') {
        const text = ev.text.trim().slice(0, LINE_MAX)
        if (text) await tx.insert(studioMessages).values({ tenantId, partnerId, sessionId, kind: 'agent', text, eventId: ev.id }).onConflictDoNothing()
        batch.idle = null; batch.moving = true
      } else if (ev.kind === 'request_end') {
        if (ev.cost > batch.largest) batch.largest = ev.cost
      } else if (ev.kind === 'idle') {
        // Events are read at or after the cursor: an idle before this turn's user.message is the last turn's, never this one's.
        if (lease.userMessageEventId) { batch.idle = ev; batch.moving = false }
      } else if (ev.kind === 'error' || ev.kind === 'terminated') {
        batch.terminal = ev.kind
      }
    }
    await tx.update(studioSessions).set({ ...(batch.last ? { eventCursor: batch.last } : {}), lastReadAt: sql`now()` })
      .where(and(eq(studioSessions.tenantId, tenantId), eq(studioSessions.id, sessionId)))
    return batch
  })
}

type Pending = { id: string; toolUseId: string; name: string; input: unknown; result: unknown; isError: boolean | null }

async function pendingCalls(ref: AdvanceRef, sessionId: string, toolUseIds: string[]): Promise<Pending[] | null> {
  if (!toolUseIds.length) return []
  return bound(ref, (tx) => tx.select({ id: studioToolCalls.id, toolUseId: studioToolCalls.toolUseId, name: studioToolCalls.name, input: studioToolCalls.input,
    result: studioToolCalls.result, isError: studioToolCalls.isError }).from(studioToolCalls)
    .where(and(eq(studioToolCalls.tenantId, ref.tenantId), eq(studioToolCalls.sessionId, sessionId), inArray(studioToolCalls.toolUseId, toolUseIds), isNull(studioToolCalls.answeredAt))))
}

const answerText = (r: CallResult) => JSON.stringify(r.answer)

/** One round: every pending call run (or its stored result reused), answered in ONE send, then marked answered. */
async function answerRound(ref: AdvanceRef, lease: Lease, rt: StudioRuntime, pending: string[]): Promise<'answered' | 'waiting' | 'actor' | 'switch' | 'error'> {
  const calls = await pendingCalls(ref, lease.sessionId, pending)
  if (calls === null) return 'actor'
  // A round re-read after its answer went out has nothing left to answer.
  pending = calls.map((c) => c.toolUseId)
  if (!pending.length) return 'waiting'
  const turn: TurnRef = { tenantId: ref.tenantId, sessionId: lease.sessionId, turnId: ref.turnId }
  const results = new Map<string, CallResult>()
  let refusedWhy: 'actor' | 'switch' | null = null
  for (const c of calls) {
    if (c.result !== null) { results.set(c.toolUseId, { answer: c.result, isError: c.isError ?? true }); continue }
    const r = await asTurn(turn, (ctx) => runCall(ctx, { id: c.id, name: c.name, input: c.input }))
    if (!r.ok) { refusedWhy = r.why; break }
    results.set(c.toolUseId, r.value)
  }
  // The person gone or Studio off: every pending call is answered with an error (never run), and the cron ends the session.
  const answers = pending.map((id) => {
    const r = refusedWhy ? undefined : results.get(id)
    return r ? { toolUseId: id, text: answerText(r), isError: r.isError }
      : { toolUseId: id, text: JSON.stringify({ error: refusedWhy === 'switch' ? TOOL_ERRORS.unavailable : refusedWhy ? TOOL_ERRORS.actor : TOOL_ERRORS.window }), isError: true }
  })
  try { await rt.answer(lease.runtimeId, answers) } catch (err) {
    console.error('[studio] answer', err instanceof RuntimeError ? err.code : 'error')
    return 'error'
  }
  if (refusedWhy) return refusedWhy
  await bound(ref, (tx) => tx.update(studioToolCalls).set({ answeredAt: sql`now()` })
    .where(and(eq(studioToolCalls.tenantId, ref.tenantId), eq(studioToolCalls.sessionId, lease.sessionId), inArray(studioToolCalls.toolUseId, pending), isNull(studioToolCalls.answeredAt))))
  return 'answered'
}

/** Closes the turn and settles the measured delta of the session's list cost (uncapped; null keeps the reserve counted). */
async function closeTurn(ref: AdvanceRef, lease: Lease, rt: StudioRuntime, how: 'ended' | 'paused' | 'failed', largest: MicroUsd): Promise<boolean> {
  const listCost = await rt.usage(lease.runtimeId).then((u) => u.listCost as number, () => null)
  const done = await bound(ref, async (tx) => {
    const rows = await tx.execute(sql`select spent_micro from app_studio_spend_of(${lease.sessionId}::uuid)`)
    const spent = Number((rows as unknown as { spent_micro: number }[])[0]?.spent_micro ?? 0)
    const measured = listCost === null ? null : Math.max(0, listCost - spent)
    const r = await tx.execute(sql`select app_studio_close_turn(${ref.turnId}::uuid, ${how}, ${how === 'failed' ? 'runtime' : null}, ${measured}::bigint, ${largest}::bigint) as ok`)
    await tx.update(studioSessions).set({ advancingUntil: null }).where(and(eq(studioSessions.tenantId, ref.tenantId), eq(studioSessions.id, lease.sessionId)))
    return (r as unknown as { ok: boolean }[])[0]?.ok === true
  })
  return done === true
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function advance(ref: AdvanceRef, opts: AdvanceOptions = {}): Promise<AdvanceOutcome> {
  return withBuilderScope(() => advanceIn(ref, opts))
}

async function advanceIn(ref: AdvanceRef, opts: AdvanceOptions): Promise<AdvanceOutcome> {
  const rt = opts.runtime ?? managedRuntime
  const deadline = opts.deadline ?? Date.now() + 50_000
  const room = (ms: number) => Date.now() + ms < deadline
  const lease = await takeLease(ref, opts.minGapMs ?? 0)
  if (typeof lease === 'string') return lease
  let outcome: AdvanceOutcome = 'waiting'
  let largest = 0 as MicroUsd
  const followUntil = Date.now() + (opts.followMs ?? 0)
  try {
    for (;;) {
      if (!room(CALL_MS.events)) return outcome
      let events: StudioEvent[]
      try { events = await rt.events(lease.runtimeId, lease.cursor, PAGE) } catch (err) {
        console.error('[studio] events', err instanceof RuntimeError ? err.code : 'error')
        if (err instanceof RuntimeError && err.code === 'not_found') { await closeTurn(ref, lease, rt, 'failed', largest); return 'failed' }
        return 'error'
      }
      const batch = await storeEvents(ref, lease, events)
      if (!batch) return 'actor'
      if (batch.last) lease.cursor = batch.last
      if (batch.largest > largest) largest = batch.largest
      if (batch.terminal) { await closeTurn(ref, lease, rt, 'failed', largest); return 'failed' }
      const idle = batch.idle
      if (idle && !batch.moving) {
        if (idle.stop === 'end_turn') { await closeTurn(ref, lease, rt, 'ended', largest); return 'ended' }
        if (idle.stop === 'budget_reached') { await closeTurn(ref, lease, rt, 'paused', largest); return 'paused' }
        if (idle.stop === 'refusal' || idle.stop === 'retries_exhausted') { await closeTurn(ref, lease, rt, 'failed', largest); return 'failed' }
        if (idle.stop === 'requires_action' && idle.pending.length) {
          if (!room(CALL_MS.control * 2)) return outcome
          const r = await answerRound(ref, lease, rt, idle.pending)
          if (r === 'answered') outcome = 'answered'
          else if (r !== 'waiting') return r
        }
      }
      if (Date.now() >= followUntil || !room(CALL_MS.events + (opts.pauseMs ?? 1500))) return outcome
      await sleep(opts.pauseMs ?? 1500)
    }
  } finally {
    await releaseLease(ref, lease.sessionId)
  }
}
