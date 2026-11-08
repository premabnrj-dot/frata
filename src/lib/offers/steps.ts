import 'server-only'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { MAX_RUNNING_OFFERS, RUNNING_FULL } from '@/domains/checkout/offer-form'
import type { Tx } from '@/lib/db'
import { runningOffers } from '@/lib/db/discount-predicates'
import { discounts } from '@/lib/db/schema-discounts'

// =============================================================================
// FILE: src/lib/offers/steps.ts — what may happen to an offer, inside the caller's tenant transaction (the console's
// server actions call these; offers.int test proves each refusal). Rules (spec § Who controls what; O·4):
//  - an ended offer never changes; one Frrata stopped changes for nobody but Frrata, except that the shop may END it;
//  - only owners and admins change a started offer, and the style never changes;
//  - at most MAX_RUNNING_OFFERS run: a start, or a lapsed started offer given a later end, is counted under the
//    shop's offers lock (runningOffers).
// =============================================================================

export const STOPPED = 'Frrata stopped this offer, so it does not change. You can end it; to run it again, ask Frrata support.'

/**
 * Only one STARTED offer in the bar: when this one takes it (saving a started offer, or starting a draft that asked
 * for it), the others let go first — a draft's wish never empties the bar of a live offer (impact review).
 * BEFORE this offer is written with announce = true: the one-bar index is not deferrable (tenancy audit).
 */
export async function claimBar(tx: Tx, tenantId: string, id: string | null) {
  await tx.update(discounts).set({ announce: false }).where(and(eq(discounts.tenantId, tenantId), eq(discounts.announce, true), ...(id ? [sql`${discounts.id} <> ${id}`] : [])))
}

/**
 * Whether a save may change offer `id` (locked FOR UPDATE until the caller commits): null, or what to tell the
 * merchant. The caller's UPDATE repeats the state rules in its WHERE.
 */
export async function editRefusal(tx: Tx, tenantId: string, id: string, c: { manager: boolean; style: string; endsAt: Date | null }, now: Date): Promise<string | null> {
  const [cur] = await tx.select({ startedAt: discounts.startedAt, endedAt: discounts.endedAt, stoppedAt: discounts.stoppedAt, endsAt: discounts.endsAt, style: discounts.style }).from(discounts)
    .where(and(eq(discounts.tenantId, tenantId), eq(discounts.id, id))).for('update')
  if (!cur) return 'This offer was not found.'
  if (cur.endedAt) return 'An ended offer does not change. Duplicate it to run it again.'
  if (cur.stoppedAt) return STOPPED
  if (cur.startedAt && !c.manager) return 'Only an owner or admin can change an offer that has started.'
  if (cur.style !== c.style) return 'The style of an offer does not change. Make a new one.'
  // A started offer past its end that gets a later end runs again: it counts toward the limit like a start (audit).
  if (cur.startedAt && cur.endsAt && cur.endsAt <= now && (!c.endsAt || c.endsAt > now) && await runningOffers(tx, tenantId, now) >= MAX_RUNNING_OFFERS) return RUNNING_FULL
  return null
}

export type Step = 'start' | 'pause' | 'resume' | 'end'
export const STEPS: readonly Step[] = ['start', 'pause', 'resume', 'end']

/** Start (a draft), pause, resume, or end for good, each guarded in its own WHERE. 'full' when a start would pass the limit. */
export async function stepOfferIn(tx: Tx, tenantId: string, userId: string, id: string, step: Step, now: Date): Promise<'done' | 'full' | 'none'> {
  // Ending still works on an offer Frrata stopped; nothing else does.
  const mine = and(eq(discounts.tenantId, tenantId), eq(discounts.id, id), isNull(discounts.endedAt), ...(step === 'end' ? [] : [isNull(discounts.stoppedAt)]))
  const set = step === 'start' ? { startedAt: now, startedBy: userId } : step === 'pause' ? { pausedAt: now } : step === 'resume' ? { pausedAt: null } : { endedAt: now, announce: false }
  const guard = step === 'start' ? isNull(discounts.startedAt) : step === 'pause' ? and(sql`${discounts.startedAt} is not null`, isNull(discounts.pausedAt)) : step === 'resume' ? sql`${discounts.pausedAt} is not null` : undefined
  if (step === 'start') {
    // Paused and scheduled offers already count as running, so only a start can cross the limit.
    if (await runningOffers(tx, tenantId, now) >= MAX_RUNNING_OFFERS) return 'full'
    const [cur] = await tx.select({ announce: discounts.announce }).from(discounts).where(mine)
    if (cur?.announce) await claimBar(tx, tenantId, id)
  }
  const upd = await tx.update(discounts).set(set).where(guard ? and(mine, guard) : mine).returning({ id: discounts.id })
  return upd.length ? 'done' : 'none'
}

/** Whether a creator code may be added: the offer exists, has not ended and was not stopped by Frrata. */
export async function codeRefusal(tx: Tx, tenantId: string, id: string): Promise<boolean> {
  const [cur] = await tx.select({ endedAt: discounts.endedAt, stoppedAt: discounts.stoppedAt }).from(discounts).where(and(eq(discounts.tenantId, tenantId), eq(discounts.id, id)))
  return !cur || !!cur.endedAt || !!cur.stoppedAt
}
