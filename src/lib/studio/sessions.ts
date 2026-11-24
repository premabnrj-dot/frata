import 'server-only'
import { after } from 'next/server'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { budgetFor, studioCaps } from '@/domains/studio/spend'
import { LINE_MAX, studioMessages, studioSessions, studioTurns } from '@/lib/db/schema-studio'
import { LIMITS, withinLimit } from '@/lib/db/rate-limit'
import { STUDIO_OPEN } from '@/lib/env'
import { errName } from '@/lib/log'
import { buildKeyLimitOk, buildKeyUncount, mintBuildKey } from '@/lib/storefront-api/build-keys'
import { withTenant } from '@/lib/db/tenant'
import { partnerLinks } from '@/lib/db/schema-partners'
import { system } from '@/lib/db/partner-credits'
import { creditsFor, rateUsable } from '@/domains/studio/credits'
import { reserveCredits, returnCredits, type ReserveRefusal } from './credits'
import { advance } from './advance'
import { listCostOf, measuredOf, spendOf } from './measure'
import { managedRuntime } from './runtime-managed'
import { RuntimeError, type StudioRuntime } from './runtime'
import { starterArchive } from './starter'
import { StudioUnbound, withStudio, type StudioOk } from './with-studio'

// =============================================================================
// FILE: src/lib/studio/sessions.ts — SEND, START, STOP AND SESSION END (plan docs/plans/2026-11-22-v3a-runtime.md
// § The first test steps 2–3, § Session end, § Spend cap; R6). A Send is an attempt row before any request (ADR-0008):
// one transaction under withStudio holds the person's session, the turn (its reserve against the day caps, in the
// database: app_studio_open_turn) and the person's line. Each runtime call then follows a committed row (ADR-0006): the
// build key minted and recorded, then the vault and its id, Starter 0's file and its id, the session (always with a
// budget) and its id, then the budget raise and the message. A failure at any step fails the turn and ends the session;
// what was made and recorded is cleaned up by the cron, what was made and not recorded is deleted here. No transaction
// is held across a runtime call (check:studio). The cron ends, cleans and deletes sessions from ids only (app_studio_due).
// =============================================================================

/** `busy`: a lock wait or a Send at the same moment (try again); `limit`: too many Sends this hour (slow down).
 *  The credit refusals (V3b K3), in the reserve's order: `rate` no fresh dollar rate, `studio_day` Studio's day across
 *  Frrata, `credits_day` the person's 300 a day, `client_budget` the client's budget, `balance` the partner's credits. */
export type SendWhy = 'closed' | 'input' | 'busy' | 'limit' | 'person_day' | 'platform_day' | 'sessions' | 'turn_open' | 'start' | 'send' | 'budget' | 'error'
  | 'rate' | 'studio_day' | 'credits_day' | 'client_budget' | 'balance'
export type SendResult = { ok: true; sessionId: string; turnId: string } | { ok: false; why: SendWhy }
export type Deps = { runtime: StudioRuntime; starter: () => { bytes: Uint8Array; sha256: string }; follow: boolean }
const DEFAULT: Deps = { runtime: managedRuntime, starter: starterArchive, follow: true }

/** A text the person sends, as stored and sent: no NUL, trimmed, at most a line (drizzle/0166 checks LINE_MAX). */
export const sendText = (t: string) => t.replace(/\u0000/g, '').trim().slice(0, LINE_MAX)

const REFUSALS = new Set<SendWhy>(['person_day', 'platform_day', 'sessions', 'turn_open'])
/** A definer's refusal code (raised as P0001 with our own word) or a lock wait, as a SendWhy; anything else rethrows. */
function refusalOf(err: unknown): SendWhy {
  if (err instanceof StudioUnbound) return 'closed'
  const c = (err as { cause?: { code?: string; message?: string } } | null)?.cause
  if (c?.code === 'P0001' && REFUSALS.has(c.message as SendWhy)) return c.message as SendWhy
  if (c?.code === 'P0001' && (c.message === 'not_bound' || c.message === 'not_found')) return 'closed'
  if (c?.code === '55P03' || c?.code === '23505') return 'busy' // a lock wait over 2 s; a second first Send at once
  // Anything else: its class only, never the error (a query error's message carries its parameters: the person's text,
  // the step-up hashes; security review of R6, LOW-1). Nothing was sent: the transaction rolled back.
  console.error('[studio] send', errName(err))
  return 'error'
}

const one = <T>(rows: unknown) => (rows as T[])[0]

/** A reserve's refusal as a Send's (V3b K3). `not_found`: the store's link is gone or a Lead isn't assigned to it. */
const CREDIT_WHY: Record<ReserveRefusal, SendWhy> = {
  rate: 'rate', platform_day: 'studio_day', person_day: 'credits_day', budget: 'client_budget', balance: 'balance', not_found: 'closed',
}
const creditWhy = (e: string): SendWhy => CREDIT_WHY[e as ReserveRefusal] ?? (e === 'confirm_first' || e === 'not_owner' ? 'closed' : 'error')

/** The credits a turn holds (V3b K3; frata-unit-economics § The dollar rate): the turn's USD ceiling at the day's rate and
 *  the 1.10 loading, in whole credits. The turn can't cost more: Anthropic pauses the session at that ceiling. */
export const turnEstimate = (ceilingMicroUsd: number, rateE4: number) => creditsFor(BigInt(ceilingMicroUsd), rateE4)

/** Holds the turn's credits before anything opens (the person's own call: their partner, step-up and store's link). */
async function holdCredits(auth: StudioOk, ceiling: number): Promise<{ ok: true; useId: string } | { ok: false; why: SendWhy }> {
  const rate = await system.rateLatest().catch((e) => { console.error('[studio] rate', errName(e)); return null })
  if (!rate || !rateUsable(rate.day, new Date())) return { ok: false, why: 'rate' }
  const [link] = await withTenant(auth.tenantId, (tx) => tx.select({ id: partnerLinks.id }).from(partnerLinks)
    .where(and(eq(partnerLinks.tenantId, auth.tenantId), isNull(partnerLinks.removedAt)))).catch((e) => { console.error('[studio] link', errName(e)); return [] })
  if (!link) return { ok: false, why: 'closed' }
  const r = await reserveCredits({ userId: auth.userId, sessionId: auth.authSession, stepup: auth.partnerHash },
    { linkId: link.id, kind: 'turn', what: 'edit', estimate: turnEstimate(ceiling, rate.rateE4) })
  return r.ok ? { ok: true, useId: r.value.useId } : { ok: false, why: creditWhy(r.error) }
}


/** Whether the agent and environment at Anthropic are the ones this code was built for (the drift check,
 *  runtime-managed.ts agentMatches): asked before every fresh start, a yes kept 5 minutes per process; a no or an error
 *  refuses the start and is asked again next time (architecture review of the phase, B1). */
const MATCH_MS = 5 * 60_000
const matched = new WeakMap<StudioRuntime, number>()
async function agentOk(rt: StudioRuntime): Promise<boolean> {
  const at = matched.get(rt)
  if (at && Date.now() - at < MATCH_MS) return true
  const ok = await rt.agentMatches().catch(() => false)
  if (ok) matched.set(rt, Date.now())
  else matched.delete(rt)
  return ok
}

/** A Send's whole request (the page's maxDuration 60): the start's steps begin before START_MS, the follow ends by FOLLOW_MS. */
const START_MS = 35_000
const FOLLOW_MS = 55_000

type Opened = { sessionId: string; turnId: string; runtimeId: string | null; budgetCents: number; pausedBefore: boolean; fresh: boolean }

/** Send: the person's line and a turn on their own session (a new one when none is open or its margin is gone). */
export async function send(auth: StudioOk, raw: string, deps: Deps = DEFAULT): Promise<SendResult> {
  const t0 = Date.now()
  const text = sendText(raw)
  const caps = studioCaps()
  if (!text) return { ok: false, why: 'input' }
  if (!caps || STUDIO_OPEN !== 'staff') return { ok: false, why: 'closed' }
  if (!(await withinLimit(LIMITS.studioSendUser, auth.userId, new Date(), true))) return { ok: false, why: 'limit' }
  // Credits first (V3b K3): held for the partner and this store, then tied to the turn in the transaction that opens it.
  // Any refusal or failure before the turn opens gives every credit back; after, the turn's end settles or returns them
  // in the database (app_studio_settle). The USD caps below stay the outer guard.
  const held = await holdCredits(auth, caps.turnCeiling)
  if (!held.ok) return { ok: false, why: held.why }
  let opened: Opened
  try {
    opened = await withStudio(auth, async (tx, partnerId) => {
      await tx.execute(sql`set local lock_timeout = '2s'`)
      const [open] = await tx.select({ id: studioSessions.id, runtimeId: studioSessions.runtimeId }).from(studioSessions)
        .where(and(eq(studioSessions.tenantId, auth.tenantId), eq(studioSessions.userId, auth.userId), isNull(studioSessions.endedAt)))
      let sessionId = open?.id ?? null, runtimeId = open?.runtimeId ?? null, pausedBefore = false
      if (sessionId) {
        const [last] = await tx.select({ endedAt: studioTurns.endedAt, pausedAt: studioTurns.pausedAt, failedAt: studioTurns.failedAt }).from(studioTurns)
          .where(and(eq(studioTurns.tenantId, auth.tenantId), eq(studioTurns.sessionId, sessionId))).orderBy(desc(studioTurns.sentAt)).limit(1)
        if (last && !last.endedAt && !last.pausedAt && !last.failedAt) throw Object.assign(new Error('turn_open'), { cause: { code: 'P0001', message: 'turn_open' } })
        pausedBefore = !!last?.pausedAt
        // The margin gone (the largest request reaches the ceiling): this session ends and a new one starts (F8).
        const s = await spendOf(tx, sessionId)
        if (!budgetFor({ ...s, ceiling: caps.turnCeiling, floor: caps.floor }).ok) {
          await tx.execute(sql`select app_studio_end_session(${sessionId}::uuid, 'restart', 0::bigint)`)
          sessionId = null; runtimeId = null; pausedBefore = false
        }
      }
      const fresh = !sessionId
      if (!sessionId) sessionId = one<{ id: string }>(await tx.execute(sql`select app_studio_new_session() as id`))!.id
      const turnId = one<{ id: string }>(await tx.execute(sql`select app_studio_open_turn(${sessionId}::uuid, ${caps.turnCeiling}::bigint,
        ${caps.personDay}::bigint, ${caps.platformDay}::bigint, ${caps.openSessions}::integer) as id`))!.id
      const tied = one<{ ok: boolean }>(await tx.execute(sql`select app_studio_turn_use(${turnId}::uuid, ${held.useId}::uuid) as ok`))?.ok === true
      if (!tied) throw new Error('studio: credits not tied')
      await tx.insert(studioMessages).values({ tenantId: auth.tenantId, partnerId, sessionId, kind: 'person', text })
      const s = await spendOf(tx, sessionId)
      const b = budgetFor({ ...s, ceiling: caps.turnCeiling, floor: caps.floor })
      return { sessionId, turnId, runtimeId, budgetCents: b.ok ? b.cents : 0, pausedBefore, fresh }
    })
  } catch (err) {
    // Nothing opened (the transaction rolled back): every credit back. A refusal at the person's own limit (a turn still
    // open, a Send at the same moment, their day, three sessions) is a cancel; anything else is ours.
    const why = refusalOf(err)
    await returnCredits(held.useId, why === 'turn_open' || why === 'busy' || why === 'person_day' || why === 'sessions' ? 'cancelled' : 'frrata').catch((e) => console.error('[studio] credits back', errName(e)))
    return { ok: false, why }
  }
  const rt = deps.runtime
  let runtimeId = opened.runtimeId
  if (opened.fresh || !runtimeId) {
    const started = await start(auth, opened, deps, t0 + START_MS)
    if (!started.ok) {
      await failSession(auth, opened, 'start', started.runtimeId)
      return { ok: false, why: 'start' }
    }
    runtimeId = started.runtimeId
  } else {
    // At the cap only settle events are taken and a raise resumes the old work: raise, interrupt, then the message.
    try {
      await rt.setBudget(runtimeId, opened.budgetCents)
      if (opened.pausedBefore) await rt.interrupt(runtimeId)
    } catch (err) {
      console.error('[studio] budget', err instanceof RuntimeError ? err.code : errName(err))
      await failSession(auth, opened, 'budget', runtimeId)
      return { ok: false, why: 'budget' }
    }
  }
  try {
    await rt.send(runtimeId, text)
  } catch (err) {
    // The message may have been delivered all the same: the session ends, so no later turn adopts it (security R5 MED-2).
    console.error('[studio] send', err instanceof RuntimeError ? err.code : errName(err))
    await failSession(auth, opened, 'send', runtimeId)
    return { ok: false, why: 'send' }
  }
  if (deps.follow) {
    const ref = { tenantId: auth.tenantId, turnId: opened.turnId }
    try { after(() => advance(ref, { followMs: 20_000, deadline: t0 + FOLLOW_MS }).then(() => undefined, (e) => console.error('[studio] follow', errName(e)))) } catch { /* not in a request: the cron reads it */ }
  }
  return { ok: true, sessionId: opened.sessionId, turnId: opened.turnId }
}

/** A fresh session's start; each runtime call after a committed row, and none begun past `deadline` (each call is held
 *  to CALL_MS.control, so the request ends inside its minute). Returns the runtime id once recorded. */
async function start(auth: StudioOk, o: Opened, deps: Deps, deadline: number): Promise<{ ok: true; runtimeId: string } | { ok: false; runtimeId: string | null }> {
  const rt = deps.runtime
  const late = () => Date.now() > deadline
  // 0. The agent and environment are the ones this code was built for (no key is minted for a drifted agent).
  if (!(await agentOk(rt))) { console.error('[studio] start: the agent or environment differs'); return { ok: false, runtimeId: null } }
  const set = (kind: 'runtime' | 'vault' | 'file', value: string) => withStudio(auth, async (tx) =>
    one<{ ok: boolean }>(await tx.execute(sql`select app_studio_set_vendor(${o.sessionId}::uuid, ${kind}, ${value}) as ok`))?.ok === true).catch(() => false)
  // 1. The build key, minted and recorded on the session in one transaction (its row before any vault call).
  const limited = await buildKeyLimitOk(auth.tenantId)
  const minted = await withStudio(auth, async (tx) => {
    const m = await mintBuildKey(tx, { tenantId: auth.tenantId, userId: auth.userId, email: auth.email, role: 'partner', support: false }, { purpose: 'session', name: 'Studio session', limited })
    if (!m.ok) return null
    const ok = one<{ ok: boolean }>(await tx.execute(sql`select app_studio_set_key(${o.sessionId}::uuid, ${m.id}::uuid) as ok`))?.ok === true
    if (!ok) throw new Error('studio: key not recorded')
    return m.key
  }).catch((e) => { console.error('[studio] key', errName(e)); return null })
  if (!minted) { if (limited) await buildKeyUncount(auth.tenantId).catch(() => {}); return { ok: false, runtimeId: null } }
  // 2. The vault holding it, then its id (a vault not recorded is deleted here).
  if (late()) return { ok: false, runtimeId: null }
  let vaultId: string
  try { vaultId = await rt.createVault(minted) } catch { return { ok: false, runtimeId: null } }
  if (!(await set('vault', vaultId))) { await rt.deleteVault(vaultId).catch(() => {}); return { ok: false, runtimeId: null } }
  // 3. Starter 0's file, then its id.
  if (late()) return { ok: false, runtimeId: null }
  let fileId: string | null = null
  try {
    const s = deps.starter()
    fileId = await rt.uploadStarter(s.bytes, s.sha256)
    if (!(await set('file', fileId))) { await rt.deleteFile(fileId).catch(() => {}); return { ok: false, runtimeId: null } }
  } catch (err) { console.error('[studio] starter', err instanceof RuntimeError ? err.code : errName(err)); return { ok: false, runtimeId: null } }
  // 4. The session, always with its budget, then its id.
  if (late()) return { ok: false, runtimeId: null }
  let runtimeId: string
  try { runtimeId = await rt.start({ title: 'Frrata agent', budgetCents: o.budgetCents, vaultId, fileId }) } catch { return { ok: false, runtimeId: null } }
  if (!(await set('runtime', runtimeId))) { await rt.remove(runtimeId).catch(() => {}); return { ok: false, runtimeId: null } }
  return { ok: true, runtimeId }
}

/** A Send that failed after its turn opened: the turn fails with its measured cost and the session ends (the cron then
 *  cleans up what was recorded). */
async function failSession(auth: StudioOk, o: Opened, reason: 'start' | 'send' | 'budget', runtimeId: string | null) {
  // The runtime session may still run (a message delivered all the same): the turn holds its reserve until the cron's
  // clean-up archives it and settles what it measured; with no runtime session nothing ran (security review of the phase).
  const measured = runtimeId ? null : 0
  await withStudio(auth, async (tx) => {
    await tx.execute(sql`select app_studio_close_turn(${o.turnId}::uuid, 'failed', ${reason}, ${measured}::bigint, null::bigint)`)
    await tx.execute(sql`select app_studio_end_session(${o.sessionId}::uuid, ${reason === 'start' ? 'start_failed' : 'restart'}, 0::bigint)`)
  }).catch((e) => console.error('[studio] fail', reason, errName(e)))
}

/** Stop: the person's own open session ends (its open turn fails, measured), then it is cleaned up. */
export async function stop(auth: StudioOk, rt: StudioRuntime = managedRuntime): Promise<{ ok: boolean }> {
  // No hourly limit: a person near the Send limit can always Stop (one open session a person; ending is idempotent).
  const open = await withStudio(auth, (tx) => tx.select({ id: studioSessions.id, runtimeId: studioSessions.runtimeId }).from(studioSessions)
    .where(and(eq(studioSessions.tenantId, auth.tenantId), eq(studioSessions.userId, auth.userId), isNull(studioSessions.endedAt)))).catch(() => [])
  const s = open[0]
  if (!s) return { ok: true }
  // The end recorded first, its turn holding the reserve (no later turn adopts anything of it: architecture review of
  // the phase); then the interrupt; then the cost read and settled once, uncapped, for the bound person (security review
  // of the phase, LOW: a cost read before the interrupt misses the tail). An unread cost is settled by the clean-up.
  const ended = await withStudio(auth, async (tx) =>
    one<{ ok: boolean }>(await tx.execute(sql`select app_studio_end_session(${s.id}::uuid, 'stopped', ${s.runtimeId ? null : 0}::bigint) as ok`))?.ok === true).catch(() => false)
  if (ended && s.runtimeId) {
    await rt.interrupt(s.runtimeId).catch(() => {})
    const listCost = await listCostOf(rt, s.runtimeId)
    await withStudio(auth, async (tx) => {
      const measured = measuredOf((await spendOf(tx, s.id)).spent, listCost)
      if (measured !== null) await tx.execute(sql`select app_studio_settle_ended(${s.id}::uuid, ${measured}::bigint)`)
    }).catch((e) => console.error('[studio] stop settle', errName(e)))
  }
  // Its key, vault and file are cleaned by the next cron minute (src/lib/studio/cron.ts), never from a person's request.
  return { ok: ended }
}

/** The chat's poll (src/app/(partner)/partner/studio/rows/route.ts, in after()): the person's own open turn, read under
 *  their bind, advanced; skipped when an advance read it in the last 5 s (the lease statement checks, in the database). */
export async function pollAdvance(auth: StudioOk, rt: StudioRuntime = managedRuntime): Promise<void> {
  if (STUDIO_OPEN !== 'staff') return
  const open = await withStudio(auth, (tx) => tx.select({ id: studioTurns.id }).from(studioTurns)
    .innerJoin(studioSessions, and(eq(studioSessions.id, studioTurns.sessionId), eq(studioSessions.tenantId, studioTurns.tenantId)))
    .where(and(eq(studioTurns.tenantId, auth.tenantId), eq(studioSessions.userId, auth.userId), isNull(studioSessions.endedAt),
      isNull(studioTurns.endedAt), isNull(studioTurns.pausedAt), isNull(studioTurns.failedAt))).limit(1)).catch(() => [])
  const turn = open[0]
  if (!turn) return
  await advance({ tenantId: auth.tenantId, turnId: turn.id }, { runtime: rt, minGapMs: 5_000, deadline: Date.now() + 25_000 }).catch((e) => console.error('[studio] poll', errName(e)))
}
