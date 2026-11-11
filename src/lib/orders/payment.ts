import 'server-only'
import { enqueueOrderEmail } from '@/lib/email/enqueue'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { quote, type Quote } from '@/domains/checkout/quote'
import { reprice } from '@/domains/orders/amounts'
import { discountUses, fits, liveDiscountSql } from '@/lib/db/discount-predicates'
import { priorOrderSql } from '@/lib/db/order-predicates'
import { discounts, orderDiscounts } from '@/lib/db/schema-discounts'
import type { Tx } from '@/lib/db'
import { webhookEvents } from '@/lib/db/schema'
import { orderLines, orders } from '@/lib/db/schema-orders'
import { withTenant } from '@/lib/db/tenant'
import { tokenHash } from '@/lib/crypto/secret-box'
import { checkoutShop, variantRows } from '@/lib/queries/checkout'
import { keysFor, markEvent } from '@/lib/payments/keys'
import { checkoutSignatureOk, orderPayments, toPayment } from '@/lib/payments/razorpay'
import { trimRazorpayEvent } from '@/lib/webhooks/razorpay'
import { refreshSoldOut } from '@/lib/queries/storefront'
import { HOLD_MINUTES, startPayment, takeStock, type Pay } from './place'
import { storedPricing, writeReprice } from './reprice'

// =============================================================================
// FILE: src/lib/orders/payment.ts
//
// AN ONLINE ORDER BECOMING PAID — by whichever arrives first: the browser's
// signed Checkout reply or Razorpay's webhook. One conditional update
// (paid_at is null): the second is a no-op. Paid beats a switch to COD; a
// switch first asks Razorpay whether a payment is already on its way, so a
// shopper is never charged twice (architecture review 2026-11-07).
// =============================================================================

type OrderKey = { id: string; tenantId: string }

/**
 * Record the payment once and take the stock of any line not taken yet (none, after a switch to COD: takeStock
 * stamps per line). A capture after a switch: the shopper paid the online total, so the order is priced again as
 * prepaid from its stored lines and offers (amounts.reprice: the COD fee off, the pay-online saving back) and every
 * money column rewritten together (reprice.ts) — but ONLY before packing.
 * Once packed, its invoice is issued under its number and is never rewritten (GST Rule 46; unit-economics review
 * 2026-11-07): the order keeps its figures and says "paid after packing" (paidAfterPacking) for a person to settle.
 */
export async function markPaid(tx: Tx, o: OrderKey, p: { paymentId: string; fee?: number | null; tax?: number | null }, soldOut: string[] = []): Promise<'paid' | 'already'> {
  const r = await tx.update(orders).set({ paidAt: sql`now()`, razorpayPaymentId: p.paymentId, ...(p.fee != null ? { gatewayFee: p.fee, gatewayTax: p.tax ?? null } : {}) })
    .where(and(eq(orders.tenantId, o.tenantId), eq(orders.id, o.id), isNull(orders.paidAt)))
    .returning({ switchedAt: orders.switchedToCodAt, packedAt: orders.packedAt, shipping: orders.shipping, pricesIncludeGst: orders.pricesIncludeGst, sellerGstin: orders.sellerGstin, checkout: orders.checkout })
  if (!r.length) {
    // Already paid (the other path won): the fee may still be news.
    if (p.fee != null) await tx.update(orders).set({ gatewayFee: p.fee, gatewayTax: p.tax ?? null }).where(and(eq(orders.tenantId, o.tenantId), eq(orders.id, o.id), isNull(orders.gatewayFee)))
    return 'already'
  }
  const paid = r[0]!
  if (paid.switchedAt && !paid.packedAt) {
    const sp = await storedPricing(tx, o.tenantId, o.id, { shipping: Number(paid.shipping), sellerGstin: paid.sellerGstin, pricesIncludeGst: paid.pricesIncludeGst })
    const r = reprice(sp, 'prepaid')
    // What the shopper paid is the online total they were shown; a difference is a bug to see, not to hide.
    const shown = Number((paid.checkout as { onlineTotal?: number } | null)?.onlineTotal ?? r.total)
    if (shown !== r.total) console.error('[markPaid] recomputed online total differs from the one shown', { order: o.id, shown, now: r.total })
    await writeReprice(tx, o.tenantId, o.id, sp.lineIds, r)
  }
  await takeStock(tx, o.tenantId, o.id, 'in_stock', soldOut)
  // Email E·2: once per order (a switch to COD then a capture sends one "confirmed").
  await enqueueOrderEmail(tx, o.tenantId, o.id, 'confirmed', null, new Date())
  return 'paid'
}

const byToken = async (tx: Tx, tenantId: string, token: string) => {
  if (!/^[A-Za-z0-9_-]{22}$/.test(token)) return null
  const [o] = await tx.select({ id: orders.id, method: orders.paymentMethod, rzp: orders.razorpayOrderId, paidAt: orders.paidAt, cancelledAt: orders.cancelledAt, switchedAt: orders.switchedToCodAt,
    payBy: orders.payBy, subtotal: orders.subtotal, total: orders.total, pincode: orders.pincode, phone: orders.phone, shipping: orders.shipping, sellerGstin: orders.sellerGstin, pricesIncludeGst: orders.pricesIncludeGst })
    .from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.tokenHash, tokenHash(token))))
  return o ?? null
}

/** The browser's Checkout reply. The signature is checked with OUR stored Razorpay order id. */
export async function confirmPayment(tenantId: string, token: string, reply: { paymentId: string; signature: string }): Promise<{ ok: true } | { ok: false; status: 400 | 404; error: string }> {
  const soldOut: string[] = []
  const r = await withTenant(tenantId, async (tx): Promise<{ ok: true } | { ok: false; status: 400 | 404; error: string }> => {
    const o = await byToken(tx, tenantId, token)
    if (!o || !o.rzp) return { ok: false, status: 404, error: 'Not found' }
    const keys = await keysFor(tx, tenantId)
    if (!keys || !checkoutSignatureOk(o.rzp, reply.paymentId, reply.signature, keys.keySecret)) return { ok: false, status: 400, error: 'We could not confirm this payment. If money left your account, the shop will see it within minutes.' }
    await markPaid(tx, { id: o.id, tenantId }, { paymentId: reply.paymentId }, soldOut)
    return { ok: true }
  })
  if (soldOut.length) await refreshSoldOut(tenantId)
  return r
}

/** Record a failed attempt (the shopper sees the filled checkout again). */
export async function paymentFailed(tenantId: string, token: string): Promise<void> {
  await withTenant(tenantId, async (tx) => {
    const o = await byToken(tx, tenantId, token)
    if (o && !o.paidAt) await tx.update(orders).set({ paymentFailedAt: sql`now()` }).where(and(eq(orders.tenantId, tenantId), eq(orders.id, o.id)))
  })
}

export type SwitchResult = { kind: 'switched'; total: number } | { kind: 'paid' } | { kind: 'changed'; quote: Quote }
  | { kind: 'refused'; status: 404 | 409 | 422; error: string; codTotal?: number }

/**
 * Pay on delivery instead, for the SAME order. Asks Razorpay first: a payment authorized or captured means it is
 * paid (or about to be), and nothing is switched. The COD total is the order priced again from its stored lines and
 * offers (the pay-online saving comes off; the COD fee and its limits from today's settings, on the bag after the
 * order offer) and must be the one the shopper saw; if not, the reply carries it so the shopper can see it first.
 */
export async function switchToCod(tenantId: string, token: string, expectedTotal: number, now = new Date()): Promise<SwitchResult> {
  const pre = await withTenant(tenantId, async (tx) => ({ o: await byToken(tx, tenantId, token), keys: await keysFor(tx, tenantId) }))
  if (!pre.o || pre.o.method !== 'prepaid' || pre.o.cancelledAt) return { kind: 'refused', status: 404, error: 'Not found' }
  if (pre.o.paidAt) return { kind: 'paid' }
  if (pre.o.switchedAt) return { kind: 'switched', total: Number(pre.o.total) }
  if (pre.o.rzp && pre.keys) {
    const pays = await orderPayments(pre.keys, pre.o.rzp)
    if (pays === null) return { kind: 'refused', status: 409, error: 'We could not check with Razorpay whether your payment went through. Try again in a minute.' }
    const captured = pays.find((p) => p.status === 'captured')
    if (captured) {
      const soldOut: string[] = []
      await withTenant(tenantId, (tx) => markPaid(tx, { id: pre.o!.id, tenantId }, { paymentId: captured.id, fee: captured.fee, tax: captured.tax }, soldOut))
      if (soldOut.length) await refreshSoldOut(tenantId)
      return { kind: 'paid' }
    }
    if (pays.some((p) => p.status === 'authorized')) return { kind: 'refused', status: 409, error: 'Your payment is still going through. Wait a moment, then check your order.' }
  }
  const soldOut: string[] = []
  const r = await withTenant(tenantId, async (tx): Promise<SwitchResult> => {
    const o = await byToken(tx, tenantId, token)
    if (!o || o.paidAt || o.switchedAt || o.cancelledAt) return { kind: 'refused', status: 409, error: 'This order changed. Reload the page.' }
    const shop = await checkoutShop(tx, tenantId, null)
    if (!shop?.published) return { kind: 'refused', status: 404, error: 'This shop is not taking orders right now.' }
    // In position order, and kept with their ids: the quote's shares come back in bag order and are written by id.
    const lines = (await tx.select({ id: orderLines.id, variantId: orderLines.variantId, qty: orderLines.qty }).from(orderLines)
      .where(and(eq(orderLines.tenantId, tenantId), eq(orderLines.orderId, o.id))).orderBy(orderLines.position)).filter((l) => l.variantId)
    const bag = lines.map((l) => ({ variantId: l.variantId!, qty: l.qty }))
    // Re-priced against today's rows, this order's own hold excluded (it is the one switching).
    const rows = (await variantRows(tx, tenantId, bag.map((b) => b.variantId), now, { lock: true }))
      .map((r) => ({ ...r, held: o.payBy && o.payBy > now ? Math.max(0, r.held - (bag.find((b) => b.variantId === r.variantId)?.qty ?? 0)) : r.held }))
    // Today's rows decide only whether every piece can still be sold at its price; the money is the stored order's.
    const q = quote(bag, rows, shop, now, o.pincode)
    if (q.lines.some((l) => l.problem) || q.subtotal !== Number(o.subtotal)) return { kind: 'changed', quote: q }
    const sp = await storedPricing(tx, tenantId, o.id, { shipping: Number(o.shipping), sellerGstin: o.sellerGstin, pricesIncludeGst: o.pricesIncludeGst })
    const { price: r } = reprice(sp, 'cod', shop, o.pincode)
    if (!r) return { kind: 'refused', status: 422, error: 'Pay on delivery is not offered for this order.' }
    if (r.total !== expectedTotal) return { kind: 'refused', status: 409, error: 'The Pay on delivery total is different. Check it and try again.', codTotal: r.total }
    const switched = await tx.update(orders).set({ switchedToCodAt: sql`now()`, payBy: null })
      .where(and(eq(orders.tenantId, tenantId), eq(orders.id, o.id), isNull(orders.paidAt), isNull(orders.switchedToCodAt))).returning({ id: orders.id })
    // Paid or switched in the meantime (another tab, a capture): nothing more to do here (plan review 2026-11-07).
    if (!switched.length) return { kind: 'refused', status: 409, error: 'This order was already paid or moved to Pay on delivery. Reload the page.' }
    await writeReprice(tx, tenantId, o.id, sp.lineIds, r)
    await takeStock(tx, tenantId, o.id, 'in_stock', soldOut)
    await enqueueOrderEmail(tx, tenantId, o.id, 'confirmed', null, now)
    return { kind: 'switched', total: r.total }
  })
  if (soldOut.length) await refreshSoldOut(tenantId)
  return r
}

/**
 * Try paying online again on the same order: the hold is renewed only if every line can still be sold and every
 * limited offer the order got still fits (its use was given back when the hold ran out). Never repriced: the amount
 * Razorpay asks for stays the online total the shopper was shown (offers plan review 3).
 */
export async function retryPayment(tenantId: string, token: string, now = new Date()): Promise<{ ok: true; pay: Pay } | { ok: false; status: 404 | 409 | 422; error: string }> {
  const id = await withTenant(tenantId, async (tx) => {
    const o = await byToken(tx, tenantId, token)
    if (!o || o.method !== 'prepaid' || o.paidAt || o.switchedAt || o.cancelledAt) return null
    if (!o.payBy || o.payBy <= now) {
      const lines = await tx.select({ variantId: orderLines.variantId, qty: orderLines.qty, kind: orderLines.kind }).from(orderLines).where(and(eq(orderLines.tenantId, tenantId), eq(orderLines.orderId, o.id)))
      const rows = await variantRows(tx, tenantId, lines.map((l) => l.variantId!).filter(Boolean), now, { lock: true })
      const shop = await checkoutShop(tx, tenantId, null)
      if (!shop?.published) return 'closed' as const
      const q = quote(lines.filter((l) => l.variantId).map((l) => ({ variantId: l.variantId!, qty: l.qty })), rows, shop, now)
      if (q.lines.some((l) => l.problem) || q.subtotal !== Number(o.subtotal)) return 'gone' as const
      if (!(await offersStillFit(tx, tenantId, o.id, o.phone, now))) return 'offer' as const
      await tx.update(orders).set({ payBy: new Date(now.getTime() + HOLD_MINUTES * 60_000) }).where(and(eq(orders.tenantId, tenantId), eq(orders.id, o.id)))
    }
    return o.id
  })
  if (id === null) return { ok: false, status: 404, error: 'This order is not waiting for an online payment.' }
  if (id === 'closed') return { ok: false, status: 404, error: 'This shop is not taking orders right now.' }
  if (id === 'gone') return { ok: false, status: 409, error: 'Something in this order sold out or changed price while you were away. Go back to your bag.' }
  if (id === 'offer') return { ok: false, status: 409, error: 'An offer on this order changed or ran out while you were away. Go back to your bag.' }
  const pay = await startPayment(tenantId, id)
  return pay.ok ? pay : { ok: false, status: 422, error: pay.error }
}

/**
 * After a hold ran out, whether the order may still be paid at its offers: each is still live (not paused, ended or
 * stopped by Frrata: "before paying, never after"), a first-order one is still the phone's first, and each limited
 * one still has room for it (the order's own use excluded), under a lock. Exported for its int test.
 */
export async function offersStillFit(tx: Tx, tenantId: string, orderId: string, phone: string, now: Date): Promise<boolean> {
  const mine = await tx.select({ discountId: orderDiscounts.discountId, amount: orderDiscounts.amount, firstOrder: discounts.firstOrder, live: sql<boolean>`${liveDiscountSql(now)}` }).from(orderDiscounts)
    .innerJoin(discounts, and(eq(discounts.tenantId, orderDiscounts.tenantId), eq(discounts.id, orderDiscounts.discountId)))
    .where(and(eq(orderDiscounts.tenantId, tenantId), eq(orderDiscounts.orderId, orderId)))
  if (!mine.length) return true
  if (mine.some((m) => !m.live)) return false
  // A first-order offer: the phone may have ordered since this hold ran out (impact review) — same lock, same rule.
  if (mine.some((m) => m.firstOrder)) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${tenantId + ':phone:' + phone}, 0))`)
    const [had] = await tx.execute<{ yes: boolean }>(sql`select ${priorOrderSql(now, tenantId, phone, { except: orderId })} yes`)
    if (had?.yes) return false
  }
  const limited = (await tx.execute<{ id: string; limit_total: number | null; limit_per_phone: number | null; budget: string | null }>(sql`
    select id, limit_total, limit_per_phone, budget from ${discounts} where tenant_id = ${tenantId} and id in ${mine.map((m) => m.discountId)}
      and (limit_total is not null or limit_per_phone is not null or budget is not null) order by id for update`))
  const used = await discountUses(tx, tenantId, limited.map((l) => l.id), now, { phone, excludeOrder: orderId })
  return limited.every((l) => fits({ limitTotal: l.limit_total, limitPerPhone: l.limit_per_phone, budget: l.budget === null ? null : Number(l.budget) }, used.get(l.id),
    Number(mine.find((m) => m.discountId === l.id)!.amount)))
}

/** Store a verified Razorpay event inside the shop OUR key named (drizzle/0043: no webhook row exists outside a shop). */
export async function storeRazorpayEvent(tenantId: string, key: string, payload: object): Promise<void> {
  await withTenant(tenantId, (tx) => tx.insert(webhookEvents).values({ provider: 'razorpay', eventKey: `razorpay:${tenantId}:${key.replace(/^razorpay:/, '')}`, tenantId, payload })
    .onConflictDoNothing({ target: webhookEvents.eventKey }))
}

/**
 * Process stored Razorpay events for one shop (right after storing, from /pay and the order page, and from the
 * daily cron). The tenant is the event row's own (set from our key, never the payload); the order is matched by
 * OUR stored Razorpay order id and the amount we asked for, in INR.
 */
export async function processEvents(tenantId: string, limit = 20): Promise<number> {
  const soldOut: string[] = []
  const n = await withTenant(tenantId, async (tx) => {
    const rows = await tx.select({ id: webhookEvents.id, payload: webhookEvents.payload }).from(webhookEvents)
      .where(and(eq(webhookEvents.tenantId, tenantId), isNull(webhookEvents.processedAt), eq(webhookEvents.provider, 'razorpay'))).orderBy(webhookEvents.receivedAt).limit(limit)
      .for('update', { skipLocked: true })
    for (const row of rows) {
      let error: string | null = null
      // A savepoint per event: one bad event must not abort the batch and block every later payment (audit 2026-11-07).
      try { error = await tx.transaction((sp) => applyEvent(sp, tenantId, row.payload as Record<string, unknown>, soldOut)) } catch (e) { error = e instanceof Error ? e.name : 'error' }
      await tx.update(webhookEvents).set({ processedAt: sql`now()`, lastError: error, payload: trimRazorpayEvent(row.payload as Record<string, unknown>) }).where(and(eq(webhookEvents.tenantId, tenantId), eq(webhookEvents.id, row.id)))
    }
    if (rows.length) await markEvent(tx, tenantId)
    return rows.length
  })
  // A rolled-back savepoint may have listed a variant: one refresh too many is harmless.
  if (soldOut.length) await refreshSoldOut(tenantId)
  return n
}

async function applyEvent(tx: Tx, tenantId: string, ev: Record<string, unknown>, soldOut: string[]): Promise<string | null> {
  const kind = String(ev.event ?? '')
  const entity = ((ev.payload as Record<string, { entity?: Record<string, unknown> }> | undefined)?.payment?.entity) ?? null
  if (!entity) return kind === 'order.paid' ? null : 'no payment entity'
  const p = toPayment(entity)
  const rzpOrder = typeof entity.order_id === 'string' ? entity.order_id : ''
  const [o] = await tx.select({ id: orders.id, checkout: orders.checkout }).from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.razorpayOrderId, rzpOrder)))
  if (!o) return 'no such order'
  if (kind === 'payment.failed') { await tx.update(orders).set({ paymentFailedAt: sql`now()` }).where(and(eq(orders.tenantId, tenantId), eq(orders.id, o.id), isNull(orders.paidAt))); return null }
  if (kind !== 'payment.captured' && kind !== 'order.paid') return null
  const asked = Number((o.checkout as { onlineTotal?: number } | null)?.onlineTotal ?? -1)
  if (p.status !== 'captured' || p.amount !== asked || entity.currency !== 'INR') return `amount or state does not match (${p.status})`
  await markPaid(tx, { id: o.id, tenantId }, { paymentId: p.id, fee: p.fee, tax: p.tax }, soldOut)
  return null
}
