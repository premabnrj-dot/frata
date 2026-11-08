import 'server-only'
import { randomUUID } from 'node:crypto'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { CleanAddress } from '@/domains/checkout/address'
import { amountFor, type DiscountTerms } from '@/domains/checkout/discounts'
import { quote, totalFor, type BagLine, type Quote } from '@/domains/checkout/quote'
import { gstinState } from '@/domains/tax/gst'
import type { Tx } from '@/lib/db'
import { tenantCounters } from '@/lib/db/schema'
import { variants } from '@/lib/db/schema-catalogue'
import { orderLines, orders } from '@/lib/db/schema-orders'
import { withTenant } from '@/lib/db/tenant'
import { orderToken, sha256, tokenHash } from '@/lib/crypto/secret-box'
import { checkoutShop, liveOffers, variantRows } from '@/lib/queries/checkout'
import { useOfRowSql } from '@/lib/db/discount-predicates'
import { discounts, orderDiscounts } from '@/lib/db/schema-discounts'
import { keysFor } from '@/lib/payments/keys'
import { createOrder } from '@/lib/payments/razorpay'
import { refreshShop } from '@/lib/queries/storefront'

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
  /** The code the shopper typed, if any (one per order). */
  code?: string | null
  /** What the shopper was shown and did, for the hypotheses (frata-unit-economics): first card tapped, attribution. */
  facts: { firstMethod?: 'cod' | 'prepaid' | null; attribution?: Record<string, string> }
}
export type Pay = { keyId: string; razorpayOrderId: string; amount: number; name: string; phone: string; shop: string }
export type Placed = { kind: 'placed'; token: string; number: number; method: 'cod' | 'prepaid'; total: number; pay: Pay | null; payError?: string }
export type PlaceResult =
  | Placed
  | { kind: 'changed'; quote: Quote }
  | { kind: 'refused'; status: 404 | 409 | 422; error: string; quote?: Quote }

const requestHashOf = (i: PlaceInput) => sha256(JSON.stringify([i.address.phone, i.method, [...i.bag].map((b) => [b.variantId, b.qty]).sort(), ...(i.code ? [i.code.trim().toUpperCase()] : [])]))

export async function placeOrder(tenantId: string, input: PlaceInput, now = new Date()): Promise<PlaceResult> {
  const soldOut: string[] = []
  const placed = await withTenant(tenantId, async (tx): Promise<PlaceResult | { kind: 'new'; id: string; number: number; method: 'cod' | 'prepaid'; total: number }> => {
    // A retry of the same attempt finds its order; the same key with a different bag is not the same attempt.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${tenantId + ':' + input.idempotencyKey}, 0))`)
    const reqHash = requestHashOf(input)
    const [prior] = await tx.select({ id: orders.id, number: orders.number, method: orders.paymentMethod, total: orders.total, requestHash: orders.requestHash })
      .from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.idempotencyKey, input.idempotencyKey)))
    if (prior) {
      if (prior.requestHash !== reqHash) return { kind: 'refused', status: 409, error: 'This checkout was already used for a different order. Reload the page.' }
      return { kind: 'new', id: prior.id, number: prior.number, method: prior.method as 'cod' | 'prepaid', total: Number(prior.total) }
    }
    const shop = await checkoutShop(tx, tenantId)
    if (!shop || !shop.open) return { kind: 'refused', status: 404, error: 'This shop is not taking orders right now.' }
    // Abandoned online orders lose the shopper's details after 90 days: the daily cron (src/lib/orders/erase.ts).
    if (input.method === 'prepaid' && !shop.online) return { kind: 'refused', status: 422, error: 'Online payment is not available at this shop right now. Pay on delivery instead.' }

    const rows = await variantRows(tx, tenantId, input.bag.map((b) => b.variantId), now, { lock: true })
    const offers = await fitOffers(tx, tenantId, await liveOffers(tx, tenantId, now), (o) => quote(input.bag, rows, shop, now, input.address.pincode, { offers: o, code: input.code }), input, now)
    const q = quote(input.bag, rows, shop, now, input.address.pincode, { offers, code: input.code })
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
      customerName: input.address.name, phone: input.address.phone, addressLine: input.address.addressLine, area: input.address.area, landmark: input.address.landmark,
      pincode: input.address.pincode, city: input.address.city, state: input.address.state, supplyState: input.address.state, shopState: gstinState(shop.gstin), sellerGstin: shop.gstin,
      arrivesFrom: q.arrives?.from ?? null, arrivesTo: q.arrives?.to ?? null, returnDays: shop.returnDays, returnKind: shop.returnKind,
      tokenHash: tokenHash(orderToken(id)), idempotencyKey: input.idempotencyKey, requestHash: reqHash,
      payBy: cod ? null : new Date(now.getTime() + HOLD_MINUTES * 60_000),
      checkout: { shown: { prepaid: q.prepaid.total, cod: q.cod.offer.offered ? q.cod.total : null, codCharge: shop.codCharge }, firstMethod: input.facts.firstMethod ?? null,
        attribution: input.facts.attribution ?? {}, onlineTotal: q.prepaid.total },
      placedAt: now,
    })
    await tx.insert(orderLines).values(live.map((l, position) => ({
      ...m.shares[position]!,
      lineDiscount: m.lines[position]!.discount, taxableValue: m.lines[position]!.taxable, gstBps: m.lines[position]!.gstBps, gst: m.lines[position]!.gst,
      tenantId, orderId: id, variantId: l.variantId, productId: l.productId, title: l.title, optionValues: l.values, sku: l.sku,
      imageBase: l.image?.base ?? null, imageWidths: l.image?.widths ?? null, qty: l.qty, unitPrice: l.unitPrice, compareAt: l.compareAt,
      hsn: l.hsn, unitCost: costs.get(l.variantId) ?? null,
      kind: l.kind, shipsBy: l.shipsBy, leadMinDays: l.leadMinDays, leadMaxDays: l.leadMaxDays, position,
    })))
    // What the order got, with the terms copied (the order keeps them whatever the offer becomes).
    if (m.applied.length) await tx.insert(orderDiscounts).values(m.applied.map((a) => ({
      tenantId, orderId: id, discountId: a.discountId, codeId: a.codeId, class: a.class, amount: a.amount, title: a.title, style: a.terms.style,
      percentBps: a.terms.percentBps, amountOff: a.terms.amountOff, cap: a.terms.cap, minSubtotal: a.terms.minSubtotal,
    })))
    if (cod) await takeStock(tx, tenantId, id, 'in_stock', soldOut)
    return { kind: 'new', id, number, method: input.method, total: m.total }
  })
  if (placed.kind !== 'new') return placed
  // The last piece went: the cached product pages say sold out at once (1D gap fix).
  if (soldOut.length) refreshShop(tenantId, 'catalogue')
  const out: Placed = { kind: 'placed', token: orderToken(placed.id), number: placed.number, method: placed.method, total: placed.total, pay: null }
  if (placed.method === 'cod') return out
  const pay = await startPayment(tenantId, placed.id)
  return pay.ok ? { ...out, pay: pay.pay } : { ...out, payError: pay.error }
}

/**
 * The live offers this placement may use. Every offer the bag could get that has a limit or a budget is locked, in
 * id order, BEFORE anything is counted (no deadlock between two checkouts; plan review 8); an offer with no limit locks
 * nothing, so a sitewide offer never queues a festive checkout. Then: an offer at its total or per-phone limit drops
 * out; the bag is priced; an applied offer whose amount would cross its budget drops out and the bag is priced again.
 */
async function fitOffers(tx: Tx, tenantId: string, offers: DiscountTerms[], price: (o: DiscountTerms[]) => Quote, input: PlaceInput, now: Date): Promise<DiscountTerms[]> {
  const typed = input.code ? input.code.trim().toUpperCase() : null
  const subtotal = price([]).subtotal
  const could = offers.filter((t) => (t.code === null || t.listed || t.code === typed) && (t.style === 'free_shipping' || amountFor(t, subtotal) > 0)).map((t) => t.id)
  if (!could.length) return offers
  const limited = await tx.execute<{ id: string; limit_total: number | null; limit_per_phone: number | null; budget: string | null }>(sql`
    select id, limit_total, limit_per_phone, budget from ${discounts} where tenant_id = ${tenantId} and id in ${could}
      and (limit_total is not null or limit_per_phone is not null or budget is not null) order by id for update`)
  if (!limited.length) return offers
  const used = new Map((await tx.execute<{ id: string; n: number; given: string; phone: number }>(sql`
    select od.discount_id id, count(*)::int n, coalesce(sum(od.amount), 0)::bigint given, (count(*) filter (where o.phone = ${input.address.phone}))::int phone
      from ${orderDiscounts} od join ${orders} o on o.tenant_id = od.tenant_id and o.id = od.order_id
     where od.tenant_id = ${tenantId} and od.discount_id in ${limited.map((l) => l.id)} and ${useOfRowSql(now)} group by od.discount_id`)).map((u) => [u.id, u]))
  const out = new Set(limited.filter((l) => {
    const u = used.get(l.id)
    return (l.limit_total !== null && (u?.n ?? 0) + 1 > l.limit_total) || (l.limit_per_phone !== null && (u?.phone ?? 0) + 1 > l.limit_per_phone)
  }).map((l) => l.id))
  // Budgets: as many passes as there are limited offers (each pass drops at least one, or stops).
  for (let pass = 0; pass <= limited.length; pass++) {
    const q = price(offers.filter((t) => !out.has(t.id)))
    const m = input.method === 'cod' ? q.cod : q.prepaid
    const over = m.applied.filter((a) => {
      const l = limited.find((x) => x.id === a.discountId)
      return l?.budget != null && Number(used.get(l.id)?.given ?? 0) + a.amount > Number(l.budget)
    })
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
    const shop = await checkoutShop(tx, tenantId)
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
