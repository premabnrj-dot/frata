import 'server-only'
import { and, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import { fiscalYear } from '@/domains/counters/fiscal-year'
import { refundDue, type StoredOrder } from '@/domains/orders/amounts'
import { orderState, type OrderState } from '@/domains/orders/order-state'
import { applies, invoiceNumber, type CancelReason, type OrderAction } from '@/domains/orders/work'
import { orderPrefix } from '@/domains/signup/slug'
import type { Tx } from '@/lib/db'
import { momentColumns } from '@/lib/db/order-predicates'
import { shopSettings, tenantCounters, tenants } from '@/lib/db/schema'
import { variants } from '@/lib/db/schema-catalogue'
import { orderEvents, orderLines, orderNotes, orders } from '@/lib/db/schema-orders'
import { takeStock } from './place'

// =============================================================================
// FILE: src/lib/orders/work.ts
//
// THE MERCHANT'S WORK ON AN ORDER (1D·4a): confirm, hold, unhold, undo, note,
// pack, edit, cancel. Each runs inside the caller's tenant transaction (the
// console's actions wrap these in asMember with ROLES[action]; tests call them
// on a real Postgres), changes the order only if it is still in a state the
// action applies to (a compare-and-set: two people never both confirm), and
// writes one order_events row in the same transaction. Events carry field
// names, never shopper data (frata-architecture § Record actions).
// =============================================================================

export type Actor = { kind: 'member' | 'support'; userId: string; email: string }
export type Done<T = object> = ({ ok: true; eventId: string } & T) | { ok: false; error: string; by?: { email: string | null; at: Date } }

/** Moments are written from one JS Date truncated to the millisecond, so an undo can match them exactly. */
const moment = (now: Date) => new Date(Math.floor(now.getTime()))

async function current(tx: Tx, tenantId: string, orderId: string, now: Date) {
  const [o] = await tx.select({ ...momentColumns, id: orders.id, number: orders.number, subtotal: orders.subtotal, shipping: orders.shipping, codCharge: orders.codCharge,
    gstTotal: orders.gstTotal, total: orders.total, pricesIncludeGst: orders.pricesIncludeGst, sellerGstin: orders.sellerGstin })
    .from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId))).for('update')
  return o ? { o, state: orderState(o, now) } : null
}

async function record(tx: Tx, tenantId: string, orderId: string, actor: Actor, kind: typeof orderEvents.$inferInsert.kind, at: Date, extra: Partial<typeof orderEvents.$inferInsert> = {}) {
  const [e] = await tx.insert(orderEvents).values({ tenantId, orderId, kind, actorKind: actor.kind, actorUserId: actor.userId, actorEmail: actor.email, at, ...extra }).returning({ id: orderEvents.id })
  return e!.id
}

/** Who last did `kind` to this order, for "Already confirmed by Riya at 10:42". */
async function lastBy(tx: Tx, tenantId: string, orderId: string, kinds: (typeof orderEvents.$inferInsert.kind)[]) {
  const [e] = await tx.select({ email: orderEvents.actorEmail, at: orderEvents.at }).from(orderEvents)
    .where(and(eq(orderEvents.tenantId, tenantId), eq(orderEvents.orderId, orderId), inArray(orderEvents.kind, kinds))).orderBy(desc(orderEvents.at)).limit(1)
  return e
}

const NOT_NOW: Partial<Record<OrderState, string>> = {
  confirmed: 'Already confirmed', paid: 'Paid online: it needs no confirming', packed: 'Already packed', cancelled: 'This order is cancelled',
  refund_due: 'Its stock sold out before the payment: cancel it and refund in Razorpay', held: 'Already on hold',
  awaiting_payment: 'Not an order yet: the online payment has not come in', payment_abandoned: 'Not an order: the online payment never came in',
}
const refuse = async (tx: Tx, tenantId: string, orderId: string, action: OrderAction, state: OrderState): Promise<{ ok: false; error: string; by?: { email: string | null; at: Date } }> => {
  const kinds = state === 'confirmed' ? ['confirmed' as const] : state === 'held' ? ['held' as const] : state === 'packed' ? ['packed' as const] : state === 'cancelled' ? ['cancelled' as const] : []
  const by = kinds.length ? await lastBy(tx, tenantId, orderId, kinds) : undefined
  return { ok: false, error: NOT_NOW[state] ?? `You cannot ${action} an order that is ${state.replace('_', ' ')}.`, ...(by ? { by } : {}) }
}

export async function confirm(tx: Tx, tenantId: string, actor: Actor, orderId: string, now = new Date()): Promise<Done> {
  const c = await current(tx, tenantId, orderId, now)
  if (!c) return { ok: false, error: 'Order not found.' }
  if (!applies('confirm', c.state)) return refuse(tx, tenantId, orderId, 'confirm', c.state)
  const at = moment(now)
  // From hold: the event says so, so an undo puts it back on hold.
  const fromHold = c.state === 'held'
  // A held paid order is released, not confirmed: paid online needs no confirming.
  const set = c.o.paidAt ? { heldAt: null } : { confirmedAt: at, heldAt: null }
  const r = await tx.update(orders).set(set).where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId), isNull(orders.packedAt), isNull(orders.cancelledAt),
    c.o.paidAt ? isNotNull(orders.heldAt) : isNull(orders.confirmedAt))).returning({ id: orders.id })
  if (!r.length) return refuse(tx, tenantId, orderId, 'confirm', (await current(tx, tenantId, orderId, now))!.state)
  return { ok: true, eventId: await record(tx, tenantId, orderId, actor, c.o.paidAt ? 'unheld' : 'confirmed', at, fromHold ? { reason: 'from_hold' } : {}) }
}

export async function hold(tx: Tx, tenantId: string, actor: Actor, orderId: string, now = new Date()): Promise<Done> {
  const c = await current(tx, tenantId, orderId, now)
  if (!c) return { ok: false, error: 'Order not found.' }
  if (!applies('hold', c.state)) return refuse(tx, tenantId, orderId, 'hold', c.state)
  const at = moment(now)
  // Holding a confirmed COD order takes the confirmation back (it is to be confirmed again).
  const r = await tx.update(orders).set({ heldAt: at, ...(c.o.paidAt ? {} : { confirmedAt: null }) })
    .where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId), isNull(orders.heldAt), isNull(orders.packedAt), isNull(orders.cancelledAt))).returning({ id: orders.id })
  if (!r.length) return refuse(tx, tenantId, orderId, 'hold', (await current(tx, tenantId, orderId, now))!.state)
  return { ok: true, eventId: await record(tx, tenantId, orderId, actor, 'held', at, c.state === 'confirmed' ? { reason: 'from_confirmed' } : {}) }
}

/** Take an order off hold without confirming it: back to To confirm (COD) or To pack (paid). */
export async function unhold(tx: Tx, tenantId: string, actor: Actor, orderId: string, now = new Date()): Promise<Done> {
  const c = await current(tx, tenantId, orderId, now)
  if (!c) return { ok: false, error: 'Order not found.' }
  if (!applies('unhold', c.state)) return { ok: false, error: 'It is not on hold.' }
  const r = await tx.update(orders).set({ heldAt: null }).where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId), isNotNull(orders.heldAt), isNull(orders.packedAt))).returning({ id: orders.id })
  if (!r.length) return { ok: false, error: 'It is not on hold.' }
  return { ok: true, eventId: await record(tx, tenantId, orderId, actor, 'unheld', moment(now)) }
}

/**
 * Undo a confirm or a hold: the same action reversed, as a compare-and-set on the moment it wrote (the event's
 * own `at`), refused in words when anything moved since. An undo is itself an event; it is not undone again.
 */
export async function undo(tx: Tx, tenantId: string, actor: Actor, eventId: string, now = new Date()): Promise<Done> {
  const [e] = await tx.select({ id: orderEvents.id, orderId: orderEvents.orderId, kind: orderEvents.kind, at: orderEvents.at, reason: orderEvents.reason }).from(orderEvents)
    .where(and(eq(orderEvents.tenantId, tenantId), eq(orderEvents.id, eventId)))
  // confirmed, held, and unheld (Confirm on a held PAID order releases it: its undo puts the hold back; review 2026-11-07).
  if (!e || (e.kind !== 'confirmed' && e.kind !== 'held' && e.kind !== 'unheld')) return { ok: false, error: 'There is nothing to undo.' }
  const [already] = await tx.select({ id: orderEvents.id }).from(orderEvents).where(and(eq(orderEvents.tenantId, tenantId), eq(orderEvents.undoes, e.id)))
  if (already) return { ok: false, error: 'Already undone.' }
  const at = moment(now)
  const base = and(eq(orders.tenantId, tenantId), eq(orders.id, e.orderId), isNull(orders.packedAt), isNull(orders.cancelledAt))
  const r = e.kind === 'confirmed'
    ? await tx.update(orders).set({ confirmedAt: null, ...(e.reason === 'from_hold' ? { heldAt: at } : {}) }).where(and(base, eq(orders.confirmedAt, e.at))).returning({ id: orders.id })
    : e.kind === 'unheld'
      ? await tx.update(orders).set({ heldAt: at }).where(and(base, isNull(orders.heldAt))).returning({ id: orders.id })
      : await tx.update(orders).set({ heldAt: null, ...(e.reason === 'from_confirmed' ? { confirmedAt: at } : {}) }).where(and(base, eq(orders.heldAt, e.at))).returning({ id: orders.id })
  if (!r.length) {
    const c = await current(tx, tenantId, e.orderId, now)
    return { ok: false, error: c?.state === 'packed' ? 'Already packed — cancel it instead.' : 'This order changed since: open it to see what happened.' }
  }
  return { ok: true, eventId: await record(tx, tenantId, e.orderId, actor, 'undone', at, { undoes: e.id, reason: e.kind }) }
}

export async function addNote(tx: Tx, tenantId: string, actor: Actor, orderId: string, body: string, now = new Date()): Promise<Done> {
  const text = body.trim()
  if (!text || text.length > 2000) return { ok: false, error: 'A note is 1 to 2,000 characters.' }
  const c = await current(tx, tenantId, orderId, now)
  if (!c) return { ok: false, error: 'Order not found.' }
  if (!applies('note', c.state)) return { ok: false, error: 'Notes are for orders: this online payment never came in.' }
  await tx.insert(orderNotes).values({ tenantId, orderId, body: text, authorUserId: actor.userId, authorEmail: actor.email, at: moment(now) })
  return { ok: true, eventId: await record(tx, tenantId, orderId, actor, 'note_added', moment(now)) }
}

/**
 * Mark packed: takes the stock of pre-order lines (refused if it has not arrived) and issues the invoice number —
 * GST asks for the invoice when goods leave (owner call 3). A tax invoice when the order was placed under a GSTIN,
 * else a bill of supply, each its own series, numbered within the financial year (IST).
 */
export async function pack(tx: Tx, tenantId: string, actor: Actor, orderId: string, now = new Date(), soldOut: string[] = []): Promise<Done<{ invoiceNumber: string; soldOut: string[]; preordersTaken: number }>> {
  const c = await current(tx, tenantId, orderId, now)
  if (!c) return { ok: false, error: 'Order not found.' }
  if (!applies('pack', c.state)) return c.state === 'unconfirmed' || c.state === 'held' ? { ok: false, error: 'Confirm it first.' } : refuse(tx, tenantId, orderId, 'pack', c.state)
  const pre = await takeStock(tx, tenantId, orderId, 'preorder', soldOut)
  if (pre.short) return { ok: false, error: 'The pre-ordered pieces are not in stock yet. Add the stock when they arrive, then pack.' }
  const kind = c.o.sellerGstin ? 'invoice' : 'bill'
  const fy = fiscalYear(now)
  const [n] = await tx.insert(tenantCounters).values({ tenantId, kind, period: fy, next: 2 })
    .onConflictDoUpdate({ target: [tenantCounters.tenantId, tenantCounters.kind, tenantCounters.period], set: { next: sql`${tenantCounters.next} + 1` } })
    .returning({ next: tenantCounters.next })
  const [s] = await tx.select({ series: shopSettings.invoiceSeries, prefix: shopSettings.orderPrefix, name: tenants.name }).from(tenants)
    .innerJoin(shopSettings, eq(shopSettings.tenantId, tenants.id)).where(eq(tenants.id, tenantId))
  const number = invoiceNumber({ series: s?.series ?? '', orderPrefix: orderPrefix(s?.prefix ?? '', s?.name ?? ''), fiscalYear: fy, n: n!.next - 1, kind })
  const at = moment(now)
  const r = await tx.update(orders).set({ packedAt: at, invoiceNumber: number })
    .where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId), isNull(orders.packedAt), isNull(orders.cancelledAt), isNull(orders.heldAt))).returning({ id: orders.id })
  // The row is locked (current: for update), so this cannot miss; if it ever does, the counter rolls back with it.
  if (!r.length) throw new Error('pack: order changed under its lock')
  return { ok: true, eventId: await record(tx, tenantId, orderId, actor, 'packed', at), invoiceNumber: number, soldOut, preordersTaken: pre.taken }
}

export type ContactEdit = Partial<{ customerName: string; phone: string; addressLine: string; area: string; landmark: string; pincode: string; city: string; state: string }>

/** Edit who it goes to, until packed (the slip carries the address). The event names the fields, never the values. */
export async function editContact(tx: Tx, tenantId: string, actor: Actor, orderId: string, edit: ContactEdit, now = new Date()): Promise<Done<{ fields: string[] }>> {
  const c = await current(tx, tenantId, orderId, now)
  if (!c) return { ok: false, error: 'Order not found.' }
  if (!applies('edit', c.state)) return { ok: false, error: c.state === 'packed' ? 'Already packed: the slip has the old address. Unpacking comes with shipping (Phase 2).' : `This order is ${c.state.replace('_', ' ')}.` }
  const fields = Object.keys(edit).filter((k) => edit[k as keyof ContactEdit] !== undefined)
  if (!fields.length) return { ok: false, error: 'Nothing changed.' }
  // A change to the delivery state moves the place of supply with it (GST).
  await tx.update(orders).set({ ...edit, ...(edit.state ? { supplyState: edit.state } : {}) })
    .where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId), isNull(orders.packedAt), isNull(orders.cancelledAt)))
  return { ok: true, eventId: await record(tx, tenantId, orderId, actor, 'edited', moment(now), { fields }), fields }
}

/**
 * Cancel, with a reason. "Put stock back" returns exactly the lines whose stock was taken (per line), and says
 * which variants came back from 0 so the caller refreshes the shop. A paid order says what to refund in Razorpay
 * (Frata refunds nothing itself). An issued invoice stays, shown cancelled; its number is never reused.
 */
export async function cancel(tx: Tx, tenantId: string, actor: Actor, orderId: string, c0: { reason: CancelReason; note?: string; restock: boolean }, now = new Date()):
  Promise<Done<{ refund: number; backInStock: string[] }>> {
  const c = await current(tx, tenantId, orderId, now)
  if (!c) return { ok: false, error: 'Order not found.' }
  if (!applies('cancel', c.state)) return c.state === 'cancelled' ? refuse(tx, tenantId, orderId, 'cancel', c.state) : { ok: false, error: 'It has left the shop: that is a return (Phase 2).' }
  const note = c0.note?.trim().slice(0, 500) || null
  if (c0.reason === 'other' && !note) return { ok: false, error: 'Say why in a few words.' }
  const at = moment(now)
  const r = await tx.update(orders).set({ cancelledAt: at, cancelReason: c0.reason, cancelNote: note })
    .where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId), isNull(orders.cancelledAt), isNull(orders.shippedAt))).returning({ id: orders.id })
  if (!r.length) return refuse(tx, tenantId, orderId, 'cancel', (await current(tx, tenantId, orderId, now))!.state)
  const backInStock: string[] = []
  if (c0.restock) {
    const taken = await tx.select({ id: orderLines.id, variantId: orderLines.variantId, qty: orderLines.qty }).from(orderLines)
      .where(and(eq(orderLines.tenantId, tenantId), eq(orderLines.orderId, orderId), isNotNull(orderLines.stockTakenAt)))
    for (const l of [...taken].sort((a, b) => String(a.variantId).localeCompare(String(b.variantId)))) {
      await tx.update(orderLines).set({ stockTakenAt: null }).where(and(eq(orderLines.tenantId, tenantId), eq(orderLines.id, l.id)))
      if (!l.variantId) continue
      const [v] = await tx.update(variants).set({ stock: sql`${variants.stock} + ${l.qty}` })
        .where(and(eq(variants.tenantId, tenantId), eq(variants.id, l.variantId))).returning({ stock: variants.stock })
      if (v && v.stock - l.qty <= 0) backInStock.push(l.variantId)
    }
  }
  const after: StoredOrder = { ...c.o, cancelledAt: at }
  return { ok: true, eventId: await record(tx, tenantId, orderId, actor, 'cancelled', at, { reason: c0.reason }), refund: refundDue(after), backInStock }
}
