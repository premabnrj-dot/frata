import 'server-only'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { quote, type Quote } from '@/domains/checkout/quote'
import { charged } from '@/domains/orders/amounts'
import type { Tx } from '@/lib/db'
import { webhookEvents } from '@/lib/db/schema'
import { orderLines, orders } from '@/lib/db/schema-orders'
import { withTenant } from '@/lib/db/tenant'
import { tokenHash } from '@/lib/crypto/secret-box'
import { checkoutShop, variantRows } from '@/lib/queries/checkout'
import { keysFor, markEvent } from '@/lib/payments/keys'
import { checkoutSignatureOk, orderPayments, toPayment } from '@/lib/payments/razorpay'
import { refreshShop } from '@/lib/queries/storefront'
import { HOLD_MINUTES, startPayment, takeStock, type Pay } from './place'

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
 * stamps per line). A capture after a switch: the shopper paid the online total, so the COD fee and its GST come
 * off the stored order and its lines' shares (amounts.charged, from the stored rates).
 */
export async function markPaid(tx: Tx, o: OrderKey, p: { paymentId: string; fee?: number | null; tax?: number | null }, soldOut: string[] = []): Promise<'paid' | 'already'> {
  const r = await tx.update(orders).set({ paidAt: sql`now()`, razorpayPaymentId: p.paymentId, ...(p.fee != null ? { gatewayFee: p.fee, gatewayTax: p.tax ?? null } : {}) })
    .where(and(eq(orders.tenantId, o.tenantId), eq(orders.id, o.id), isNull(orders.paidAt)))
    .returning({ switchedAt: orders.switchedToCodAt, codCharge: orders.codCharge, subtotal: orders.subtotal, shipping: orders.shipping, pricesIncludeGst: orders.pricesIncludeGst, checkout: orders.checkout })
  if (!r.length) {
    // Already paid (the other path won): the fee may still be news.
    if (p.fee != null) await tx.update(orders).set({ gatewayFee: p.fee, gatewayTax: p.tax ?? null }).where(and(eq(orders.tenantId, o.tenantId), eq(orders.id, o.id), isNull(orders.gatewayFee)))
    return 'already'
  }
  const paid = r[0]!
  if (paid.switchedAt && Number(paid.codCharge) > 0) {
    const lines = await tx.select({ id: orderLines.id, taxableValue: orderLines.taxableValue, gst: orderLines.gst, gstBps: orderLines.gstBps }).from(orderLines)
      .where(and(eq(orderLines.tenantId, o.tenantId), eq(orderLines.orderId, o.id))).orderBy(orderLines.position)
    const ls = lines.map((l) => ({ ...l, taxableValue: Number(l.taxableValue), gst: Number(l.gst) }))
    const now = charged(ls, { subtotal: Number(paid.subtotal), shipping: Number(paid.shipping), pricesIncludeGst: paid.pricesIncludeGst }, 0)
    // What the shopper paid is the online total they were shown; a difference is a bug to see, not to hide.
    const shown = Number((paid.checkout as { onlineTotal?: number } | null)?.onlineTotal ?? now.total)
    if (shown !== now.total) console.error('[markPaid] recomputed online total differs from the one shown', { order: o.id, shown, now: now.total })
    await tx.update(orders).set({ codCharge: 0, gstTotal: now.gstTotal, total: now.total }).where(and(eq(orders.tenantId, o.tenantId), eq(orders.id, o.id)))
    for (const [i, l] of lines.entries()) await tx.update(orderLines).set(now.shares[i]!).where(and(eq(orderLines.tenantId, o.tenantId), eq(orderLines.id, l.id)))
  }
  await takeStock(tx, o.tenantId, o.id, 'in_stock', soldOut)
  return 'paid'
}

const byToken = async (tx: Tx, tenantId: string, token: string) => {
  if (!/^[A-Za-z0-9_-]{22}$/.test(token)) return null
  const [o] = await tx.select({ id: orders.id, method: orders.paymentMethod, rzp: orders.razorpayOrderId, paidAt: orders.paidAt, cancelledAt: orders.cancelledAt, switchedAt: orders.switchedToCodAt,
    payBy: orders.payBy, subtotal: orders.subtotal, total: orders.total, pincode: orders.pincode })
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
  if (soldOut.length) refreshShop(tenantId, 'catalogue')
  return r
}

/** Record a failed attempt (the shopper sees the filled checkout again). */
export async function paymentFailed(tenantId: string, token: string): Promise<void> {
  await withTenant(tenantId, async (tx) => {
    const o = await byToken(tx, tenantId, token)
    if (o && !o.paidAt) await tx.update(orders).set({ paymentFailedAt: sql`now()` }).where(and(eq(orders.tenantId, tenantId), eq(orders.id, o.id)))
  })
}

export type SwitchResult = { kind: 'switched'; total: number } | { kind: 'paid' } | { kind: 'changed'; quote: Quote } | { kind: 'refused'; status: 404 | 409 | 422; error: string }

/**
 * Pay on delivery instead, for the SAME order. Asks Razorpay first: a payment authorized or captured means it is
 * paid (or about to be), and nothing is switched. The COD total must be the one the shopper saw.
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
      if (soldOut.length) refreshShop(tenantId, 'catalogue')
      return { kind: 'paid' }
    }
    if (pays.some((p) => p.status === 'authorized')) return { kind: 'refused', status: 409, error: 'Your payment is still going through. Wait a moment, then check your order.' }
  }
  const soldOut: string[] = []
  const r = await withTenant(tenantId, async (tx): Promise<SwitchResult> => {
    const o = await byToken(tx, tenantId, token)
    if (!o || o.paidAt || o.switchedAt || o.cancelledAt) return { kind: 'refused', status: 409, error: 'This order changed. Reload the page.' }
    const shop = await checkoutShop(tx, tenantId)
    if (!shop?.open) return { kind: 'refused', status: 404, error: 'This shop is not taking orders right now.' }
    // In position order, and kept with their ids: the quote's shares come back in bag order and are written by id.
    const lines = (await tx.select({ id: orderLines.id, variantId: orderLines.variantId, qty: orderLines.qty }).from(orderLines)
      .where(and(eq(orderLines.tenantId, tenantId), eq(orderLines.orderId, o.id))).orderBy(orderLines.position)).filter((l) => l.variantId)
    const bag = lines.map((l) => ({ variantId: l.variantId!, qty: l.qty }))
    // Re-priced against today's rows, this order's own hold excluded (it is the one switching).
    const rows = (await variantRows(tx, tenantId, bag.map((b) => b.variantId), now, { lock: true }))
      .map((r) => ({ ...r, held: o.payBy && o.payBy > now ? Math.max(0, r.held - (bag.find((b) => b.variantId === r.variantId)?.qty ?? 0)) : r.held }))
    const q = quote(bag, rows, shop, now, o.pincode)
    if (q.lines.some((l) => l.problem) || q.subtotal !== Number(o.subtotal)) return { kind: 'changed', quote: q }
    if (!q.cod.offer.offered) return { kind: 'refused', status: 422, error: 'Pay on delivery is not offered for this order.' }
    if (q.cod.total !== expectedTotal) return { kind: 'changed', quote: q }
    const switched = await tx.update(orders).set({ switchedToCodAt: sql`now()`, codCharge: q.cod.codCharge, gstTotal: q.cod.gst, total: q.cod.total, payBy: null })
      .where(and(eq(orders.tenantId, tenantId), eq(orders.id, o.id), isNull(orders.paidAt), isNull(orders.switchedToCodAt))).returning({ id: orders.id })
    // Paid or switched in the meantime (another tab, a capture): nothing more to do here (plan review 2026-11-07).
    if (!switched.length) return { kind: 'refused', status: 409, error: 'This order was already paid or moved to Pay on delivery. Reload the page.' }
    // Every line was re-priced unchanged (else 'changed' above), so shares[i] is lines[i]'s.
    for (const [i, l] of lines.entries()) await tx.update(orderLines).set(q.cod.shares[i]!).where(and(eq(orderLines.tenantId, tenantId), eq(orderLines.id, l.id)))
    await takeStock(tx, tenantId, o.id, 'in_stock', soldOut)
    return { kind: 'switched', total: q.cod.total }
  })
  if (soldOut.length) refreshShop(tenantId, 'catalogue')
  return r
}

/** Try paying online again on the same order: the hold is renewed only if every line can still be sold. */
export async function retryPayment(tenantId: string, token: string, now = new Date()): Promise<{ ok: true; pay: Pay } | { ok: false; status: 404 | 409 | 422; error: string }> {
  const id = await withTenant(tenantId, async (tx) => {
    const o = await byToken(tx, tenantId, token)
    if (!o || o.method !== 'prepaid' || o.paidAt || o.switchedAt || o.cancelledAt) return null
    if (!o.payBy || o.payBy <= now) {
      const lines = await tx.select({ variantId: orderLines.variantId, qty: orderLines.qty, kind: orderLines.kind }).from(orderLines).where(and(eq(orderLines.tenantId, tenantId), eq(orderLines.orderId, o.id)))
      const rows = await variantRows(tx, tenantId, lines.map((l) => l.variantId!).filter(Boolean), now, { lock: true })
      const shop = await checkoutShop(tx, tenantId)
      if (!shop?.open) return 'closed' as const
      const q = quote(lines.filter((l) => l.variantId).map((l) => ({ variantId: l.variantId!, qty: l.qty })), rows, shop, now)
      if (q.lines.some((l) => l.problem) || q.prepaid.total !== Number((await tx.select({ t: orders.checkout }).from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.id, o.id))))[0]?.t?.onlineTotal ?? -1)) return 'gone' as const
      await tx.update(orders).set({ payBy: new Date(now.getTime() + HOLD_MINUTES * 60_000) }).where(and(eq(orders.tenantId, tenantId), eq(orders.id, o.id)))
    }
    return o.id
  })
  if (id === null) return { ok: false, status: 404, error: 'This order is not waiting for an online payment.' }
  if (id === 'closed') return { ok: false, status: 404, error: 'This shop is not taking orders right now.' }
  if (id === 'gone') return { ok: false, status: 409, error: 'Something in this order sold out or changed price while you were away. Go back to your bag.' }
  const pay = await startPayment(tenantId, id)
  return pay.ok ? pay : { ok: false, status: 422, error: pay.error }
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
      await tx.update(webhookEvents).set({ processedAt: sql`now()`, lastError: error }).where(and(eq(webhookEvents.tenantId, tenantId), eq(webhookEvents.id, row.id)))
    }
    if (rows.length) await markEvent(tx, tenantId)
    return rows.length
  })
  // A rolled-back savepoint may have listed a variant: one refresh too many is harmless.
  if (soldOut.length) refreshShop(tenantId, 'catalogue')
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
