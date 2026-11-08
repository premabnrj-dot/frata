'use server'

import { and, eq, isNull, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { CODE_RE, MAX_RUNNING_OFFERS, parseOffer, RUNNING_FULL, type OfferPatch, type OfferValues } from '@/domains/checkout/offer-form'
import { asMember } from '@/lib/auth/as-member'
import { CAN_BUILD, CAN_MANAGE } from '@/lib/auth/require-member'
import { discountCodes, discountTargets, discountTiers, discounts } from '@/lib/db/schema-discounts'
import { refreshShop } from '@/lib/queries/storefront'
import { alreadyQualify } from '@/lib/queries/discounts'
import type { Tx } from '@/lib/db'
import { runningOffers } from '@/lib/db/discount-predicates'

// =============================================================================
// OFFERS: who may do what (spec § Who controls what; owner call 6). Owners, admins and the store's partner draft
// and edit drafts (CAN_BUILD); only owners and admins start, pause, end, or change an offer already started
// (CAN_MANAGE) — every rule enforced in the UPDATE's own WHERE, not only by the button shown. A code is set when
// the offer is made and never changes (unique per shop, forever). Every change refreshes the cached shop.
// An offer Frrata stopped (O·4) is frozen for the shop: it can be ended, nothing else (`stopped_at is null` in each
// WHERE). At most MAX_RUNNING_OFFERS run at once, counted under the shop's offers lock when one starts.
// =============================================================================

export type OfferResult = { ok: true; id: string } | { ok: false; error: string; errors?: Record<string, string> }

const isManager = (role: string) => (CAN_MANAGE as readonly string[]).includes(role)
const done = (tenantId: string) => { refreshShop(tenantId, 'shop'); revalidatePath('/console/offers') }
const UNIQUE = '23505'
const STOPPED = 'Frrata stopped this offer, so it does not change. You can end it; to run it again, ask Frrata support.'
const codeOf = (err: unknown) => (err as { cause?: { code?: string; constraint_name?: string } })?.cause

/**
 * Only one STARTED offer in the bar: when this one takes it (saving a started offer, or starting a draft that asked
 * for it), the others let go first — a draft's wish never empties the bar of a live offer (impact review).
 */
async function claimBar(tx: Tx, tenantId: string, id: string | null) {
  // BEFORE this offer is written with announce = true: the one-bar index is not deferrable (tenancy audit).
  await tx.update(discounts).set({ announce: false }).where(and(eq(discounts.tenantId, tenantId), eq(discounts.announce, true), ...(id ? [sql`${discounts.id} <> ${id}`] : [])))
}

/** An offer's targets and tiers, replaced whole with each save (rows are never updated in place: 0040). */
async function replaceParts(tx: Tx, tenantId: string, id: string, p: OfferPatch) {
  await tx.delete(discountTargets).where(and(eq(discountTargets.tenantId, tenantId), eq(discountTargets.discountId, id)))
  await tx.delete(discountTiers).where(and(eq(discountTiers.tenantId, tenantId), eq(discountTiers.discountId, id)))
  if (p.targets !== 'all' && p.targetIds.length) await tx.insert(discountTargets).values(p.targetIds.map((t) => ({ tenantId, discountId: id, ...(p.targets === 'products' ? { productId: t } : { collectionId: t }) })))
  if (p.tiers.length) await tx.insert(discountTiers).values(p.tiers.map((t) => ({ tenantId, discountId: id, minSubtotal: t.min, percentBps: t.percentBps, amountOff: t.amountOff })))
}

export async function saveOffer(id: string | null, values: OfferValues): Promise<OfferResult> {
  const parsed = parseOffer(values)
  if (!parsed.ok) return { ok: false, error: 'Some fields need a look before saving.', errors: parsed.errors }
  const p = parsed.patch
  try {
    const r = await asMember(CAN_BUILD, { action: id ? 'offer.edit' : 'offer.create', target: id ?? undefined, detail: { style: p.style } }, async (tx, auth) => {
      const tenantId = auth.membership.tenantId
      const cols = { title: p.title, percentBps: p.percentBps, amountOff: p.amountOff, cap: p.cap, minSubtotal: p.minSubtotal, startsAt: p.startsAt, endsAt: p.endsAt,
        limitTotal: p.limitTotal, limitPerPhone: p.limitPerPhone, budget: p.budget, listed: p.listed, combinesWithPayment: p.combinesWithPayment, announce: p.announce,
        targets: p.targets, buyQty: p.buyQty, getQty: p.getQty, getBps: p.getBps, giftVariantId: p.giftVariantId, firstOrder: p.firstOrder }
      if (!id) {
        const [d] = await tx.insert(discounts).values({ tenantId, style: p.style, createdBy: auth.userId, ...cols }).returning({ id: discounts.id })
        if (p.code) await tx.insert(discountCodes).values({ tenantId, discountId: d!.id, code: p.code })
        await replaceParts(tx, tenantId, d!.id, p)
        return { ok: true as const, id: d!.id, tenantId }
      }
      if (!/^[0-9a-f-]{36}$/.test(id)) return { ok: false as const, error: 'This offer was not found.' }
      const [cur] = await tx.select({ startedAt: discounts.startedAt, endedAt: discounts.endedAt, stoppedAt: discounts.stoppedAt, style: discounts.style }).from(discounts)
        .where(and(eq(discounts.tenantId, tenantId), eq(discounts.id, id))).for('update')
      if (!cur) return { ok: false as const, error: 'This offer was not found.' }
      if (cur.endedAt) return { ok: false as const, error: 'An ended offer does not change. Duplicate it to run it again.' }
      if (cur.stoppedAt) return { ok: false as const, error: STOPPED }
      if (cur.startedAt && !isManager(auth.membership.role)) return { ok: false as const, error: 'Only an owner or admin can change an offer that has started.' }
      if (cur.style !== p.style) return { ok: false as const, error: 'The style of an offer does not change. Make a new one.' }
      if (p.announce && cur.startedAt) await claimBar(tx, tenantId, id)
      const upd = await tx.update(discounts).set(cols)
        .where(and(eq(discounts.tenantId, tenantId), eq(discounts.id, id), isNull(discounts.endedAt), isNull(discounts.stoppedAt), ...(isManager(auth.membership.role) ? [] : [isNull(discounts.startedAt)])))
        .returning({ id: discounts.id })
      if (!upd.length) return { ok: false as const, error: 'This offer changed meanwhile. Reload the page.' }
      await replaceParts(tx, tenantId, id, p)
      return { ok: true as const, id, tenantId }
    })
    if (!r.ok) return { ok: false, error: r.error }
    if (!r.value.ok) return r.value
    done(r.value.tenantId)
    return { ok: true, id: r.value.id }
  } catch (err) {
    const c = codeOf(err)
    if (c?.code === UNIQUE && c.constraint_name === 'discount_codes_tenant_code') return { ok: false, error: 'That code was used before in your shop. Codes are never reused.', errors: { code: 'Used before. Choose another.' } }
    console.error('[offers] save', c?.code ?? (err instanceof Error ? err.name : 'error'))
    return { ok: false, error: 'We could not save the offer. Try again.' }
  }
}

type Step = 'start' | 'pause' | 'resume' | 'end'

/** Start (a draft), pause, resume, or end for good — owners and admins only, each guarded in its own WHERE. */
export async function stepOffer(id: string, step: Step): Promise<OfferResult> {
  if (!/^[0-9a-f-]{36}$/.test(id) || !['start', 'pause', 'resume', 'end'].includes(step)) return { ok: false, error: 'This offer was not found.' }
  const r = await asMember(CAN_MANAGE, { action: `offer.${step}`, target: id }, async (tx, auth) => {
    const tenantId = auth.membership.tenantId
    // Ending still works on an offer Frrata stopped; nothing else does.
    const mine = and(eq(discounts.tenantId, tenantId), eq(discounts.id, id), isNull(discounts.endedAt), ...(step === 'end' ? [] : [isNull(discounts.stoppedAt)]))
    const now = new Date()
    const set = step === 'start' ? { startedAt: now, startedBy: auth.userId } : step === 'pause' ? { pausedAt: now } : step === 'resume' ? { pausedAt: null } : { endedAt: now, announce: false }
    const guard = step === 'start' ? isNull(discounts.startedAt) : step === 'pause' ? and(sql`${discounts.startedAt} is not null`, isNull(discounts.pausedAt)) : step === 'resume' ? sql`${discounts.pausedAt} is not null` : undefined
    if (step === 'start') {
      // Paused and scheduled offers already count as running, so only a start can cross the limit.
      if (await runningOffers(tx, tenantId, now) >= MAX_RUNNING_OFFERS) return { done: false, full: true, tenantId }
      const [cur] = await tx.select({ announce: discounts.announce }).from(discounts).where(mine)
      if (cur?.announce) await claimBar(tx, tenantId, id)
    }
    const upd = await tx.update(discounts).set(set).where(guard ? and(mine, guard) : mine).returning({ id: discounts.id })
    return { done: upd.length > 0, full: false, tenantId }
  })
  if (!r.ok) return { ok: false, error: r.error }
  if (r.value.full) return { ok: false, error: RUNNING_FULL }
  if (!r.value.done) return { ok: false, error: 'This offer changed meanwhile, or Frrata stopped it. Reload the page.' }
  done(r.value.tenantId)
  return { ok: true, id }
}

/** How much of last month's orders an order offer would mostly reward (the form's warning). Read only. */
export async function checkQualify(v: { minSubtotal: number; percentBps: number | null; amountOff: number | null; cap: number | null }) {
  const ok = [v.minSubtotal, v.percentBps ?? 0, v.amountOff ?? 0, v.cap ?? 0].every((x) => Number.isSafeInteger(x) && x >= 0)
  if (!ok) return null
  const r = await asMember(CAN_BUILD, { action: 'offer.qualify' }, async (_tx, auth) => alreadyQualify(auth.membership.tenantId, v))
  return r.ok ? r.value : null
}

/**
 * A creator's code on an offer (owners and admins: it changes who gets a started offer). Its link is the shop's own
 * address with ?code=. Never listed; unique per shop forever, like every code.
 */
export async function addCreatorCode(id: string, label: string, code: string): Promise<OfferResult> {
  const c = code.trim().toUpperCase(), l = label.trim()
  if (!/^[0-9a-f-]{36}$/.test(id)) return { ok: false, error: 'This offer was not found.' }
  if (!l || l.length > 40) return { ok: false, error: 'Name the creator, up to 40 characters.', errors: { label: 'Who is it for?' } }
  if (!CODE_RE.test(c)) return { ok: false, error: 'Check the code.', errors: { code: '4 to 20 letters or digits, no spaces.' } }
  try {
    const r = await asMember(CAN_MANAGE, { action: 'offer.creator_code', target: id, detail: { label: l } }, async (tx, auth) => {
      const tenantId = auth.membership.tenantId
      const [cur] = await tx.select({ endedAt: discounts.endedAt, stoppedAt: discounts.stoppedAt }).from(discounts).where(and(eq(discounts.tenantId, tenantId), eq(discounts.id, id)))
      if (!cur || cur.endedAt || cur.stoppedAt) return { done: false, tenantId }
      await tx.insert(discountCodes).values({ tenantId, discountId: id, code: c, label: l })
      return { done: true, tenantId }
    })
    if (!r.ok) return { ok: false, error: r.error }
    if (!r.value.done) return { ok: false, error: 'This offer has ended, was stopped by Frrata, or was not found.' }
    done(r.value.tenantId)
    return { ok: true, id }
  } catch (err) {
    const k = codeOf(err)
    if (k?.code === UNIQUE) return { ok: false, error: 'That code was used before in your shop. Codes are never reused.', errors: { code: 'Used before. Choose another.' } }
    console.error('[offers] creator code', k?.code ?? (err instanceof Error ? err.name : 'error'))
    return { ok: false, error: 'We could not add the code. Try again.' }
  }
}
