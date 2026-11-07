import 'server-only'
import { randomUUID } from 'node:crypto'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { CleanAddress } from '@/domains/checkout/address'
import { quote, totalFor, type BagLine, type Quote } from '@/domains/checkout/quote'
import { gstinState } from '@/domains/tax/gst'
import type { Tx } from '@/lib/db'
import { tenantCounters } from '@/lib/db/schema'
import { variants } from '@/lib/db/schema-catalogue'
import { orderLines, orders } from '@/lib/db/schema-orders'
import { withTenant } from '@/lib/db/tenant'
import { orderToken, sha256, tokenHash } from '@/lib/crypto/secret-box'
import { checkoutShop, variantRows } from '@/lib/queries/checkout'
import { keysFor } from '@/lib/payments/keys'
import { createOrder } from '@/lib/payments/razorpay'

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
// =============================================================================

export const HOLD_MINUTES = 20 // owner call 3

export type PlaceInput = {
  idempotencyKey: string; bag: BagLine[]; address: CleanAddress; method: 'cod' | 'prepaid'; expectedTotal: number
  /** What the shopper was shown and did, for the hypotheses (frata-unit-economics): first card tapped, attribution. */
  facts: { firstMethod?: 'cod' | 'prepaid' | null; attribution?: Record<string, string> }
}
export type Pay = { keyId: string; razorpayOrderId: string; amount: number; name: string; phone: string; shop: string }
export type Placed = { kind: 'placed'; token: string; number: number; method: 'cod' | 'prepaid'; total: number; pay: Pay | null; payError?: string }
export type PlaceResult =
  | Placed
  | { kind: 'changed'; quote: Quote }
  | { kind: 'refused'; status: 404 | 409 | 422; error: string; quote?: Quote }

const requestHashOf = (i: PlaceInput) => sha256(JSON.stringify([i.address.phone, i.method, [...i.bag].map((b) => [b.variantId, b.qty]).sort()]))

export async function placeOrder(tenantId: string, input: PlaceInput, now = new Date()): Promise<PlaceResult> {
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
    // Abandoned online orders keep their row and lines for counts, but not the shopper's details past 90 days (spec, retention).
    await tx.update(orders).set({ customerName: '', phone: '', addressLine: '', landmark: '', erasedAt: now })
      .where(and(eq(orders.tenantId, tenantId), isNull(orders.erasedAt), isNull(orders.paidAt), isNull(orders.switchedToCodAt), eq(orders.paymentMethod, 'prepaid'),
        sql`${orders.placedAt} < ${new Date(now.getTime() - 90 * 86_400_000)}`))
    if (input.method === 'prepaid' && !shop.online) return { kind: 'refused', status: 422, error: 'Online payment is not available at this shop right now. Pay on delivery instead.' }

    const rows = await variantRows(tx, tenantId, input.bag.map((b) => b.variantId), now, { lock: true })
    const q = quote(input.bag, rows, shop, now, input.address.pincode)
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
      subtotal: q.subtotal, shipping: q.shipping, codCharge: m.codCharge, gstTotal: m.gst, total: m.total, pricesIncludeGst: shop.pricesIncludeGst,
      merchandiseNet: q.merchandiseNet, cogs,
      customerName: input.address.name, phone: input.address.phone, addressLine: `${input.address.addressLine}, ${input.address.area}`, landmark: input.address.landmark,
      pincode: input.address.pincode, city: input.address.city, state: input.address.state, supplyState: input.address.state, shopState: gstinState(shop.gstin),
      arrivesFrom: q.arrives?.from ?? null, arrivesTo: q.arrives?.to ?? null, returnDays: shop.returnDays, returnKind: shop.returnKind,
      tokenHash: tokenHash(orderToken(id)), idempotencyKey: input.idempotencyKey, requestHash: reqHash,
      payBy: cod ? null : new Date(now.getTime() + HOLD_MINUTES * 60_000),
      checkout: { shown: { prepaid: q.prepaid.total, cod: q.cod.offer.offered ? q.cod.total : null, codCharge: shop.codCharge }, firstMethod: input.facts.firstMethod ?? null,
        attribution: input.facts.attribution ?? {}, onlineTotal: q.prepaid.total, stockTaken: cod },
      placedAt: now,
    })
    await tx.insert(orderLines).values(live.map((l, position) => ({
      tenantId, orderId: id, variantId: l.variantId, productId: l.productId, title: l.title, optionValues: l.values, sku: l.sku,
      imageBase: l.image?.base ?? null, imageWidths: l.image?.widths ?? null, qty: l.qty, unitPrice: l.unitPrice, compareAt: l.compareAt,
      taxableValue: l.taxable, gstBps: l.gstBps, gst: l.gst, hsn: l.hsn, unitCost: costs.get(l.variantId) ?? null,
      kind: l.kind, shipsBy: l.shipsBy, leadMinDays: l.leadMinDays, leadMaxDays: l.leadMaxDays, position,
    })))
    if (cod) await takeStock(tx, tenantId, id)
    return { kind: 'new', id, number, method: input.method, total: m.total }
  })
  if (placed.kind !== 'new') return placed
  const out: Placed = { kind: 'placed', token: orderToken(placed.id), number: placed.number, method: placed.method, total: placed.total, pay: null }
  if (placed.method === 'cod') return out
  const pay = await startPayment(tenantId, placed.id)
  return pay.ok ? { ...out, pay: pay.pay } : { ...out, payError: pay.error }
}

/**
 * Take the stock of an order's in-stock lines (COD at placement or switch, online at capture), once.
 * False when a line can no longer be covered (a capture that landed after its hold expired and the piece sold).
 */
export async function takeStock(tx: Tx, tenantId: string, orderId: string): Promise<boolean> {
  const lines = await tx.select({ variantId: orderLines.variantId, qty: orderLines.qty }).from(orderLines)
    .where(and(eq(orderLines.tenantId, tenantId), eq(orderLines.orderId, orderId), eq(orderLines.kind, 'in_stock')))
  let ok = true
  for (const l of [...lines].sort((a, b) => String(a.variantId).localeCompare(String(b.variantId)))) {
    if (!l.variantId) continue
    const r = await tx.update(variants).set({ stock: sql`${variants.stock} - ${l.qty}` })
      .where(and(eq(variants.tenantId, tenantId), eq(variants.id, l.variantId), sql`${variants.stock} >= ${l.qty}`)).returning({ id: variants.id })
    if (!r.length) ok = false
  }
  await tx.update(orders).set({ checkout: sql`coalesce(${orders.checkout}, '{}'::jsonb) || ${JSON.stringify({ stockTaken: true, ...(ok ? {} : { outOfStockOnPayment: true }) })}::jsonb` })
    .where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId)))
  return ok
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
