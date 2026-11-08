// =============================================================================
// FILE: src/domains/checkout/offer-form.ts — what a merchant types for an offer, checked once, turned into columns
// (paise and bps). The console form draws from the same definitions; the action parses with parseOffer(). Pure.
// =============================================================================

import { DISCOUNT_STYLES, type DiscountStyle } from './discounts'

export type OfferValues = {
  title: string; style: string; kind: string; value: string; cap: string; min: string; code: string
  startsAt: string; endsAt: string; limitTotal: string; limitPerPhone: string; budget: string
  listed: boolean; combinesWithPayment: boolean; announce: boolean
  /** O·2 (optional, so an O·1 form still parses): what a product offer covers, Buy X get Y, the gift, tiers, first order. */
  targets?: string; targetIds?: string[]; buyQty?: string; getQty?: string; getPct?: string; giftVariantId?: string
  tiers?: { min: string; value: string }[]; firstOrder?: boolean
}
export type OfferPatch = {
  title: string; style: DiscountStyle; percentBps: number | null; amountOff: number | null; cap: number | null; minSubtotal: number
  code: string | null; startsAt: Date; endsAt: Date | null; limitTotal: number | null; limitPerPhone: number | null; budget: number | null
  listed: boolean; combinesWithPayment: boolean; announce: boolean
  targets: 'all' | 'products' | 'collections'; targetIds: string[]
  buyQty: number | null; getQty: number | null; getBps: number | null; giftVariantId: string | null
  tiers: { min: number; percentBps: number | null; amountOff: number | null }[]; firstOrder: boolean
}

/** What each style is called, and the one line under it (the form's style picker). */
export const STYLE_LABEL: Record<DiscountStyle, { name: string; line: string }> = {
  order_off: { name: '% or ₹ off the order', line: 'With a minimum bag value. Festive sales, welcome offers.' },
  free_shipping: { name: 'Free shipping', line: 'Above a bag value, or with a code.' },
  pay_online: { name: 'Pay online, save', line: 'Fewer COD orders. Shown on the pay-online card.' },
  product_off: { name: '% or ₹ off products', line: 'On chosen products or collections. A badge on each.' },
  bxgy: { name: 'Buy X, get Y', line: 'Buy 2, get 1 free. Basics, kidswear, accessories.' },
  free_gift: { name: 'Free gift', line: 'A chosen piece free above a bag value.' },
}

const rupees = (s: string) => (/^\d{1,7}(\.\d{1,2})?$/.test(s.trim()) ? Math.round(Number(s.trim()) * 100) : null)
const whole = (s: string) => (/^\d{1,7}$/.test(s.trim()) ? Number(s.trim()) : null)
/** A datetime-local value read as IST (the shop's clock), e.g. 2026-11-15T00:00. */
export const fromIst = (s: string) => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) ? new Date(`${s}:00+05:30`) : null)
export const toIst = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 16)
export const CODE_RE = /^[A-Za-z0-9]{4,20}$/

export function parseOffer(v: OfferValues): { ok: true; patch: OfferPatch } | { ok: false; errors: Record<string, string> } {
  const e: Record<string, string> = {}
  const title = v.title.trim()
  if (!title || title.length > 60) e.title = 'Give it a name shoppers will read, up to 60 characters.'
  const style = (DISCOUNT_STYLES as readonly string[]).includes(v.style) ? (v.style as DiscountStyle) : null
  if (!style) e.style = 'Choose a style.'
  let percentBps: number | null = null, amountOff: number | null = null, cap: number | null = null
  // Tiers (order offers): each step a minimum and a value of the offer's kind; with steps, the offer's own value is not used.
  const tierRows = style === 'order_off' ? (v.tiers ?? []).filter((t) => t.min.trim() || t.value.trim()) : []
  const tiers: OfferPatch['tiers'] = []
  tierRows.forEach((t, i) => {
    const min = rupees(t.min)
    const val = v.kind === 'percent' ? (/^\d{1,3}(\.\d{1,2})?$/.test(t.value.trim()) ? Math.round(Number(t.value.trim()) * 100) : null) : rupees(t.value)
    if (!min || !val || (v.kind === 'percent' && val > 10_000)) e[`tier${i}`] = 'Each step needs a bag value and how much off.'
    else tiers.push({ min, percentBps: v.kind === 'percent' ? val : null, amountOff: v.kind === 'percent' ? null : val })
  })
  if (tiers.length > 4) e.tiers = 'Up to 4 steps.'
  if (new Set(tiers.map((t) => t.min)).size !== tiers.length) e.tiers = 'Each step needs its own bag value.'
  tiers.sort((a, b) => a.min - b.min)
  let buyQty: number | null = null, getQty: number | null = null, getBps: number | null = null, giftVariantId: string | null = null
  if (style === 'bxgy') {
    buyQty = whole(v.buyQty ?? ''); getQty = whole(v.getQty ?? '')
    const pct = /^\d{1,3}$/.test((v.getPct ?? '').trim()) ? Number(v.getPct!.trim()) : null
    if (!buyQty || buyQty > 10) e.buyQty = 'Buy 1 to 10.'
    if (!getQty || getQty > 10) e.getQty = 'Get 1 to 10.'
    if (!pct || pct > 100) e.getPct = 'From 1 to 100% off (100 = free).'
    getBps = pct ? pct * 100 : null
  }
  if (style === 'free_gift') {
    giftVariantId = /^[0-9a-f-]{36}$/.test(v.giftVariantId ?? '') ? v.giftVariantId! : null
    if (!giftVariantId) e.giftVariantId = 'Choose the piece that is free.'
  }
  const targets = style === 'product_off' || style === 'bxgy' ? ((['all', 'products', 'collections'] as const).find((x) => x === v.targets) ?? 'all') : 'all'
  const targetIds = targets === 'all' ? [] : [...new Set((v.targetIds ?? []).filter((x) => /^[0-9a-f-]{36}$/.test(x)))].slice(0, 200)
  if (targets !== 'all' && !targetIds.length) e.targets = targets === 'products' ? 'Choose at least one product.' : 'Choose at least one collection.'
  if (style && style !== 'free_shipping' && style !== 'bxgy' && style !== 'free_gift' && !tiers.length) {
    if (v.kind === 'percent') {
      const p = /^\d{1,3}(\.\d{1,2})?$/.test(v.value.trim()) ? Math.round(Number(v.value.trim()) * 100) : null
      if (!p || p < 1 || p > 10_000) e.value = 'A percentage from 0.01 to 100.'
      else percentBps = p
      if (v.cap.trim()) { cap = rupees(v.cap); if (!cap) e.cap = 'An amount in rupees, or leave it empty.' }
    } else {
      amountOff = rupees(v.value)
      if (!amountOff) e.value = 'An amount in rupees.'
    }
  }
  const minSubtotal = v.min.trim() ? rupees(v.min) : 0
  if (minSubtotal === null) e.min = 'An amount in rupees, or leave it empty.'
  const code = v.code.trim() ? v.code.trim().toUpperCase() : null
  if (code && !CODE_RE.test(code)) e.code = '4 to 20 letters or digits, no spaces.'
  const startsAt = fromIst(v.startsAt)
  if (!startsAt) e.startsAt = 'When it starts.'
  const endsAt = v.endsAt ? fromIst(v.endsAt) : null
  if (v.endsAt && !endsAt) e.endsAt = 'A date and time, or leave it empty.'
  else if (endsAt && startsAt && endsAt <= startsAt) e.endsAt = 'It has to end after it starts.'
  const opt = (s: string, k: string, f: (s: string) => number | null) => { if (!s.trim()) return null; const x = f(s); if (!x) e[k] = k === 'budget' ? 'An amount in rupees, or leave it empty.' : 'A whole number, or leave it empty.'; return x }
  const limitTotal = opt(v.limitTotal, 'limitTotal', whole), limitPerPhone = opt(v.limitPerPhone, 'limitPerPhone', whole), budget = opt(v.budget, 'budget', rupees)
  if (v.announce && code && !v.listed) e.announce = 'An offer only for people with the code cannot go in the bar: everyone would read it.'
  if (Object.keys(e).length) return { ok: false, errors: e }
  return { ok: true, patch: { title, style: style!, percentBps, amountOff, cap, minSubtotal: minSubtotal!, code, startsAt: startsAt!, endsAt, limitTotal, limitPerPhone, budget,
    targets, targetIds, buyQty, getQty, getBps, giftVariantId, tiers, firstOrder: style === 'order_off' && !!v.firstOrder,
    // An unlisted offer is reached only by its code: one without a code is always listed.
    listed: code ? v.listed : true, combinesWithPayment: v.combinesWithPayment, announce: v.announce } }
}
