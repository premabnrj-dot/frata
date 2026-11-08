'use server'

import { and, eq, isNull, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { parseOffer, type OfferValues } from '@/domains/checkout/offer-form'
import { asMember } from '@/lib/auth/as-member'
import { CAN_BUILD, CAN_MANAGE } from '@/lib/auth/require-member'
import { discountCodes, discounts } from '@/lib/db/schema-discounts'
import { refreshShop } from '@/lib/queries/storefront'
import { alreadyQualify } from '@/lib/queries/discounts'
import type { Tx } from '@/lib/db'

// =============================================================================
// OFFERS: who may do what (spec § Who controls what; owner call 6). Owners, admins and the store's partner draft
// and edit drafts (CAN_BUILD); only owners and admins start, pause, end, or change an offer already started
// (CAN_MANAGE) — every rule enforced in the UPDATE's own WHERE, not only by the button shown. A code is set when
// the offer is made and never changes (unique per shop, forever). Every change refreshes the cached shop.
// =============================================================================

export type OfferResult = { ok: true; id: string } | { ok: false; error: string; errors?: Record<string, string> }

const isManager = (role: string) => (CAN_MANAGE as readonly string[]).includes(role)
const done = (tenantId: string) => { refreshShop(tenantId, 'shop'); revalidatePath('/console/offers') }
const UNIQUE = '23505'
const codeOf = (err: unknown) => (err as { cause?: { code?: string; constraint_name?: string } })?.cause

/** Only one offer in the bar: turning it on for this one turns it off for the rest (in the same transaction). */
async function claimBar(tx: Tx, tenantId: string, id: string) {
  await tx.update(discounts).set({ announce: false }).where(and(eq(discounts.tenantId, tenantId), eq(discounts.announce, true), sql`${discounts.id} <> ${id}`))
}

export async function saveOffer(id: string | null, values: OfferValues): Promise<OfferResult> {
  const parsed = parseOffer(values)
  if (!parsed.ok) return { ok: false, error: 'Some fields need a look before saving.', errors: parsed.errors }
  const p = parsed.patch
  try {
    const r = await asMember(CAN_BUILD, { action: id ? 'offer.edit' : 'offer.create', target: id ?? undefined, detail: { style: p.style } }, async (tx, auth) => {
      const tenantId = auth.membership.tenantId
      const cols = { title: p.title, percentBps: p.percentBps, amountOff: p.amountOff, cap: p.cap, minSubtotal: p.minSubtotal, startsAt: p.startsAt, endsAt: p.endsAt,
        limitTotal: p.limitTotal, limitPerPhone: p.limitPerPhone, budget: p.budget, listed: p.listed, combinesWithPayment: p.combinesWithPayment, announce: p.announce }
      if (!id) {
        const [d] = await tx.insert(discounts).values({ tenantId, style: p.style, createdBy: auth.userId, ...cols }).returning({ id: discounts.id })
        if (p.announce) await claimBar(tx, tenantId, d!.id)
        if (p.code) await tx.insert(discountCodes).values({ tenantId, discountId: d!.id, code: p.code })
        return { ok: true as const, id: d!.id, tenantId }
      }
      if (!/^[0-9a-f-]{36}$/.test(id)) return { ok: false as const, error: 'This offer was not found.' }
      const [cur] = await tx.select({ startedAt: discounts.startedAt, endedAt: discounts.endedAt, style: discounts.style }).from(discounts)
        .where(and(eq(discounts.tenantId, tenantId), eq(discounts.id, id))).for('update')
      if (!cur) return { ok: false as const, error: 'This offer was not found.' }
      if (cur.endedAt) return { ok: false as const, error: 'An ended offer does not change. Duplicate it to run it again.' }
      if (cur.startedAt && !isManager(auth.membership.role)) return { ok: false as const, error: 'Only an owner or admin can change an offer that has started.' }
      if (cur.style !== p.style) return { ok: false as const, error: 'The style of an offer does not change. Make a new one.' }
      const upd = await tx.update(discounts).set(cols)
        .where(and(eq(discounts.tenantId, tenantId), eq(discounts.id, id), isNull(discounts.endedAt), ...(isManager(auth.membership.role) ? [] : [isNull(discounts.startedAt)])))
        .returning({ id: discounts.id })
      if (!upd.length) return { ok: false as const, error: 'This offer changed meanwhile. Reload the page.' }
      if (p.announce) await claimBar(tx, tenantId, id)
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
    const mine = and(eq(discounts.tenantId, tenantId), eq(discounts.id, id), isNull(discounts.endedAt))
    const now = new Date()
    const set = step === 'start' ? { startedAt: now, startedBy: auth.userId } : step === 'pause' ? { pausedAt: now } : step === 'resume' ? { pausedAt: null } : { endedAt: now, announce: false }
    const guard = step === 'start' ? isNull(discounts.startedAt) : step === 'pause' ? and(sql`${discounts.startedAt} is not null`, isNull(discounts.pausedAt)) : step === 'resume' ? sql`${discounts.pausedAt} is not null` : undefined
    const upd = await tx.update(discounts).set(set).where(guard ? and(mine, guard) : mine).returning({ id: discounts.id })
    return { done: upd.length > 0, tenantId }
  })
  if (!r.ok) return { ok: false, error: r.error }
  if (!r.value.done) return { ok: false, error: 'This offer changed meanwhile. Reload the page.' }
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
