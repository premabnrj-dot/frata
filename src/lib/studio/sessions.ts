import 'server-only'
import { after } from 'next/server'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { budgetFor, deltaOf, studioCaps } from '@/domains/studio/spend'
import type { MicroUsd } from '@/domains/money/usd'
import { endReason, type EndReason } from '@/domains/studio/session'
import type { Tx } from '@/lib/db'
import { auditEvents } from '@/lib/db/schema'
import { LINE_MAX, studioMessages, studioSessions, studioTurns } from '@/lib/db/schema-studio'
import { storefrontKeys } from '@/lib/db/schema-storefront-api'
import { withTenant } from '@/lib/db/tenant'
import { LIMITS, withinLimit } from '@/lib/db/rate-limit'
import { STUDIO_OPEN } from '@/lib/env'
import { errName } from '@/lib/log'
import { buildKeyLimitOk, buildKeyUncount, mintBuildKey } from '@/lib/storefront-api/build-keys'
import { studioDue, sweepStudioBinds } from '@/lib/db/studio'
import { advance } from './advance'
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

/** `busy`: a lock wait or a Send at the same moment (try again); `limit`: too many Sends this hour (slow down). */
export type SendWhy = 'closed' | 'input' | 'busy' | 'limit' | 'person_day' | 'platform_day' | 'sessions' | 'turn_open' | 'start' | 'send' | 'budget' | 'error'
export type SendResult = { ok: true; sessionId: string; turnId: string } | { ok: false; why: SendWhy }
export type Deps = { runtime: StudioRuntime; starter: () => { bytes: Uint8Array; sha256: string }; follow: boolean }
const DEFAULT: Deps = { runtime: managedRuntime, starter: starterArchive, follow: true }

/** A text the person sends, as stored and sent: no NUL, trimmed, at most a line (drizzle/0163 checks LINE_MAX). */
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

async function spendOf(tx: Tx, sessionId: string) {
  const r = one<{ spent_micro: number; largest_micro: number }>(await tx.execute(sql`select spent_micro, largest_micro from app_studio_spend_of(${sessionId}::uuid)`))
  return { spent: Number(r?.spent_micro ?? 0) as MicroUsd, largest: Number(r?.largest_micro ?? 0) as MicroUsd }
}

/** The measured delta of a session's list cost since its last settle, or null when it cannot be read. */
async function listCostOf(rt: StudioRuntime, runtimeId: string | null): Promise<number | null> {
  if (!runtimeId) return 0
  return rt.usage(runtimeId).then((u) => u.listCost as number, () => null)
}
/** The one measured delta (src/domains/studio/spend.ts deltaOf, as the advance settles): null when it cannot be read. */
const deltaIn = async (tx: Tx, sessionId: string, listCost: number | null) =>
  listCost === null ? null : deltaOf((await spendOf(tx, sessionId)).spent, listCost as MicroUsd)

type Opened = { sessionId: string; turnId: string; runtimeId: string | null; budgetCents: number; pausedBefore: boolean; fresh: boolean }

/** Send: the person's line and a turn on their own session (a new one when none is open or its margin is gone). */
export async function send(auth: StudioOk, raw: string, deps: Deps = DEFAULT): Promise<SendResult> {
  const text = sendText(raw)
  const caps = studioCaps()
  if (!text) return { ok: false, why: 'input' }
  if (!caps || STUDIO_OPEN !== 'staff') return { ok: false, why: 'closed' }
  if (!(await withinLimit(LIMITS.studioSendUser, auth.userId, new Date(), true))) return { ok: false, why: 'limit' }
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
      await tx.insert(studioMessages).values({ tenantId: auth.tenantId, partnerId, sessionId, kind: 'person', text })
      const s = await spendOf(tx, sessionId)
      const b = budgetFor({ ...s, ceiling: caps.turnCeiling, floor: caps.floor })
      return { sessionId, turnId, runtimeId, budgetCents: b.ok ? b.cents : 0, pausedBefore, fresh }
    })
  } catch (err) {
    return { ok: false, why: refusalOf(err) }
  }
  const rt = deps.runtime
  let runtimeId = opened.runtimeId
  if (opened.fresh || !runtimeId) {
    const started = await start(auth, opened, deps)
    if (!started.ok) {
      await failSession(auth, opened, 'start', started.runtimeId, rt)
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
      await failSession(auth, opened, 'budget', runtimeId, rt)
      return { ok: false, why: 'budget' }
    }
  }
  try {
    await rt.send(runtimeId, text)
  } catch (err) {
    // The message may have been delivered all the same: the session ends, so no later turn adopts it (security R5 MED-2).
    console.error('[studio] send', err instanceof RuntimeError ? err.code : errName(err))
    await failSession(auth, opened, 'send', runtimeId, rt)
    return { ok: false, why: 'send' }
  }
  if (deps.follow) {
    const ref = { tenantId: auth.tenantId, turnId: opened.turnId }
    try { after(() => advance(ref, { followMs: 20_000, deadline: Date.now() + 55_000 }).then(() => undefined, (e) => console.error('[studio] follow', errName(e)))) } catch { /* not in a request: the cron reads it */ }
  }
  return { ok: true, sessionId: opened.sessionId, turnId: opened.turnId }
}

/** A fresh session's start; each runtime call after a committed row. Returns the runtime id once recorded. */
async function start(auth: StudioOk, o: Opened, deps: Deps): Promise<{ ok: true; runtimeId: string } | { ok: false; runtimeId: string | null }> {
  const rt = deps.runtime
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
  let vaultId: string
  try { vaultId = await rt.createVault(minted) } catch { return { ok: false, runtimeId: null } }
  if (!(await set('vault', vaultId))) { await rt.deleteVault(vaultId).catch(() => {}); return { ok: false, runtimeId: null } }
  // 3. Starter 0's file, then its id.
  let fileId: string | null = null
  try {
    const s = deps.starter()
    fileId = await rt.uploadStarter(s.bytes, s.sha256)
    if (!(await set('file', fileId))) { await rt.deleteFile(fileId).catch(() => {}); return { ok: false, runtimeId: null } }
  } catch (err) { console.error('[studio] starter', err instanceof RuntimeError ? err.code : errName(err)); return { ok: false, runtimeId: null } }
  // 4. The session, always with its budget, then its id.
  let runtimeId: string
  try { runtimeId = await rt.start({ title: 'Frrata agent', budgetCents: o.budgetCents, vaultId, fileId }) } catch { return { ok: false, runtimeId: null } }
  if (!(await set('runtime', runtimeId))) { await rt.remove(runtimeId).catch(() => {}); return { ok: false, runtimeId: null } }
  return { ok: true, runtimeId }
}

/** A Send that failed after its turn opened: the turn fails with its measured cost and the session ends (the cron then
 *  cleans up what was recorded). */
async function failSession(auth: StudioOk, o: Opened, reason: 'start' | 'send' | 'budget', runtimeId: string | null, rt: StudioRuntime) {
  const listCost = await listCostOf(rt, runtimeId)
  await withStudio(auth, async (tx) => {
    const measured = await deltaIn(tx, o.sessionId, listCost)
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
  if (s.runtimeId) await rt.interrupt(s.runtimeId).catch(() => {})
  const listCost = await listCostOf(rt, s.runtimeId)
  const ended = await withStudio(auth, async (tx) => {
    const measured = await deltaIn(tx, s.id, listCost)
    return one<{ ok: boolean }>(await tx.execute(sql`select app_studio_end_session(${s.id}::uuid, 'stopped', ${measured}::bigint) as ok`))?.ok === true
  }).catch(() => false)
  if (ended) { try { after(() => cleanSession(auth.tenantId, s.id, rt).then(() => undefined, () => undefined)) } catch { /* the cron cleans it */ } }
  return { ok: ended }
}

// ── The cron's side: ids from app_studio_due only, each step in the session's own store transaction ─────────────────

/** Ends a session for a reason the cron decides (no bind; its open turn settles at most its reserve). */
async function endUnbound(tenantId: string, sessionId: string, reason: EndReason): Promise<boolean> {
  return withTenant(tenantId, async (tx) =>
    one<{ ok: boolean }>(await tx.execute(sql`select app_studio_end_session(${sessionId}::uuid, ${reason}, null::bigint) as ok`))?.ok === true)
}

/** Why the cron ends this open session now, or null. */
async function dueEnd(tenantId: string, sessionId: string, turnOpen: boolean): Promise<EndReason | null> {
  const f = await withTenant(tenantId, async (tx) => one<{ created_at: string; last_activity_at: string; ended_at: string | null; person_live: boolean }>(
    await tx.execute(sql`select created_at, last_activity_at, ended_at, person_live from app_studio_session_facts(${sessionId}::uuid)`)))
  if (!f || f.ended_at) return null
  return endReason({ now: new Date(), createdAt: new Date(f.created_at), lastActivityAt: new Date(f.last_activity_at), turnOpen, studioOpen: STUDIO_OPEN === 'staff', actorLive: f.person_live })
}

/** An ended session's key revoked, its vault and file deleted and the session archived; then marked cleaned. A failure
 *  leaves it for the next run (each step is safe to repeat). `vendor` false (Studio unconfigured: no key to reach
 *  Anthropic): the key is revoked and the rest waits. */
export async function cleanSession(tenantId: string, sessionId: string, rt: StudioRuntime = managedRuntime, vendor = true): Promise<boolean> {
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
  try {
    if (ids.vault_id) await rt.deleteVault(ids.vault_id)
    if (ids.file_id) await rt.deleteFile(ids.file_id)
    if (ids.runtime_id) await rt.archive(ids.runtime_id).catch((e: unknown) => { if (!(e instanceof RuntimeError && e.code === 'not_found')) throw e })
  } catch (err) {
    console.error('[studio] clean', err instanceof RuntimeError ? err.code : errName(err))
    return false
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

/** The per-minute net (src/app/api/cron/studio/route.ts): each open turn advanced, sessions ended for the switch, a gone
 *  person, age or idleness, ended ones cleaned up, old ones deleted at Anthropic. No step starts past the deadline. */
export async function runStudioCron(deadline: number, rt: StudioRuntime = managedRuntime, onlyStore?: string, vendor = true): Promise<CronReport> {
  const out: CronReport = { advanced: 0, ended: 0, cleaned: 0, deleted: 0, errors: 0 }
  const room = (ms: number) => Date.now() + ms < deadline
  await sweepStudioBinds().catch((e) => { out.errors++; console.error('[studio] sweep', errName(e)) })
  // `onlyStore`: the int tests share one database across files; the route never passes it.
  const due = (await studioDue(20)).filter((d) => !onlyStore || d.tenantId === onlyStore)
  for (const d of due) {
    if (!room(20_000)) break
    try {
      // Studio unconfigured (the key removed is half the switch: security review of R6, MED-2): the database half still
      // runs. Every open session ends as `switch` and its key is revoked; Anthropic's side waits for a key.
      if (!vendor && (d.kind === 'advance' || d.kind === 'end')) { if (await endUnbound(d.tenantId, d.sessionId, 'switch')) out.ended++; continue }
      if (!vendor && d.kind === 'delete') continue
      if (d.kind === 'advance' || d.kind === 'end') {
        const why = await dueEnd(d.tenantId, d.sessionId, d.kind === 'advance')
        if (why) { if (await endUnbound(d.tenantId, d.sessionId, why)) out.ended++; continue }
        if (d.kind === 'advance' && d.turnId) {
          const r = await advance({ tenantId: d.tenantId, turnId: d.turnId }, { runtime: rt, deadline: Math.min(deadline, Date.now() + 30_000) })
          if (r === 'actor' && (await endUnbound(d.tenantId, d.sessionId, 'actor'))) out.ended++
          else if (r === 'error') out.errors++
          else out.advanced++
        }
      } else if (d.kind === 'clean') {
        if (await cleanSession(d.tenantId, d.sessionId, rt, vendor)) out.cleaned++
      } else if (d.kind === 'delete') {
        if (await deleteSession(d.tenantId, d.sessionId, rt)) out.deleted++
      }
    } catch (err) {
      out.errors++
      console.error('[studio] cron', d.kind, errName(err))
    }
  }
  return out
}
