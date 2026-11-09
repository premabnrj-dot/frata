// =============================================================================
// FILE: src/domains/checkout/quote.ts
//
// THE PRICE OF A BAG — the one calculation for the bag, the checkout, placing
// the order and the order record (checkout spec, SSOT). The browser sends
// variant ids and quantities only; everything here comes from the server's
// rows. Pure: `now` is passed in.
//
// What can be sold right now (architecture review: holds are DERIVED):
//   in stock  = stock − units held by unpaid online orders still inside pay_by
//   pre-order = cap − pre-orders already taken (no cap: no limit)
// A line is one kind; a bag asking for more than can be sold is cut down and
// says so on the line.
// =============================================================================

import { istDayKey } from '../time/day'
import { availability, visibility, type Status, type WhenOut } from '@/domains/catalogue/availability'
import type { ChargeShare } from '@/domains/tax/gst'
import { rateOn } from '@/domains/tax/rates'
import { codFor, shippingFor, type Cod, type DeliveryRules } from './delivery'
import { planOffers, priceMethod, type Applied, type DiscountTerms, type Listed, type MethodLine, type TypedCode } from './discounts'

export const MAX_QTY = 10
export const MAX_LINES = 20

export type BagLine = { variantId: string; qty: number }

/** One variant as the server read it, with what is held and taken against it. */
export type VariantRow = {
  variantId: string; productId: string; handle: string; title: string; status: string; publishAt: string | null
  options: string[]; values: string[]; sku: string | null; price: number; compareAt: number | null
  stock: number; whenOut: WhenOut; shipsBy: string | null; leadMinDays: number | null; leadMaxDays: number | null; preorderCap: number | null
  /** Units held by unpaid online orders inside their 20 minutes. */
  held: number
  /** Pre-order units already sold (live pre-order lines). */
  preordered: number
  /** Pre-order units not yet packed: when stock arrives, these are owed it first. */
  owed: number
  hsn: string | null
  /** The merchant's GST rate for a code the rate table lacks (products.gst_bps); null: the table decides. */
  ownBps?: number | null
  /** The unit invoiced (products.uqc). */
  uqc?: string
  image: { base: string; widths: number[] } | null
}

export type ShopRules = DeliveryRules & {
  pricesIncludeGst: boolean; registered: boolean
  dispatchDays: number; metroDays: number; restDays: number
}

export type LineKind = 'in_stock' | 'preorder' | 'made_to_order'
export type LineProblem = 'gone' | 'sold_out' | 'reduced'
export type QuoteLine = {
  variantId: string; productId: string; handle: string; title: string; options: string[]; values: string[]; sku: string | null
  image: { base: string; widths: number[] } | null; unitPrice: number; compareAt: number | null
  requested: number; qty: number; kind: LineKind; shipsBy: string | null; leadMinDays: number | null; leadMaxDays: number | null
  gross: number; hsn: string | null
  /** The unit as invoiced (GST UQC). */
  uqc: string
  problem: LineProblem | null
}
/**
 * What one way of paying costs. `lines` (sold lines only, in `lines` order): each line's discount and its tax at the
 * rate of its own discounted piece; `shares`: each sold line's share of the charges (delivery, and the COD fee when
 * paying on delivery). Line tax lives here, not on QuoteLine: it can differ by way of paying (offers plan review).
 */
export type MethodTotal = {
  codCharge: number; gst: number; total: number; shares: ChargeShare[]
  discount: number; lines: MethodLine[]
  /** The lines' taxable value: Frrata's fee base and the merchandise net. */
  merchandiseNet: number
  /** The offers this way of paying gets (order, shipping, payment), with their amounts. */
  applied: Applied[]
}
export type Quote = {
  lines: QuoteLine[]
  /** Sum of the sellable lines, as shown (GST inside when prices include it), before any offer. */
  subtotal: number
  /** Delivery after offers (the same for both ways of paying). */
  shipping: number
  prepaid: MethodTotal
  cod: MethodTotal & { offer: Cod }
  arrives: { from: string; to: string } | null
  /** Nothing to buy (every line gone or sold out). */
  empty: boolean
  /** Bag ids that are no longer this shop's variants (deleted, or never were): the bag drops them and says so. */
  missing: string[]
  /** Listed offers (applied, or what they need) and what the typed code did. */
  offers: { listed: Listed[]; code: 'applied' | 'not_applied' | null }
}

const DAY = 86_400_000
const addDays = (iso: string, n: number) => istDayKey(new Date(new Date(`${iso}T00:00:00+05:30`).getTime() + n * DAY))

/** How many of `want` can be sold of this variant now, and as what. */
export function sellable(v: VariantRow, want: number, now: Date): { qty: number; kind: LineKind; problem: LineProblem | null } {
  const vis = visibility(v.status as Status, v.publishAt ? new Date(v.publishAt) : null, now)
  if (!vis.canBuy || v.price <= 0) return { qty: 0, kind: 'in_stock', problem: 'gone' }
  const free = Math.max(0, v.stock - v.held - v.owed)
  const capLeft = v.preorderCap === null ? Number.POSITIVE_INFINITY : Math.max(0, v.preorderCap - v.preordered)
  // availability() decides the kind exactly as the product page did, from the stock a shopper can take now.
  const a = availability({ stock: free, whenOut: v.whenOut, shipsBy: v.shipsBy, leadMinDays: v.leadMinDays, leadMaxDays: v.leadMaxDays, preorderCap: v.preorderCap, preordered: v.preordered }, now)
  const cut = (n: number, kind: LineKind) => ({ qty: Math.min(want, n), kind, problem: n < want ? ('reduced' as const) : null })
  if (a.kind === 'in_stock' || a.kind === 'low_stock') return cut(free, 'in_stock')
  if (a.kind === 'preorder') return capLeft > 0 ? cut(capLeft, 'preorder') : { qty: 0, kind: 'preorder', problem: 'sold_out' }
  if (a.kind === 'made_to_order') return cut(MAX_QTY, 'made_to_order')
  return { qty: 0, kind: 'in_stock', problem: 'sold_out' }
}

/** The arrival range for a set of lines: the latest line decides (dispatch + metro…rest days; pre-orders from their date). */
export function arrivalRange(lines: Pick<QuoteLine, 'kind' | 'shipsBy' | 'leadMinDays' | 'leadMaxDays'>[], r: Pick<ShopRules, 'dispatchDays' | 'metroDays' | 'restDays'>, now: Date): { from: string; to: string } | null {
  if (!lines.length) return null
  const today = istDayKey(now)
  let from = today, to = today
  for (const l of lines) {
    const start = l.kind === 'preorder' && l.shipsBy ? l.shipsBy : today
    const makeMin = l.kind === 'made_to_order' ? l.leadMinDays ?? 0 : 0, makeMax = l.kind === 'made_to_order' ? l.leadMaxDays ?? makeMin : 0
    const f = addDays(start, makeMin + r.dispatchDays + r.metroDays), t = addDays(start, makeMax + r.dispatchDays + r.restDays)
    if (f > from) from = f
    if (t > to) to = t
  }
  return { from, to }
}

export type QuoteOffers = { offers?: DiscountTerms[]; code?: TypedCode | string | null }

/** Price a bag. Unknown variant ids come back as `gone` lines; quantities are clamped to 1…MAX_QTY. */
export function quote(bag: BagLine[], rows: VariantRow[], r: ShopRules, now: Date, pincode?: string | null, o: QuoteOffers = {}): Quote {
  const byId = new Map(rows.map((v) => [v.variantId, v]))
  const seen = new Set<string>()
  const missing: string[] = []
  const draft = bag.slice(0, MAX_LINES).flatMap((b) => {
    if (seen.has(b.variantId)) return []
    seen.add(b.variantId)
    const v = byId.get(b.variantId)
    const requested = Math.max(1, Math.min(MAX_QTY, Math.floor(b.qty) || 1))
    if (!v) { missing.push(b.variantId); return [] }
    const s = sellable(v, requested, now)
    // A registered shop can't sell a piece whose GST rate isn't known (no HSN, or a code the table lacks with no rate
    // of the merchant's own): never a guessed rate (plan 2026-11-09-gst-core-and-categories § 2).
    if (r.registered && s.qty > 0 && rateOn(v.hsn, v.price, r.pricesIncludeGst, now, v.ownBps) === null) return [{ v, requested, qty: 0, kind: s.kind, problem: 'gone' as const }]
    return [{ v, requested, ...s }]
  })
  const live = draft.filter((d) => d.qty > 0)
  const subtotal = live.reduce((a, d) => a + d.v.price * d.qty, 0)
  // Offers (discounts.ts): the order class first, then the thresholds on what is left, then the payment class.
  const plan = planOffers(live.map((d) => ({ productId: d.v.productId, variantId: d.v.variantId, unitPrice: d.v.price, qty: d.qty })), live.length ? o.offers ?? [] : [], o.code ?? null)
  const afterOrder = subtotal - plan.productDisc.reduce((a, b) => a + b, 0) - (plan.order?.amount ?? 0)
  const charged = live.length ? shippingFor(afterOrder, r) : 0
  const waived = plan.freeShipping && charged > 0 ? charged : 0
  const shipping = charged - waived
  const shipApplied: Applied | null = waived ? { discountId: plan.freeShipping!.id, codeId: plan.freeShipping!.codeId, class: 'shipping', title: plan.freeShipping!.title, amount: waived, terms: plan.freeShipping! } : null
  const offer = codFor(afterOrder, r, pincode)
  const codCharge = offer.offered ? offer.charge : 0
  const priced = live.map((d, i) => ({ gross: d.v.price * d.qty, qty: d.qty, hsn: d.v.hsn, productDiscount: plan.productDisc[i]!, own: d.v.ownBps ?? null }))
  const tax = { registered: r.registered, pricesIncludeGst: r.pricesIncludeGst, date: now }
  const pre = priceMethod(priced, plan.order?.amount ?? 0, plan.payment?.amount ?? 0, shipping, tax)
  const cod = priceMethod(priced, plan.order?.amount ?? 0, 0, shipping + codCharge, tax)
  const appliedFor = (...a: (Applied | null)[]) => a.filter((x): x is Applied => x !== null)
  // A typed code that applies only when paying online still counts as applied (the saving shows on that card).
  const lines: QuoteLine[] = draft.map((d) => ({
    variantId: d.v.variantId, productId: d.v.productId, handle: d.v.handle, title: d.v.title, options: d.v.options, values: d.v.values, sku: d.v.sku,
    image: d.v.image, unitPrice: d.v.price, compareAt: d.v.compareAt, requested: d.requested, qty: d.qty, kind: d.kind,
    shipsBy: d.kind === 'preorder' ? d.v.shipsBy : null, leadMinDays: d.kind === 'made_to_order' ? d.v.leadMinDays : null, leadMaxDays: d.kind === 'made_to_order' ? d.v.leadMaxDays : null,
    gross: d.v.price * d.qty, hsn: d.v.hsn, uqc: d.v.uqc ?? 'NOS', problem: d.problem,
  }))
  const shares = (m: typeof pre) => m.lines.map(({ chargeTaxable, chargeGst }) => ({ chargeTaxable, chargeGst }))
  return {
    lines, subtotal, shipping,
    prepaid: { codCharge: 0, gst: pre.gst, total: pre.total, shares: shares(pre), discount: pre.discount, lines: pre.lines, merchandiseNet: pre.merchandiseNet, applied: appliedFor(...plan.products, plan.order, shipApplied, plan.payment) },
    cod: { offer, codCharge, gst: cod.gst, total: offer.offered ? cod.total : 0, shares: shares(cod), discount: cod.discount, lines: cod.lines, merchandiseNet: cod.merchandiseNet, applied: appliedFor(...plan.products, plan.order, shipApplied) },
    arrives: arrivalRange(lines.filter((l) => l.qty > 0), r, now),
    empty: live.length === 0, missing,
    offers: { listed: plan.listed, code: plan.code },
  }
}

/** The total the shopper is asked to pay for a method (0 when that method is not offered). */
export const totalFor = (q: Quote, method: 'cod' | 'prepaid') => (method === 'cod' ? q.cod.total : q.prepaid.total)
