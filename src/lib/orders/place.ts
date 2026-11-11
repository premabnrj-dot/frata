import 'server-only'
import { enqueueOrderEmail } from '@/lib/email/enqueue'
import { enqueuePaymentCheck } from './payment-check'
import { WA_OPT_IN_NOTICE } from '@/domains/checkout/opt-in'
import { randomUUID } from 'node:crypto'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { CleanAddress } from '@/domains/checkout/address'
import { amountFor, candidates, classOf, normalCode, stepReached, type DiscountTerms, type TypedCode } from '@/domains/checkout/discounts'
import { priorOrderSql } from '@/lib/db/order-predicates'
import { keptOffers, quote, totalFor, type BagLine, type Quote } from '@/domains/checkout/quote'
import { gstinState } from '@/domains/tax/gst'
import { b2bProblem, cleanGstin, stateName } from '@/domains/tax/gstin'
import { stateCode } from '@/domains/checkout/states'
import type { Tx } from '@/lib/db'
import { tenantCounters } from '@/lib/db/schema'
import { variants } from '@/lib/db/schema-catalogue'
import { orderLines, orders } from '@/lib/db/schema-orders'
import { withTenant } from '@/lib/db/tenant'
import { orderToken, sha256, tokenHash } from '@/lib/crypto/secret-box'
import { checkoutShop, codeFor, liveOffers, variantRows } from '@/lib/queries/checkout'
import { discountUses, fits } from '@/lib/db/discount-predicates'
import { discounts, orderDiscounts } from '@/lib/db/schema-discounts'
import { keysFor } from '@/lib/payments/keys'
import { createOrder } from '@/lib/payments/razorpay'
import { refreshSoldOut } from '@/lib/queries/storefront'
import { linkCustomer } from '@/lib/queries/customers'

// =============================================================================
// FILE: src/lib/orders/place.ts
//
// PLACING AN ORDER (checkout spec § Routes, architecture review 2026-11-07).
// The one module that writes an order and its lines — and so the one place a
// line's cost is read (for profit; never returned). Everything it returns is
// named, shopper-safe fields.
//
// One transaction: idempotency key first (advisory lock), the shop open, the
// bag's variants locked in id order, re-priced by quote(); a total that is not
// what the shopper saw is refused with the new quote; then the order number,
// the order and its lines. Pay on delivery takes the stock now; an online
// order holds it (derived from pay_by) and takes it when the payment lands.
//
// Offers (docs/plans/2026-11-08-offers.md): the live offers re-read here; every offer this bag
// could get that has a limit or a budget locked in id order and counted (discountUseSql); one
// over its limit, its per-phone limit or its budget simply drops out — the shopper sees the
// usual "changed" with the new total, the same answer whichever limit it was (tenancy review).
// =============================================================================

export const HOLD_MINUTES = 20 // owner call 3

export type PlaceInput = {
  idempotencyKey: string; bag: BagLine[]; address: CleanAddress; method: 'cod' | 'prepaid'; expectedTotal: number
  /** The address the shopper is on: online payment needs it approved in Razorpay (D1·8). */
  host: string
  /** The code the shopper typed, if any (one per order), and whether it came from a shop link (?code=). */
  code?: string | null; via?: 'typed' | 'link'
  /** What the shopper was shown and did, for the hypotheses (frata-unit-economics): first card tapped, attribution. */
  facts: { firstMethod?: 'cod' | 'prepaid' | null; attribution?: Record<string, string>; ekcode?: 'shown' | 'held' | null }
  /** The shop's own signed-in session token (EkCode), if any: the order is linked to that customer only when its phone is theirs. */
  session?: string | null
  /** A business buyer asking for a GST invoice: their GSTIN and registered name (checked here again: tax/gstin.ts). */
  b2b?: { gstin: string; name: string } | null
  /** The shopper ticked the WhatsApp opt-in (src/domains/checkout/opt-in.ts): stored with the notice they read. */
  waOptIn?: boolean
}
export type Pay = { keyId: string; razorpayOrderId: string; amount: number; name: string; phone: string; shop: string }
export type Placed = { kind: 'placed'; token: string; number: number; method: 'cod' | 'prepaid'; total: number; pay: Pay | null; payError?: string
  /** What the typed code did (for the guess limit); null on a retry of a placed order or with no code. */
  code?: 'applied' | 'not_applied' | null }
export type PlaceResult =
  | Placed
  | { kind: 'changed'; quote: Quote }
  | { kind: 'refused'; status: 404 | 409 | 422; error: string; quote?: Quote }

const requestHashOf = (i: PlaceInput) => sha256(JSON.stringify([i.address.phone, i.method, [...i.bag].map((b) => [b.variantId, b.qty]).sort(), ...(i.code ? [normalCode(i.code)] : []), ...(i.b2b ? [cleanGstin(i.b2b.gstin)] : [])]))

export async function placeOrder(tenantId: string, input: PlaceInput, now = new Date()): Promise<PlaceResult> {
  const soldOut: string[] = []
  const placed = await withTenant(tenantId, async (tx): Promise<PlaceResult | { kind: 'new'; id: string; number: number; method: 'cod' | 'prepaid'; total: number; code?: 'applied' | 'not_applied' | null }> => {
    // A retry of the same attempt finds its order; the same key with a different bag is not the same attempt.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${tenantId + ':' + input.idempotencyKey}, 0))`)
    const reqHash = requestHashOf(input)
    const [prior] = await tx.select({ id: orders.id, number: orders.number, method: orders.paymentMethod, total: orders.total, requestHash: orders.requestHash })
      .from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.idempotencyKey, input.idempotencyKey)))
    if (prior) {
      if (prior.requestHash !== reqHash) return { kind: 'refused', status: 409, error: 'This checkout was already used for a different order. Reload the page.' }
      return { kind: 'new', id: prior.id, number: prior.number, method: prior.method as 'cod' | 'prepaid', total: Number(prior.total) }
    }
    const shop = await checkoutShop(tx, tenantId, input.host)
    if (!shop || !shop.open) return { kind: 'refused', status: 404, error: 'This shop is not taking orders right now.' }
    // Abandoned online orders lose the shopper's details after 90 days: the daily cron (src/lib/orders/erase.ts).
    if (input.method === 'prepaid' && !shop.online) return { kind: 'refused', status: 422, error: 'Online payment is not available at this shop right now. Pay on delivery instead.' }
    // A shop that doesn't charge GST (not registered, or composition) sells within its own state only: inter-state
    // supply of goods needs a regular registration (CGST s.24(i)). Checkout says so before this; this is the lock.
    if (shop.scheme !== 'regular' && shop.homeState && stateCode(input.address.state) !== shop.homeState)
      return { kind: 'refused', status: 422, error: `This shop delivers within ${stateName(shop.homeState)} only.` }
    let buyer: { gstin: string; name: string } | null = null
    if (input.b2b) {
      if (!shop.b2b) return { kind: 'refused', status: 422, error: 'This shop can’t issue GST invoices to businesses right now. Turn off “Claim GST input credit” to order.' }
      const why = b2bProblem(input.b2b.gstin, input.b2b.name, input.address.state)
      if (why) return { kind: 'refused', status: 422, error: why.error }
      buyer = { gstin: cleanGstin(input.b2b.gstin), name: input.b2b.name.replace(/\s+/g, ' ').trim() }
    }

    const rows = await variantRows(tx, tenantId, input.bag.map((b) => b.variantId), now, { lock: true })
    const typed = await codeFor(tx, tenantId, input.code, now)
    const offers = await fitOffers(tx, tenantId, await liveOffers(tx, tenantId, now, { fresh: true }), (o) => quote(input.bag, rows, shop, now, input.address.pincode, { offers: o, code: typed }), input, typed, now)
    const q = quote(input.bag, rows, shop, now, input.address.pincode, { offers, code: typed })
    if (q.empty) return { kind: 'refused', status: 422, error: 'Nothing in your bag can be bought right now.', quote: q }
    if (q.missing.length || q.lines.some((l) => l.problem) || totalFor(q, input.method) !== input.expectedTotal) return { kind: 'changed', quote: q }
    if (input.method === 'cod' && !q.cod.offer.offered) return { kind: 'refused', status: 422, error: 'Pay on delivery is not offered for this order. Pay online instead.', quote: q }

    // KS-1001 onwards: the shop's own counter, taken in this transaction.
    const [c] = await tx.insert(tenantCounters).values({ tenantId, kind: 'order', period: '', next: 1002 })
      .onConflictDoUpdate({ target: [tenantCounters.tenantId, tenantCounters.kind, tenantCounters.period], set: { next: sql`${tenantCounters.next} + 1` } })
      .returning({ next: tenantCounters.next })
    const number = c!.next - 1
    const id = randomUUID()
    const cod = input.method === 'cod'
    const m = cod ? q.cod : q.prepaid
    // Costs for profit: read here, stored on the lines, never returned.
    const costs = new Map((await tx.select({ id: variants.id, cost: variants.unitCost }).from(variants)
      .where(and(eq(variants.tenantId, tenantId), inArray(variants.id, q.lines.map((l) => l.variantId))))).map((r) => [r.id, r.cost === null ? null : Number(r.cost)]))
    const live = q.lines.filter((l) => l.qty > 0)
    const cogs = live.every((l) => costs.get(l.variantId) != null) ? live.reduce((a, l) => a + costs.get(l.variantId)! * l.qty, 0) : null

    await tx.insert(orders).values({
      id, tenantId, number, paymentMethod: input.method,
      subtotal: q.subtotal, discount: m.discount, shipping: q.shipping, codCharge: m.codCharge, gstTotal: m.gst, total: m.total, pricesIncludeGst: shop.pricesIncludeGst,
      merchandiseNet: m.merchandiseNet, cogs,
      waOptInAt: input.waOptIn ? now : null, waOptInNotice: input.waOptIn ? WA_OPT_IN_NOTICE : null,
      customerName: input.address.name, phone: input.address.phone, email: input.address.email ?? null, addressLine: input.address.addressLine, area: input.address.area, landmark: input.address.landmark,
      pincode: input.address.pincode, city: input.address.city, state: input.address.state, supplyState: input.address.state, shopState: gstinState(shop.gstin), sellerGstin: shop.gstin, sellerScheme: shop.scheme,
      buyerGstin: buyer?.gstin ?? null, buyerName: buyer?.name ?? '',
      arrivesFrom: q.arrives?.from ?? null, arrivesTo: q.arrives?.to ?? null, returnDays: shop.returnDays, returnKind: shop.returnKind,
      tokenHash: tokenHash(orderToken(id)), idempotencyKey: input.idempotencyKey, requestHash: reqHash,
      payBy: cod ? null : new Date(now.getTime() + HOLD_MINUTES * 60_000),
      checkout: { shown: { prepaid: q.prepaid.total, cod: q.cod.offer.offered ? q.cod.total : null, codCharge: shop.codCharge }, firstMethod: input.facts.firstMethod ?? null,
        attribution: input.facts.attribution ?? {}, onlineTotal: q.prepaid.total, ...(input.facts.ekcode ? { ekcode: input.facts.ekcode } : {}) },
      placedAt: now,
    })
    // A checked phone (EkCode, plan task 3): link the order to the shop's customer only when the session's phone is this
    // order's phone — the session found by its token's hash inside this tenant, never anything in the body.
    if (input.session) await linkCustomer(tx, tenantId, id, input.session, input.address.phone)
    // Email E·2: COD is confirmed at once; an online order gets "Finish paying" only if still unpaid after its hold.
    await enqueueOrderEmail(tx, tenantId, id, cod ? 'confirmed' : 'finish_paying', null, now)
    // An online order asks Razorpay itself when its hold ends: a lost webhook never leaves a paid order unpaid.
    if (!cod) await enqueuePaymentCheck(tx, tenantId, id, new Date(now.getTime() + HOLD_MINUTES * 60_000))
    await tx.insert(orderLines).values(live.map((l, position) => ({
      ...m.shares[position]!,
      lineDiscount: m.lines[position]!.discount, productDiscount: m.lines[position]!.productDiscount, taxableValue: m.lines[position]!.taxable, gstBps: m.lines[position]!.gstBps, gst: m.lines[position]!.gst,
      tenantId, orderId: id, variantId: l.variantId, productId: l.productId, title: l.title, optionValues: l.values, sku: l.sku,
      imageBase: l.image?.base ?? null, imageWidths: l.image?.widths ?? null, qty: l.qty, unitPrice: l.unitPrice, compareAt: l.compareAt,
      hsn: l.hsn, uqc: l.uqc, unitCost: costs.get(l.variantId) ?? null,
      kind: l.kind, shipsBy: l.shipsBy, leadMinDays: l.leadMinDays, leadMaxDays: l.leadMaxDays, position,
    })))
    // What the order got, with its value terms copied (a tier: the step reached). Buy X get Y, gift and target terms are
    // not copied: what they gave is fixed on each line (order_lines.product_discount), which is what a reprice keeps.
    // Placed online with an order offer other than paying on delivery's, both are kept, each marked with its way
    // (keptOffers, shop stress test 2026-11-11): a switch to COD reprices to the one paying on delivery gets.
    const kept = keptOffers(q, input.method)
    if (kept.length) await tx.insert(orderDiscounts).values(kept.map((a) => ({
      tenantId, orderId: id, discountId: a.discountId, class: a.class, amount: a.amount, title: a.title, style: a.terms.style, method: a.method,
      ...termsCopy(a.terms, q.subtotal - m.lines.reduce((s, l) => s + l.productDiscount, 0)), via: typed?.discountId === a.discountId ? (input.via ?? 'typed') : 'auto',
      codeId: typed?.discountId === a.discountId ? typed.codeId : a.codeId,
    })))
    if (cod) await takeStock(tx, tenantId, id, 'in_stock', soldOut)
    return { kind: 'new', id, number, method: input.method, total: m.total, code: q.offers.code }
  })
  if (placed.kind !== 'new') return placed
  // The last piece went: the cached pages say sold out within the 60 s backstop at most (refreshSoldOut, once per 30 s; checkout reads live stock).
  if (soldOut.length) refreshSoldOut(tenantId)
  const out: Placed = { kind: 'placed', token: orderToken(placed.id), number: placed.number, method: placed.method, total: placed.total, pay: null, code: placed.code ?? null }
  if (placed.method === 'cod') return out
  const pay = await startPayment(tenantId, placed.id)
  return pay.ok ? { ...out, pay: pay.pay } : { ...out, payError: pay.error }
}

/** The terms an order keeps (copied, typed columns): a tier copies the step it reached. */
function termsCopy(t: DiscountTerms, subtotal: number) {
  const step = stepReached(t.tiers, subtotal)
  return step ? { percentBps: step.percentBps, amountOff: step.amountOff, cap: t.cap, minSubtotal: step.min } : { percentBps: t.percentBps, amountOff: t.amountOff, cap: t.cap, minSubtotal: t.minSubtotal }
}

/**
 * The live offers this placement may use. Every offer the bag could get that has a limit or a budget is locked, in
 * id order, BEFORE anything is counted (no deadlock between two checkouts; plan review 8); an offer with no limit locks
 * nothing, so a sitewide offer never queues a festive checkout. Then: an offer at its total or per-phone limit drops
 * out; the bag is priced; an applied offer whose amount would cross its budget drops out and the bag is priced again.
 */
async function fitOffers(tx: Tx, tenantId: string, offers: DiscountTerms[], price: (o: DiscountTerms[]) => Quote, input: PlaceInput, typed: TypedCode | null, now: Date): Promise<DiscountTerms[]> {
  const subtotal = price([]).subtotal
  // First order: one phone at a time in this shop (two at once cannot both be first); a phone with a standing or
  // holding order here does not get it. The shopper reads the usual "changed" (it does reveal, slowly, that the
  // phone has ordered here: accepted, O·2 plan review 6).
  if (offers.some((t) => t.firstOrder)) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${tenantId + ':phone:' + input.address.phone}, 0))`)
    const [had] = await tx.execute<{ yes: boolean }>(sql`select ${priorOrderSql(now, tenantId, input.address.phone)} yes`)
    if (had?.yes) offers = offers.filter((t) => !t.firstOrder)
  }
  const could = candidates(offers, typed).filter((t) => t.style === 'free_shipping' || classOf(t.style) === 'product' || amountFor(t, subtotal) > 0).map((t) => t.id)
  if (!could.length) return offers
  const limited = (await tx.execute<{ id: string; limit_total: number | null; limit_per_phone: number | null; budget: string | null }>(sql`
    select id, limit_total, limit_per_phone, budget from ${discounts} where tenant_id = ${tenantId} and id in ${could}
      and (limit_total is not null or limit_per_phone is not null or budget is not null) order by id for update`))
    .map((l) => ({ id: l.id, limitTotal: l.limit_total, limitPerPhone: l.limit_per_phone, budget: l.budget === null ? null : Number(l.budget) }))
  if (!limited.length) return offers
  const used = await discountUses(tx, tenantId, limited.map((l) => l.id), now, { phone: input.address.phone })
  // Uses and per-phone first (budget 0 here: the amount is not known until priced); then budgets on the priced bag.
  const out = new Set(limited.filter((l) => !fits({ ...l, budget: null }, used.get(l.id), 0)).map((l) => l.id))
  for (let pass = 0; pass <= limited.length; pass++) {
    const q = price(offers.filter((t) => !out.has(t.id)))
    // Every offer the order will keep — online, also the one paying on delivery would get (it is held for a switch).
    const over = keptOffers(q, input.method).filter((a) => { const l = limited.find((x) => x.id === a.discountId); return l && !fits(l, used.get(l.id), a.amount) })
    if (!over.length) break
    for (const a of over) out.add(a.discountId)
  }
  return offers.filter((t) => !out.has(t.id))
}

/**
 * Take the stock of an order's lines of `kind` whose stock is not taken yet (in_stock: COD at placement or
 * switch, online at capture; preorder: at packing). Each line is stamped when its stock leaves the shelf —
 * only the lines actually taken — so a second call takes nothing and a cancel puts back exactly what was taken.
 * Returns the lines that could not be covered (a capture after its hold expired and the piece sold: refund due).
 * Variants it took to 0 are pushed onto `soldOut`, so the caller refreshes the cached shop pages after its commit.
 */
export async function takeStock(tx: Tx, tenantId: string, orderId: string, kind: 'in_stock' | 'preorder' = 'in_stock', soldOut: string[] = []): Promise<{ short: number; taken: number }> {
  const lines = await tx.select({ id: orderLines.id, variantId: orderLines.variantId, qty: orderLines.qty }).from(orderLines)
    .where(and(eq(orderLines.tenantId, tenantId), eq(orderLines.orderId, orderId), eq(orderLines.kind, kind), isNull(orderLines.stockTakenAt)))
  let short = 0, taken = 0
  // Variants in id order, as variantRows locks them: no deadlock between two orders sharing pieces.
  for (const l of [...lines].sort((a, b) => String(a.variantId).localeCompare(String(b.variantId)))) {
    if (!l.variantId) { short++; continue }
    const r = await tx.update(variants).set({ stock: sql`${variants.stock} - ${l.qty}` })
      .where(and(eq(variants.tenantId, tenantId), eq(variants.id, l.variantId), sql`${variants.stock} >= ${l.qty}`)).returning({ id: variants.id, stock: variants.stock })
    if (!r.length) { short++; continue }
    taken++
    if (r[0]!.stock === 0) soldOut.push(l.variantId)
    await tx.update(orderLines).set({ stockTakenAt: sql`now()` })
      .where(and(eq(orderLines.tenantId, tenantId), eq(orderLines.id, l.id), isNull(orderLines.stockTakenAt)))
  }
  return { short, taken }
}

/**
 * Give an unpaid online order a Razorpay order to pay against (created once, reused on retry). Only after the
 * order row is committed: the one synchronous outbound call in checkout (ADR-0006 amendment).
 */
export async function startPayment(tenantId: string, orderId: string): Promise<{ ok: true; pay: Pay } | { ok: false; error: string }> {
  const o = await withTenant(tenantId, async (tx) => {
    const [r] = await tx.select({ number: orders.number, rzp: orders.razorpayOrderId, checkout: orders.checkout, name: orders.customerName, phone: orders.phone, paidAt: orders.paidAt, cancelledAt: orders.cancelledAt, switched: orders.switchedToCodAt })
      .from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId)))
    const keys = await keysFor(tx, tenantId)
    const shop = await checkoutShop(tx, tenantId, null)
    return r ? { ...r, keys, shopName: shop?.name ?? '' } : null
  })
  if (!o || o.paidAt || o.cancelledAt || o.switched) return { ok: false, error: 'This order is not waiting for an online payment.' }
  if (!o.keys) return { ok: false, error: 'Online payment is not working right now.' }
  const amount = Number((o.checkout as { onlineTotal?: number } | null)?.onlineTotal ?? 0)
  let rzp = o.rzp
  if (!rzp) {
    const made = await createOrder(o.keys, { amount, receipt: `${o.number}-${orderId.slice(0, 8)}`, notes: { frata_order: orderId } })
    if (!made.ok) {
      console.error('[startPayment] razorpay order', made.status)
      return { ok: false, error: 'Online payment is not working right now.' }
    }
    // Stored only if none is set: two tabs racing get the same Razorpay order.
    rzp = await withTenant(tenantId, async (tx) => {
      await tx.update(orders).set({ razorpayOrderId: made.id }).where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId), isNull(orders.razorpayOrderId)))
      const [r] = await tx.select({ rzp: orders.razorpayOrderId }).from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId)))
      return r?.rzp ?? made.id
    })
  }
  return { ok: true, pay: { keyId: o.keys.keyId, razorpayOrderId: rzp!, amount, name: o.name, phone: o.phone, shop: o.shopName } }
}
