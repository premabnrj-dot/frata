// =============================================================================
// FILE: src/domains/checkout/discounts.ts
//
// OFFERS (docs/specs/2026-11-08-coupons.md; plans docs/plans/2026-11-08-offers.md and -o2.md).
// Called "discounts" in code: "offer" already names the COD offer and a module's offer.
//
// One engine, two callers: quote() for a bag, and reprice() for an order already placed
// (switch to COD, a capture after a switch). Both price each way of paying through
// priceMethod(), so a stored order and a fresh quote can never disagree. An order whose lines change
// (an order edit) re-plans only its own offers from the terms it kept: replanKept(), the same steps. Pure; paise; bps.
//
// The order of application:
//   1. product class — product/collection % or ₹ off, Buy X get Y, a free gift: per line, greedy
//                      (the offer saving most takes its lines, then the next; a line takes one).
//                      Stored per line at placement and never re-spread (O·2 plan review 1).
//   2. order class   — % or ₹ off the bag after product offers, or the step of a tier reached;
//                      first-order offers are decided at placement (the quote has no phone).
//   3. thresholds    — free shipping (the shop's own and free-shipping offers) and the COD
//                      minimum/maximum, on the bag AFTER product offers and the best order offer.
//   4. payment class — "pay online, save": prepaid only, on what is left. Withheld when the
//                      order offer does not combine — and then paying online also tries the
//                      best order offer that DOES combine (or none) with the saving, and takes
//                      whichever costs the shopper less (`online`; quote.ts compares the totals,
//                      a tie keeps the order offer). Paying on delivery always keeps the best
//                      order offer (shop stress test 2026-11-11: a 5% that did not combine made a
//                      ₹999 bag ₹949.05 online where ₹100 off alone was ₹899 — rule 46).
// Each line's GST rate is decided on its own value after its share of the discount, per way of
// paying (CGST s.15(3)(a); decisions 1 and 5): a piece can be 18% on COD and 5% online, and a
// Buy X get Y saving is spread over the group's pieces by value (Circular 92: one price, two supplies).
// =============================================================================

import { apportion, taxOrder, type ChargeShare } from '@/domains/tax/gst'

export const DISCOUNT_STYLES = ['order_off', 'free_shipping', 'pay_online', 'product_off', 'bxgy', 'free_gift'] as const
export type DiscountStyle = (typeof DISCOUNT_STYLES)[number]
export type DiscountClass = 'product' | 'order' | 'shipping' | 'payment'
/** A style's class: derived, never stored twice. */
export const classOf = (s: DiscountStyle): DiscountClass =>
  s === 'order_off' ? 'order' : s === 'free_shipping' ? 'shipping' : s === 'pay_online' ? 'payment' : 'product'

export type Tier = { min: number; percentBps: number | null; amountOff: number | null }

/** An offer's terms, as the engine reads them (never a limit, a budget or a count: those stay with placement). */
export type DiscountTerms = {
  id: string; title: string; style: DiscountStyle
  percentBps: number | null; amountOff: number | null; cap: number | null; minSubtotal: number
  combinesWithPayment: boolean
  /** Listed offers show at checkout and are applied for the shopper; unlisted ones only by a code typed for them. */
  listed: boolean
  /** The offer's public code (shown when listed), upper-cased; null for an automatic offer. */
  code: string | null; codeId: string | null
  /** Product offers: the products it covers (collections resolved by the read), or every product. */
  targets?: 'all' | readonly string[]
  /** Buy X get Y: X, Y and the % off the Y pieces (10000 = free). */
  buyQty?: number | null; getQty?: number | null; getBps?: number | null
  /** Free gift: the variant that is free once the rest of the bag reaches minSubtotal. */
  giftVariantId?: string | null
  /** Order offers with steps (the highest reached applies); empty = the offer's own value. */
  tiers?: readonly Tier[]
  /** Only for a phone with no order at this shop: decided at placement (the quote has no phone). */
  firstOrder?: boolean
}

/** A typed code as stored and compared: trimmed and upper-cased (codes are case-insensitive). */
export const normalCode = (s: string | null | undefined) => (s ? s.trim().toUpperCase() : null)

/** What the read found for a typed code: the offer it belongs to (its public or a creator code), or nothing. */
export type TypedCode = { text: string; discountId: string | null; codeId: string | null }
const asTyped = (t: TypedCode | string | null | undefined, offers: DiscountTerms[]): TypedCode | null => {
  if (!t) return null
  if (typeof t !== 'string') return t
  const text = normalCode(t)!
  const hit = offers.find((o) => o.code === text)
  return { text, discountId: hit?.id ?? null, codeId: hit?.codeId ?? null }
}

/** The offers a bag may get: automatic and listed ones, and the offer of the code the shopper typed. */
export const candidates = (offers: DiscountTerms[], typed: TypedCode | string | null) => {
  const t = asTyped(typed, offers)
  return offers.filter((o) => o.code === null || o.listed || (t !== null && t.discountId === o.id))
}

export type Applied = { discountId: string; codeId: string | null; class: DiscountClass; title: string; amount: number; terms: DiscountTerms }
/** What a listed offer the bag misses needs (or, applied, what to say about it). */
export type Need =
  | { kind: 'add'; amount: number } | { kind: 'add_items'; n: number } | { kind: 'gift'; variantId: string }
  | { kind: 'pay_online' } | { kind: 'pay_on_delivery' } | { kind: 'first_order' } | null
export type Listed = { title: string; code: string | null; style: DiscountStyle; applied: boolean; need: Need }

/** The highest step of a tiered offer that `base` reaches (null below the first, or with no steps). */
export const stepReached = (tiers: readonly Tier[] | undefined, base: number): Tier | null =>
  [...(tiers ?? [])].filter((x) => base >= x.min).sort((a, b) => b.min - a.min)[0] ?? null

/** The value an order offer gives at `base`: its own, or the highest tier reached. */
const orderValue = (t: Pick<DiscountTerms, 'percentBps' | 'amountOff' | 'minSubtotal' | 'tiers'>, base: number) => {
  if (!t.tiers?.length) return base >= t.minSubtotal ? { percentBps: t.percentBps, amountOff: t.amountOff } : null
  const reached = stepReached(t.tiers, base)
  return reached ? { percentBps: reached.percentBps, amountOff: reached.amountOff } : null
}

/**
 * A percentage saving in whole rupees, rounded down (shopper batch 2026-11-12: 5% off ₹999 made a ₹949.05 total). One
 * rounding per offer, so the shopper never gets ₹1 or more below what the % says; 100% stays exact (free is free).
 */
export const wholeRupees = (exact: number, bps: number) => (bps >= 10_000 ? exact : Math.floor(exact / 100) * 100)

/** The discount an order-class or payment-class offer gives on `base` paise: 0 below its minimum. */
export function amountFor(t: Pick<DiscountTerms, 'style' | 'percentBps' | 'amountOff' | 'cap' | 'minSubtotal'> & Pick<DiscountTerms, 'tiers'>, base: number): number {
  if (t.style === 'free_shipping' || classOf(t.style) === 'product' || base <= 0) return 0
  const v = orderValue(t, base)
  if (!v) return 0
  const raw = v.percentBps != null ? wholeRupees(Math.floor((base * v.percentBps) / 10_000), v.percentBps) : v.amountOff ?? 0
  return Math.max(0, Math.min(raw, t.cap ?? Number.POSITIVE_INFINITY, base))
}

/** The best of a class by saving; ties go to the automatic offer, then the lower id (stable). */
function best(cands: DiscountTerms[], base: number): { t: DiscountTerms; amount: number } | null {
  const scored = cands.map((t) => ({ t, amount: amountFor(t, base) })).filter((c) => c.amount > 0)
  scored.sort((a, b) => b.amount - a.amount || Number(a.t.code !== null) - Number(b.t.code !== null) || (a.t.id < b.t.id ? -1 : a.t.id > b.t.id ? 1 : 0))
  return scored[0] ?? null
}

/** A bag line as the engine reads it (sold lines only). */
export type PlanLine = { productId: string | null; variantId: string | null; unitPrice: number; qty: number }
/** What a product offer's saving reads: its value, its minimum and what it covers. */
type ProductTerms = Pick<DiscountTerms, 'id' | 'style' | 'percentBps' | 'amountOff' | 'cap' | 'minSubtotal' | 'targets' | 'buyQty' | 'getQty' | 'getBps' | 'giftVariantId'> & { code?: string | null }
const covers = (t: ProductTerms, l: PlanLine) => !t.targets || t.targets === 'all' || (l.productId !== null && t.targets.includes(l.productId))

/** One product offer over the lines still free: its discount per line, and what it needs when it gives nothing. */
export function productOffer(t: ProductTerms, lines: PlanLine[], free: boolean[], subtotal: number): { per: number[]; need: Need } {
  const per = lines.map(() => 0)
  if (t.style === 'free_gift') {
    const at = lines.findIndex((l, i) => free[i] && l.variantId === t.giftVariantId)
    const rest = lines.reduce((a, l, i) => a + (i === at ? 0 : l.unitPrice * l.qty), 0)
    if (rest < t.minSubtotal) return { per, need: { kind: 'add', amount: t.minSubtotal - rest } }
    if (at < 0) return { per, need: t.giftVariantId ? { kind: 'gift', variantId: t.giftVariantId } : null }
    per[at] = lines[at]!.unitPrice
    return { per, need: null }
  }
  if (subtotal < t.minSubtotal) return { per, need: { kind: 'add', amount: t.minSubtotal - subtotal } }
  const idx = lines.map((l, i) => (free[i] && covers(t, l) ? i : -1)).filter((i) => i >= 0)
  if (t.style === 'bxgy') {
    const x = t.buyQty ?? 0, y = t.getQty ?? 0, bps = t.getBps ?? 10_000
    if (x < 1 || y < 1) return { per, need: null }
    // Every piece, dearest first; each group of X+Y gives its Y cheapest at the offer's % off.
    const pieces = idx.flatMap((i) => Array.from({ length: lines[i]!.qty }, () => ({ i, price: lines[i]!.unitPrice }))).sort((a, b) => b.price - a.price || a.i - b.i)
    const groups = Math.floor(pieces.length / (x + y))
    if (!groups) return { per, need: pieces.length ? { kind: 'add_items', n: x + y - pieces.length } : null }
    const inGroups = pieces.slice(0, groups * (x + y))
    let exact = 0
    for (let g = 0; g < groups; g++) for (const p of inGroups.slice(g * (x + y) + x, (g + 1) * (x + y))) exact += Math.floor((p.price * bps) / 10_000)
    const total = wholeRupees(exact, bps)
    // The group's saving spread over its pieces by value (decision 5), then summed per line.
    const share = apportion(total, inGroups.map((p) => p.price))
    inGroups.forEach((p, k) => { per[p.i]! += share[k]! })
    return { per, need: null }
  }
  // % or ₹ off each covered line (₹ per piece), the cap on the offer's whole saving. A percentage is rounded once, on
  // the offer's whole saving (wholeRupees), and spread back over its lines.
  for (const i of idx) {
    const l = lines[i]!, gross = l.unitPrice * l.qty
    per[i] = t.percentBps != null ? Math.floor((gross * t.percentBps) / 10_000) : Math.min((t.amountOff ?? 0) * l.qty, gross)
  }
  const sum = per.reduce((a, b) => a + b, 0)
  const whole = Math.min(t.percentBps != null ? wholeRupees(sum, t.percentBps) : sum, t.cap ?? Number.POSITIVE_INFINITY)
  if (whole < sum) { const spread = apportion(whole, per); spread.forEach((v, i) => { per[i] = v }) }
  return { per, need: null }
}

/**
 * Product offers over the lines, greedy by total saving (ties: automatic first, then id), each taking its lines (a line
 * takes one). Each line's product discount, the offers that gave something in the order taken, and what each that gave
 * nothing needs.
 */
function productPass<T extends ProductTerms>(lines: PlanLine[], offers: T[], subtotal: number) {
  const free = lines.map(() => true)
  const productDisc = lines.map(() => 0)
  const taken: { t: T; total: number }[] = []
  const needs = new Map<string, Need>()
  let left = offers
  for (;;) {
    const scored = left.map((t) => { const r = productOffer(t, lines, free, subtotal); return { t, r, total: r.per.reduce((a, b) => a + b, 0) } })
    for (const s of scored) if (s.total === 0) needs.set(s.t.id, s.r.need)
    const top = scored.filter((s) => s.total > 0).sort((a, b) => b.total - a.total || Number(a.t.code != null) - Number(b.t.code != null) || (a.t.id < b.t.id ? -1 : 1))[0]
    if (!top) break
    top.r.per.forEach((v, i) => { if (v > 0) { productDisc[i]! += v; free[i] = false } })
    taken.push({ t: top.t, total: top.total })
    needs.delete(top.t.id)
    left = left.filter((t) => t.id !== top.t.id)
  }
  return { productDisc, taken, needs }
}

/**
 * What a typed code did. 'beaten': the code is real and would save on this bag, but a better offer of its class is
 * applied (a creator's code beside an automatic sale): the shopper is told so, and it is no wrong guess. Every other
 * failure reads the same (no "exists but"): spec § Rules, rule 47.
 */
export type CodeResult = 'applied' | 'beaten' | 'not_applied'
/** What the shopper is told: each listed offer (applied, or what it needs) and what the typed code did. */
export type OfferWords = {
  code: CodeResult | null
  listed: Listed[]
}
export type OfferPlan = OfferWords & {
  /** Each sold line's product-offer discount (in `lines` order). */
  productDisc: number[]
  /** The product offers applied, with their totals. */
  products: Applied[]
  /** The best order offer: paying on delivery always, online too unless `online` is taken. Thresholds are on the bag after it. */
  order: Applied | null
  /** A free-shipping offer whose minimum the bag meets; it applies only when shipping is charged. */
  freeShipping: DiscountTerms | null
  /** The pay-online saving with `order`, for prepaid only; null when none applies or `order` does not combine. */
  payment: Applied | null
  /**
   * Paying online the other way (shop stress test 2026-11-11): when `order` does not combine and a saving applies
   * without it, the best order offer that combines (or none) with that saving. The caller takes it only when its
   * prepaid total is LOWER (a tie keeps `order`), and then tells the shopper these words instead of the plan's.
   */
  online: (OfferWords & { order: Applied | null; payment: Applied }) | null
}

/**
 * Which offers apply to a bag. Candidates: automatic and listed offers, and the offer of the code the shopper typed
 * (matched by the read: its public code or a creator code). One code per order; a code applies only when its offer
 * is the best of its class for a way of paying. `lines` may be a bare subtotal (one line, no product): order, shipping
 * and payment only. `codOffered` (quote: codFor on the bag after the order offer): whether paying on delivery is there
 * at all — when it is not, an order offer only paying on delivery would get is neither applied nor its code's answer.
 */
export function planOffers(linesIn: PlanLine[] | number, offers: DiscountTerms[], typedIn: TypedCode | string | null, ways: { codOffered?: (afterOrder: number) => boolean } = {}): OfferPlan {
  const lines: PlanLine[] = typeof linesIn === 'number' ? (linesIn > 0 ? [{ productId: null, variantId: null, unitPrice: linesIn, qty: 1 }] : []) : linesIn
  const typed = asTyped(typedIn, offers)
  const cands = candidates(offers, typed)
  const of = (c: DiscountClass) => cands.filter((t) => classOf(t.style) === c)
  const subtotal = lines.reduce((a, l) => a + l.unitPrice * l.qty, 0)

  // 1. Product offers, greedy by total saving, each taking its lines.
  const { productDisc, taken, needs } = productPass(lines, of('product'), subtotal)
  const products: Applied[] = taken.map(({ t, total }) => ({ discountId: t.id, codeId: t.codeId, class: 'product', title: t.title, amount: total, terms: t }))
  const afterProduct = subtotal - productDisc.reduce((a, b) => a + b, 0)

  // 2–4. Order, shipping, payment, as in O·1, on what is left.
  const asApplied = (cls: 'order' | 'payment', x: { t: DiscountTerms; amount: number } | null): Applied | null =>
    x ? { discountId: x.t.id, codeId: x.t.codeId, class: cls, title: x.t.title, amount: x.amount, terms: x.t } : null
  const order = asApplied('order', best(of('order'), afterProduct))
  const afterOrder = afterProduct - (order?.amount ?? 0)
  const ship = of('shipping').filter((t) => afterOrder > 0 && afterOrder >= t.minSubtotal)
    .sort((a, b) => Number(a.code !== null) - Number(b.code !== null) || (a.id < b.id ? -1 : 1))[0] ?? null
  const alone = order !== null && !order.terms.combinesWithPayment
  const payment = alone ? null : asApplied('payment', best(of('payment'), afterOrder))
  // The other way online (shop stress test 2026-11-11): the best order offer that combines, or none, then the saving
  // on what that leaves. Thresholds stay on the bag after `order`: one delivery charge for both ways of paying.
  const altOrder = alone ? asApplied('order', best(of('order').filter((t) => t.combinesWithPayment), afterProduct)) : null
  const altPayment = alone ? asApplied('payment', best(of('payment'), afterProduct - (altOrder?.amount ?? 0))) : null

  // The typed code's offer would save on this bag by itself (its class's base, every line free): when it is not chosen,
  // a better offer of its class was (or one it does not combine with), so it was beaten, not refused.
  const mine = typed?.discountId ? cands.find((t) => t.id === typed.discountId) ?? null : null
  const beaten = mine !== null && (() => {
    const cls = classOf(mine.style)
    if (cls === 'product') return productOffer(mine, lines, lines.map(() => true), subtotal).per.some((v) => v > 0)
    if (cls === 'shipping') return afterOrder > 0 && afterOrder >= mine.minSubtotal
    return amountFor(mine, cls === 'order' ? afterProduct : afterOrder) > 0
  })()

  /** The words for what each way of paying gets: an offer only one way gets says which way. */
  const words = (cod: (Applied | null)[], prepaid: (Applied | null)[]): OfferWords => {
    const ids = (xs: (Applied | null)[]) => new Set(xs.flatMap((x) => (x ? [x.discountId] : [])))
    const onCod = ids(cod), online = ids(prepaid)
    const chosen = new Set([...onCod, ...online, ...(ship ? [ship.id] : [])])
    const usedCode = typed !== null && typed.discountId !== null && chosen.has(typed.discountId)
    const listed: Listed[] = offers.filter((t) => t.listed).map((t) => {
      const applied = chosen.has(t.id)
      const cls = classOf(t.style)
      let need: Need = null
      if (cls === 'product') need = applied ? null : needs.get(t.id) ?? null
      else if (applied) {
        if (cls === 'payment' || (cls === 'order' && !onCod.has(t.id))) need = { kind: 'pay_online' }
        else if (cls === 'order' && !online.has(t.id)) need = { kind: 'pay_on_delivery' }
        else if (t.firstOrder) need = { kind: 'first_order' }
        else if (t.tiers?.length) { const next = [...t.tiers].sort((a, b) => a.min - b.min).find((x) => x.min > afterProduct); need = next ? { kind: 'add', amount: next.min - afterProduct } : null }
      } else {
        const base = cls === 'order' ? afterProduct : afterOrder
        const min = t.tiers?.length ? Math.min(...t.tiers.map((x) => x.min)) : t.minSubtotal
        need = base < min ? { kind: 'add', amount: min - base } : null
      }
      return { title: t.title, code: t.code, style: t.style, applied, need }
    })
      // A listed offer beaten by a better one of its class is not shown: only what applies or what is within reach.
      .filter((l) => l.applied || l.need)
    return { code: typed === null ? null : usedCode ? 'applied' : beaten ? 'beaten' : 'not_applied', listed }
  }
  // No Pay on delivery for this bag: what only it would get is not the shopper's.
  const codOrder = ways.codOffered?.(afterOrder) === false ? null : order
  const online = altPayment ? { order: altOrder, payment: altPayment, ...words([...products, codOrder], [...products, altOrder, altPayment]) } : null
  return { productDisc, products, order, freeShipping: ship, payment, online, ...words([...products, order], [...products, order, payment]) }
}

/** An offer's terms as an order keeps them (order_discounts, copied at placement: kept-terms.ts). */
export type KeptTerms = ProductTerms & Pick<DiscountTerms, 'title' | 'tiers'>
/** An offer an order kept: its terms, the way of paying it is for (null: as its class says), and what it gave. */
export type Kept = { terms: KeptTerms; method: 'cod' | 'prepaid' | null; amount: number }
export type Replanned = {
  /** Each line's product-offer discount (in `lines` order). */
  productDisc: number[]
  /** The kept offers that still apply, each with what it gives now. */
  kept: Kept[]
  /** The kept offers that no longer apply, as they were. */
  removed: Kept[]
  /** The delivery charge: the order's, plus what a free-delivery offer that came off had waived. */
  shipping: number
}

/**
 * An order's OWN offers re-planned on new lines (an order edit), from the terms it kept — never today's offers, and never
 * an offer it did not get (a better one, a code, a first-order offer: those were decided at placement). The same steps as
 * planOffers: product offers greedy over the lines; each order offer on the bag after them (its tier step reached, or
 * off below its minimum); free delivery on the bag after the order offer paying on delivery gets (an order kept for one
 * way only: `method`), and when it no longer applies the charge it waived comes back; the pay-online saving on the bag
 * after the online order offer. One that gives nothing comes off. Limits and budgets are the caller's (placement's rule).
 */
export function replanKept(lines: PlanLine[], kept: Kept[], shipping: number): Replanned {
  const subtotal = lines.reduce((a, l) => a + l.unitPrice * l.qty, 0)
  const cls = (k: Kept) => classOf(k.terms.style)
  const { productDisc, taken } = productPass(lines, kept.filter((k) => cls(k) === 'product').map((k) => k.terms), subtotal)
  const afterProduct = subtotal - productDisc.reduce((a, b) => a + b, 0)
  const now = new Map<Kept, number>(kept.filter((k) => cls(k) === 'product').map((k) => [k, taken.find((x) => x.t === k.terms)?.total ?? 0]))
  for (const k of kept.filter((x) => cls(x) === 'order')) now.set(k, amountFor(k.terms, afterProduct))
  const orderFor = (way: 'cod' | 'prepaid') => { const k = kept.find((x) => cls(x) === 'order' && (x.method === null || x.method === way)); return k ? now.get(k)! : 0 }
  const afterOrder = afterProduct - orderFor('cod')
  // Free delivery keeps what it waived while the bag still reaches its minimum; the charge is the order's, not today's.
  for (const k of kept.filter((x) => cls(x) === 'shipping')) now.set(k, afterOrder > 0 && afterOrder >= k.terms.minSubtotal ? k.amount : 0)
  for (const k of kept.filter((x) => cls(x) === 'payment')) now.set(k, amountFor(k.terms, afterProduct - orderFor('prepaid')))
  const on = kept.filter((k) => now.get(k)! > 0)
  const removed = kept.filter((k) => now.get(k)! <= 0)
  return {
    productDisc, kept: on.map((k) => ({ ...k, amount: now.get(k)! })), removed,
    shipping: shipping + removed.filter((k) => cls(k) === 'shipping').reduce((a, k) => a + k.amount, 0),
  }
}

export type PriceLine = { gross: number; qty: number; hsn: string | null; productDiscount: number
  /** The merchant's rate for a code the rate table lacks (rates.ts), or a stored line's rate on repricing. */
  own?: number | null }
/** `discount` is the line's whole discount; `productDiscount` the product offers' part of it (stored, never re-spread). */
export type MethodLine = { discount: number; productDiscount: number; taxable: number; gstBps: number; gst: number } & ChargeShare
export type MethodPrice = {
  /** Merchandise discount (product + order + payment), summed over the lines. Shipping waived by an offer is not in it. */
  discount: number
  lines: MethodLine[]
  /** The lines' taxable value: Frrata's fee base and the merchandise net. */
  merchandiseNet: number
  gst: number; total: number
}

/**
 * One way of paying for sold lines: each line's own product discount first, then the order discount and (prepaid)
 * the payment discount spread over what is left in proportion, each line taxed at the rate of its own discounted
 * piece, the charges shared over the lines at their rates.
 */
export function priceMethod(lines: PriceLine[], orderAmount: number, paymentAmount: number, charges: number, o: { registered: boolean; pricesIncludeGst: boolean; date: Date }): MethodPrice {
  const gross = lines.map((l) => l.gross)
  const subtotal = gross.reduce((a, b) => a + b, 0)
  const prod = lines.map((l) => l.productDiscount)
  const orderShare = apportion(orderAmount, gross.map((g, i) => g - prod[i]!))
  const payShare = apportion(paymentAmount, gross.map((g, i) => g - prod[i]! - orderShare[i]!))
  const disc = lines.map((_, i) => prod[i]! + orderShare[i]! + payShare[i]!)
  const net = lines.map((l, i) => l.gross - disc[i]!)
  const t = taxOrder(lines.map((l, i) => ({ gross: net[i]!, unitPrice: net[i]! / l.qty, hsn: l.hsn, own: l.own ?? null })), charges, o)
  const out = t.lines.map((l, i) => ({ discount: disc[i]!, productDiscount: prod[i]!, taxable: l.taxable, gstBps: l.bps, gst: l.gst, chargeTaxable: l.chargeTaxable, chargeGst: l.chargeGst }))
  const discount = disc.reduce((a, b) => a + b, 0)
  const gst = out.reduce((a, l) => a + l.gst + l.chargeGst, 0)
  return { discount, lines: out, merchandiseNet: out.reduce((a, l) => a + l.taxable, 0), gst, total: subtotal - discount + charges + (o.pricesIncludeGst ? 0 : gst) }
}
