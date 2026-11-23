import 'server-only'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { endReason, type EndReason } from '@/domains/studio/session'
import { auditEvents } from '@/lib/db/schema'
import { storefrontKeys } from '@/lib/db/schema-storefront-api'
import { withTenant } from '@/lib/db/tenant'
import { studioDue, sweepStudioBinds, type DueRow } from '@/lib/db/studio'
import { STUDIO_OPEN } from '@/lib/env'
import { errName } from '@/lib/log'
import type { MicroUsd } from '@/domains/money/usd'
import { advance } from './advance'
import { CALL_MS } from './client'
import { listCostOf, measuredOf } from './measure'
import { managedRuntime } from './runtime-managed'
import { RuntimeError, type StudioRuntime } from './runtime'

// =============================================================================
// FILE: src/lib/studio/cron.ts — STUDIO'S PER-MINUTE NET (plan docs/plans/2026-11-22-v3a-runtime.md § Advance, § Session
// end; R6). Works across stores from app_studio_due's ids only (the S4 rule), each step in that session's own store
// transaction, without a person's bind: it ends sessions (the switch, a gone person, 23 hours, an idle hour), cleans
// them up (key revoked as the system, vault and file deleted, session archived) and deletes them at Anthropic 30 days
// after. Imported only by the cron route (check:studio: tenancy audit of R7), never by a person's request.
// =============================================================================

const one = <T>(rows: unknown) => (rows as T[])[0]

type Facts = { created_at: string; last_activity_at: string; ended_at: string | null; person_live: boolean; turn_open: boolean; turn_sent_at: string | null; turn_started: boolean; runtime_id: string | null; spent_micro: string | number }
const factsOf = (tenantId: string, sessionId: string) => withTenant(tenantId, async (tx) =>
  one<Facts>(await tx.execute(sql`select created_at, last_activity_at, ended_at, person_live, turn_open, turn_sent_at, turn_started, runtime_id, spent_micro from app_studio_session_facts(${sessionId}::uuid)`)))

/** Ends a session for a reason the cron decides (no bind). Its open turn holds its reserve until the clean-up has
 *  archived the runtime session and settles what it measured, capped at the reserve (security review of the phase, LOW:
 *  a cost read before the runtime stops misses its tail); 0 at once when no runtime session was recorded (unit
 *  economics F2, F3). */
async function endUnbound(tenantId: string, sessionId: string, reason: EndReason, f?: Facts | null): Promise<boolean> {
  const facts = f ?? (await factsOf(tenantId, sessionId))
  if (!facts) return false
  const measured = facts.turn_open && !facts.runtime_id ? 0 : null
  return withTenant(tenantId, async (tx) =>
    one<{ ok: boolean }>(await tx.execute(sql`select app_studio_end_session(${sessionId}::uuid, ${reason}, ${measured}::bigint) as ok`))?.ok === true)
}

/** Why the cron ends this open session now, or null (the facts read now: a turn may have closed since the work list). */
function dueEnd(f: Facts | undefined): EndReason | null {
  if (!f || f.ended_at) return null
  return endReason({
    now: new Date(), createdAt: new Date(f.created_at), lastActivityAt: new Date(f.last_activity_at), turnOpen: f.turn_open,
    studioOpen: STUDIO_OPEN === 'staff', actorLive: f.person_live, turnSentAt: f.turn_sent_at ? new Date(f.turn_sent_at) : null, turnStarted: f.turn_started,
  })
}

/** An ended session's key revoked, its vault and file deleted and the session archived; then marked cleaned. A failure
 *  leaves it for the next run (each step is safe to repeat). `vendor` false (Studio unconfigured: no key to reach
 *  Anthropic): the key is revoked and the rest waits. `room`: no call begins unless it can end before the cron's deadline. */
export async function cleanSession(tenantId: string, sessionId: string, rt: StudioRuntime = managedRuntime, vendor = true,
  room: (ms: number) => boolean = () => true): Promise<boolean> {
  const ids = await withTenant(tenantId, async (tx) => {
    const r = one<{ runtime_id: string | null; vault_id: string | null; file_id: string | null; build_key_id: string | null }>(
      await tx.execute(sql`select runtime_id, vault_id, file_id, build_key_id from app_studio_cleanup_of(${sessionId}::uuid)`))
    if (r?.build_key_id) {
      const gone = await tx.update(storefrontKeys).set({ revokedAt: sql`now()`, revokedBy: sql`${storefrontKeys.createdBy}` })
        .where(and(eq(storefrontKeys.tenantId, tenantId), eq(storefrontKeys.id, r.build_key_id), isNull(storefrontKeys.revokedAt))).returning({ id: storefrontKeys.id })
      if (gone.length) await tx.insert(auditEvents).values({ tenantId, actorKind: 'system', action: 'storefront_key.delete', target: r.build_key_id, detail: { fields: ['revoked_at'], why: 'studio_session_end' } })
    }
    return r
  })
  if (!ids || !vendor) return false
  const next = () => { if (!room(CALL_MS.control)) throw new RuntimeError('timeout') }
  try {
    if (ids.vault_id) { next(); await rt.deleteVault(ids.vault_id) }
    if (ids.file_id) { next(); await rt.deleteFile(ids.file_id) }
    if (ids.runtime_id) next()
    if (ids.runtime_id) await rt.archive(ids.runtime_id).catch((e: unknown) => { if (!(e instanceof RuntimeError && e.code === 'not_found')) throw e })
  } catch (err) {
    console.error('[studio] clean', err instanceof RuntimeError ? err.code : errName(err))
    return false
  }
  // The runtime session archived (stopped), its final cost read and its last turn settled, capped at the reserve; an
  // unread cost leaves the clean-up for the next run, the reserve still counted.
  if (ids.runtime_id) {
    if (!room(CALL_MS.control)) return false
    const listCost = await listCostOf(rt, ids.runtime_id)
    const f = await factsOf(tenantId, sessionId)
    const measured = f ? measuredOf(Number(f.spent_micro) as MicroUsd, listCost) : null
    if (measured === null) return false
    await withTenant(tenantId, async (tx) => tx.execute(sql`select app_studio_settle_ended(${sessionId}::uuid, ${measured}::bigint)`))
  }
  return withTenant(tenantId, async (tx) => one<{ ok: boolean }>(await tx.execute(sql`select app_studio_mark(${sessionId}::uuid, 'cleaned') as ok`))?.ok === true)
}

/** A session 30 days past its end deleted at Anthropic, then marked deleted. */
async function deleteSession(tenantId: string, sessionId: string, rt: StudioRuntime): Promise<boolean> {
  const due = await withTenant(tenantId, async (tx) => one<{ runtime_id: string | null }>(await tx.execute(sql`select runtime_id from app_studio_delete_of(${sessionId}::uuid)`)))
  if (!due) return false // not due (the mark refuses it too)
  const runtimeId = due.runtime_id
  if (runtimeId) {
    try { await rt.remove(runtimeId) } catch (err) { console.error('[studio] delete', err instanceof RuntimeError ? err.code : errName(err)); return false }
  }
  return withTenant(tenantId, async (tx) => one<{ ok: boolean }>(await tx.execute(sql`select app_studio_mark(${sessionId}::uuid, 'deleted') as ok`))?.ok === true)
}

export type CronReport = { advanced: number; ended: number; cleaned: number; deleted: number; errors: number }

/** The most one step of each kind can take once begun (speed review of the phase, MED-2): an end reads the list cost (one
 *  control call); an advance is held to 30 s; a clean checks for room before each of its calls; a delete is one call. */
const STEP_MS = { end: CALL_MS.control + 5_000, advance: 30_000, clean: CALL_MS.control + 2_000, delete: CALL_MS.control + 2_000 } as const
/** Advances run this many at once (speed review of the phase, MED-1): each holds one connection at a time. */
const ADVANCE_AT_ONCE = 4

/** Runs `work` over `items`, `n` at a time. */
async function pool<T>(items: T[], n: number, work: (t: T) => Promise<void>): Promise<void> {
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await work(items[i++]!) }))
}

/** The per-minute net (src/app/api/cron/studio/route.ts): sessions ended for the switch, a gone person, age, idleness or
 *  a start that died; each open turn advanced; ended ones cleaned up; old ones deleted at Anthropic. The cheap ends run
 *  first and the advances four at once, so a slow Anthropic never starves the ends and clean-ups (speed review of the
 *  phase, MED-1); no step starts unless its kind's longest step still ends before the deadline (MED-2). */
export async function runStudioCron(deadline: number, rt: StudioRuntime = managedRuntime, onlyStore?: string, vendor = true): Promise<CronReport> {
  const out: CronReport = { advanced: 0, ended: 0, cleaned: 0, deleted: 0, errors: 0 }
  const room = (ms: number) => Date.now() + ms < deadline
  await sweepStudioBinds().catch((e) => { out.errors++; console.error('[studio] sweep', errName(e)) })
  // `onlyStore`: the int tests share one database across files; the route never passes it.
  const due = (await studioDue(20)).filter((d) => !onlyStore || d.tenantId === onlyStore)
  const step = async (d: DueRow) => {
    try { await work(d) } catch (err) { out.errors++; console.error('[studio] cron', d.kind, errName(err)) }
  }
  const work = async (d: DueRow) => {
    // Studio unconfigured (the key removed is half the switch: security review of R6, MED-2): the database half still
    // runs. Every open session ends as `switch` and its key is revoked; Anthropic's side waits for a key.
    if (!vendor && (d.kind === 'advance' || d.kind === 'end')) { if (await endUnbound(d.tenantId, d.sessionId, 'switch')) out.ended++; return }
    if (d.kind === 'advance' || d.kind === 'end') {
      const f = await factsOf(d.tenantId, d.sessionId)
      const why = dueEnd(f)
      if (why) { if (await endUnbound(d.tenantId, d.sessionId, why, f)) out.ended++; return }
      if (d.kind !== 'advance' || !d.turnId) return
      const r = await advance({ tenantId: d.tenantId, turnId: d.turnId }, { runtime: rt, deadline: Math.min(deadline, Date.now() + STEP_MS.advance) })
      // `actor`: the turn's person no longer binds. A turn the poll closed meanwhile binds nobody either: only a turn
      // still open is ended for it (architecture review of the phase); with no room left, the next minute ends it.
      if (r === 'actor') {
        const now = room(STEP_MS.end) ? await factsOf(d.tenantId, d.sessionId) : null
        if (now?.turn_open && (await endUnbound(d.tenantId, d.sessionId, 'actor', now))) out.ended++
      } else if (r === 'error') out.errors++
      else out.advanced++
    } else if (d.kind === 'clean') {
      if (await cleanSession(d.tenantId, d.sessionId, rt, vendor, room)) out.cleaned++
    } else if (vendor) {
      if (await deleteSession(d.tenantId, d.sessionId, rt)) out.deleted++
    }
  }
  const of = (k: DueRow['kind']) => due.filter((d) => d.kind === k)
  for (const d of of('end')) { if (!room(STEP_MS.end)) break; await step(d) }
  // Studio unconfigured: an advance row is only the database's end, an end's room.
  await pool(of('advance'), ADVANCE_AT_ONCE, async (d) => { if (room(vendor ? STEP_MS.advance : STEP_MS.end)) await step(d) })
  for (const d of of('clean')) { if (!room(STEP_MS.clean)) break; await step(d) }
  for (const d of of('delete')) { if (!room(STEP_MS.delete)) break; await step(d) }
  return out
}
