import 'server-only'
import { enqueueOrderEmail } from '@/lib/email/enqueue'
import { and, desc, eq, gt, isNotNull, isNull, notInArray } from 'drizzle-orm'
import { outcomeUndoOpen, shippedUndoOpen } from '@/domains/orders/outcomes'
import { applies, ROLES, type OrderAction } from '@/domains/orders/work'
import type { MemberRole } from '@/domains/tenancy/roles'
import type { Tx } from '@/lib/db'
import { orderEvents, orders, shipments } from '@/lib/db/schema-orders'
import { current, moment, record, type Actor, type Done } from './work'
import { putStockBack } from './stock'

// =============================================================================
// FILE: src/lib/orders/outcomes.ts
//
// THE ONE WRITER OF A PARCEL'S DATES (Ship, docs/specs/2026-11-08-ship.md; plan review 4–7): shipped, delivered,
// came back (RTO), lost by the courier. The console calls these for orders shipped another way (actor: a member);
// Ship's tracking (S·1) will call them for Shiprocket's parcels (an actor `system`, added with it). Each runs inside the caller's tenant
// transaction, locks the order (current: for update), changes it only if it is still where the action applies (a
// compare-and-set in the WHERE), and writes one order_events row. Nothing here refreshes a cache: Best sellers
// revalidate hourly on their own (plan review 7).
// =============================================================================

type Outcome = { tenantId: string; actor: Actor; orderId: string; now?: Date }

/** The open shipment of an order, if any (at most one: shipments_one_open). */
async function openShipment(tx: Tx, tenantId: string, orderId: string) {
  const [s] = await tx.select({ id: shipments.id, provider: shipments.provider }).from(shipments)
    .where(and(eq(shipments.tenantId, tenantId), eq(shipments.orderId, orderId), isNull(shipments.endedAt))).limit(1)
  return s ?? null
}
const BY_COURIER = 'Shipped with Shiprocket: its tracking sets this.'

/** Shipped another way: opens a `self` shipment (courier name and tracking number as typed, both optional). */
export async function markShipped(tx: Tx, o: Outcome & { courierName?: string; trackingNumber?: string }): Promise<Done> {
  const now = o.now ?? new Date()
  const c = await current(tx, o.tenantId, o.orderId, now)
  if (!c) return { ok: false, error: 'Order not found.' }
  if (!applies('ship_self', c.state)) return { ok: false, error: c.state === 'confirmed' || c.state === 'paid' ? 'Pack it first.' : 'It has already left the shop, or is not an order to ship.' }
  if (await openShipment(tx, o.tenantId, o.orderId)) return { ok: false, error: 'A shipment is already booked for it.' }
  const courierName = o.courierName?.trim().slice(0, 60) || null, trackingNumber = o.trackingNumber?.trim().slice(0, 40) || null
  const at = moment(now)
  const r = await tx.update(orders).set({ shippedAt: at })
    .where(and(eq(orders.tenantId, o.tenantId), eq(orders.id, o.orderId), isNotNull(orders.packedAt), isNull(orders.shippedAt), isNull(orders.cancelledAt))).returning({ id: orders.id })
  if (!r.length) return { ok: false, error: 'This order changed meanwhile. Reload the page.' }
  await tx.insert(shipments).values({ tenantId: o.tenantId, orderId: o.orderId, provider: 'self', courierName, trackingNumber, openedAt: at })
  const eventId = await record(tx, o.tenantId, o.orderId, o.actor, 'shipped', at)
  await enqueueOrderEmail(tx, o.tenantId, o.orderId, 'shipped', eventId, now)
  return { ok: true, eventId }
}

/** An outcome on a shipped order, in its own WHERE: no outcome yet. */
const noOutcome = (tenantId: string, orderId: string) =>
  and(eq(orders.tenantId, tenantId), eq(orders.id, orderId), isNotNull(orders.shippedAt), isNull(orders.deliveredAt), isNull(orders.rtoInitiatedAt), isNull(orders.lostAt), isNull(orders.cancelledAt))

async function outcome(tx: Tx, o: Outcome, action: 'deliver' | 'came_back' | 'lost', restock = false): Promise<Done<{ backInStock: string[] }>> {
  const now = o.now ?? new Date()
  const c = await current(tx, o.tenantId, o.orderId, now)
  if (!c) return { ok: false, error: 'Order not found.' }
  if (!applies(action, c.state)) return { ok: false, error: c.state === 'packed' ? 'Mark it shipped first.' : 'It already has an outcome.' }
  const s = await openShipment(tx, o.tenantId, o.orderId)
  // Shiprocket's parcels get their outcomes from its tracking (S·1 adds that system path), never by hand.
  if (s?.provider === 'shiprocket') return { ok: false, error: BY_COURIER }
  const at = moment(now)
  const set = action === 'deliver' ? { deliveredAt: at } : action === 'lost' ? { lostAt: at } : { rtoInitiatedAt: at, rtoDeliveredAt: at }
  const r = await tx.update(orders).set(set).where(noOutcome(o.tenantId, o.orderId)).returning({ id: orders.id })
  if (!r.length) return { ok: false, error: 'This order changed meanwhile. Reload the page.' }
  const backInStock = action === 'came_back' && restock ? await putStockBack(tx, o.tenantId, o.orderId) : []
  const kind = action === 'deliver' ? 'delivered' as const : action === 'lost' ? 'lost' as const : 'rto' as const
  const eventId = await record(tx, o.tenantId, o.orderId, o.actor, kind, at, action === 'came_back' && restock ? { reason: 'restocked' } : {})
  if (kind === 'delivered') await enqueueOrderEmail(tx, o.tenantId, o.orderId, 'delivered', eventId, now)
  return { ok: true, eventId, backInStock }
}

export const markDelivered = (tx: Tx, o: Outcome) => outcome(tx, o, 'deliver')
/** It came back to the shop (RTO started and received at once, by hand); its stock goes back only when asked. */
export const markCameBack = (tx: Tx, o: Outcome & { restock: boolean }) => outcome(tx, o, 'came_back', o.restock)
export const markLost = (tx: Tx, o: Outcome) => outcome(tx, o, 'lost')

/** The action an outcome event records, for the roles that may undo it (plan review 4). */
const UNDOES: Record<string, OrderAction> = { shipped: 'ship_self', delivered: 'deliver', rto: 'came_back', lost: 'lost' }
export const isOutcomeEvent = (kind: string) => kind in UNDOES

/**
 * Undo Shipped, Delivered, Came back or Lost: only by a role that may do the action undone, only while nothing
 * happened since (notes, edits and prints aside), each only within the IST month it was marked in (it is billed
 * then; Shipped also never after 30 days, shippedUndoOpen), and never a return whose stock was put back (the stock is the merchant's to adjust on Products).
 * A compare-and-set on the moment the event wrote. Undoing Shipped ends its `self` shipment, so it can ship again.
 */
export async function undoOutcome(tx: Tx, tenantId: string, actor: Actor & { role: MemberRole }, eventId: string, now = new Date()): Promise<Done> {
  const [e] = await tx.select({ id: orderEvents.id, orderId: orderEvents.orderId, kind: orderEvents.kind, at: orderEvents.at, reason: orderEvents.reason }).from(orderEvents)
    .where(and(eq(orderEvents.tenantId, tenantId), eq(orderEvents.id, eventId)))
  if (!e || !isOutcomeEvent(e.kind)) return { ok: false, error: 'There is nothing to undo.' }
  if (!ROLES[UNDOES[e.kind]!].includes(actor.role)) return { ok: false, error: 'Only an owner or admin can undo that.' }
  const [already] = await tx.select({ id: orderEvents.id }).from(orderEvents).where(and(eq(orderEvents.tenantId, tenantId), eq(orderEvents.undoes, e.id)))
  if (already) return { ok: false, error: 'Already undone.' }
  if (!outcomeUndoOpen(e.at, now)) return { ok: false, error: 'That month is closed: it cannot be undone now.' }
  if (e.kind === 'shipped' && !shippedUndoOpen(e.at, now)) return { ok: false, error: 'It has been on its way 30 days, so it counts as delivered: it cannot be undone now.' }
  if (e.kind === 'rto' && e.reason === 'restocked') return { ok: false, error: 'Its stock was put back: undo is not possible. Adjust the stock on Products if you need to.' }
  await current(tx, tenantId, e.orderId, now) // lock first, so an action committing meanwhile is seen
  const [later] = await tx.select({ id: orderEvents.id }).from(orderEvents)
    // credit_noted is NOT passive: a credit note reverses the sale, so undoing Came back after one must be refused
    // (credit.int.test.ts holds it). Never add it to this list.
    .where(and(eq(orderEvents.tenantId, tenantId), eq(orderEvents.orderId, e.orderId), gt(orderEvents.at, e.at), notInArray(orderEvents.kind, ['note_added', 'edited', 'printed_slip', 'printed_invoice'])))
    .orderBy(desc(orderEvents.at)).limit(1)
  if (later) return { ok: false, error: 'This order changed since: open it to see what happened.' }
  const at = moment(now)
  const mine = and(eq(orders.tenantId, tenantId), eq(orders.id, e.orderId))
  const r = e.kind === 'shipped'
    ? await tx.update(orders).set({ shippedAt: null }).where(and(mine, eq(orders.shippedAt, e.at), isNull(orders.deliveredAt), isNull(orders.rtoInitiatedAt), isNull(orders.lostAt), isNull(orders.ndrAt))).returning({ id: orders.id })
    : e.kind === 'delivered'
      ? await tx.update(orders).set({ deliveredAt: null }).where(and(mine, eq(orders.deliveredAt, e.at))).returning({ id: orders.id })
      : e.kind === 'lost'
        ? await tx.update(orders).set({ lostAt: null }).where(and(mine, eq(orders.lostAt, e.at))).returning({ id: orders.id })
        : await tx.update(orders).set({ rtoInitiatedAt: null, rtoDeliveredAt: null }).where(and(mine, eq(orders.rtoInitiatedAt, e.at), eq(orders.rtoDeliveredAt, e.at))).returning({ id: orders.id })
  if (!r.length) return { ok: false, error: 'This order changed since: open it to see what happened.' }
  if (e.kind === 'shipped') {
    await tx.update(shipments).set({ endedAt: at, endedReason: 'undone' })
      .where(and(eq(shipments.tenantId, tenantId), eq(shipments.orderId, e.orderId), eq(shipments.provider, 'self'), isNull(shipments.endedAt)))
  }
  return { ok: true, eventId: await record(tx, tenantId, e.orderId, actor, 'undone', at, { undoes: e.id, reason: e.kind }) }
}
