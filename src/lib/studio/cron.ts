import 'server-only'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { endReason, type EndReason } from '@/domains/studio/session'
import { auditEvents } from '@/lib/db/schema'
import { storefrontKeys } from '@/lib/db/schema-storefront-api'
import { withTenant } from '@/lib/db/tenant'
import { studioDue, sweepStudioBinds } from '@/lib/db/studio'
import { STUDIO_OPEN } from '@/lib/env'
import { errName } from '@/lib/log'
import { advance } from './advance'
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
