import 'server-only'
import { orderDiscounts } from '@/lib/db/schema-discounts'
import { and, asc, desc, eq, isNull } from 'drizzle-orm'
import { momentColumns, onlineTotalCol } from '@/lib/db/order-predicates'
import { creditNotes, orderEvents, orderLines, orderNotes, orders, shipments } from '@/lib/db/schema-orders'
import { withTenant } from '@/lib/db/tenant'
import { riskFactsFor } from './order-risk'

// =============================================================================
// FILE: src/lib/queries/order-detail.ts
//
// ONE ORDER FOR THE CONSOLE'S ORDER PAGE (1D·4c): the order, its lines as
// sold, what people did (order_events — field names, never values), the
// team's notes, and its risk facts. Found by NUMBER within the member's own
// shop: the tenant comes from requireMember, so another shop's KS-1001 is the
// same "not found" as a number that does not exist (tenancy audit 2026-11-07).
// =============================================================================

export async function orderDetail(tenantId: string, number: number, now = new Date()) {
  if (!Number.isSafeInteger(number) || number < 1) return null
  const data = await withTenant(tenantId, async (tx) => {
    const [o] = await tx.select({
      ...momentColumns, id: orders.id, number: orders.number,
      onlineTotal: onlineTotalCol, subtotal: orders.subtotal, discount: orders.discount, shipping: orders.shipping, codCharge: orders.codCharge, gstTotal: orders.gstTotal, total: orders.total, pricesIncludeGst: orders.pricesIncludeGst,
      customerName: orders.customerName, phone: orders.phone, addressLine: orders.addressLine, area: orders.area, landmark: orders.landmark,
      pincode: orders.pincode, city: orders.city, state: orders.state,
      invoiceNumber: orders.invoiceNumber, cancelReason: orders.cancelReason, cancelNote: orders.cancelNote, erasedAt: orders.erasedAt,
    }).from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.number, number))).limit(1)
    if (!o) return null
    // Five reads at once in the one transaction (speed review P8: postgres-js pipelines them; they ran in turn).
    const [lines, events, notes, offerRows, [shipment], [credit]] = await Promise.all([tx.select({
      id: orderLines.id, title: orderLines.title, optionValues: orderLines.optionValues, sku: orderLines.sku, qty: orderLines.qty, unitPrice: orderLines.unitPrice,
      imageBase: orderLines.imageBase, imageWidths: orderLines.imageWidths, kind: orderLines.kind, shipsBy: orderLines.shipsBy,
      leadMinDays: orderLines.leadMinDays, leadMaxDays: orderLines.leadMaxDays, stockTakenAt: orderLines.stockTakenAt,
    }).from(orderLines).where(and(eq(orderLines.tenantId, tenantId), eq(orderLines.orderId, o.id))).orderBy(asc(orderLines.position)),
    tx.select({ id: orderEvents.id, kind: orderEvents.kind, actorKind: orderEvents.actorKind, actorEmail: orderEvents.actorEmail, fields: orderEvents.fields,
      reason: orderEvents.reason, undoes: orderEvents.undoes, at: orderEvents.at })
      .from(orderEvents).where(and(eq(orderEvents.tenantId, tenantId), eq(orderEvents.orderId, o.id))).orderBy(desc(orderEvents.at)).limit(100),
    tx.select({ id: orderNotes.id, body: orderNotes.body, authorEmail: orderNotes.authorEmail, at: orderNotes.at })
      .from(orderNotes).where(and(eq(orderNotes.tenantId, tenantId), eq(orderNotes.orderId, o.id))).orderBy(desc(orderNotes.at)).limit(100),
    // The offers it got, as recorded at placement (the pay-online saving is shown only while it is paid online).
    tx.select({ title: orderDiscounts.title, class: orderDiscounts.class, amount: orderDiscounts.amount }).from(orderDiscounts)
      .where(and(eq(orderDiscounts.tenantId, tenantId), eq(orderDiscounts.orderId, o.id))),
    // The parcel on its way (Ship): who carries it and how to follow it; none before it shipped.
    tx.select({ provider: shipments.provider, courierName: shipments.courierName, trackingNumber: shipments.trackingNumber })
      .from(shipments).where(and(eq(shipments.tenantId, tenantId), eq(shipments.orderId, o.id), isNull(shipments.endedAt))).limit(1),
    // Its credit note, once issued (Documents D3).
    tx.select({ number: creditNotes.number, issuedAt: creditNotes.issuedAt }).from(creditNotes)
      .where(and(eq(creditNotes.tenantId, tenantId), eq(creditNotes.orderId, o.id))).limit(1),
    ])
    const offers = offerRows.map((d) => ({ ...d, amount: Number(d.amount) }))
    return { o, lines, events, notes, offers, shipment: shipment ?? null, credit: credit ?? null }
  })
  if (!data) return null
  // Risk: null when its facts cannot be read (the page then says "Risk unavailable" and fails closed).
  const facts = await riskFactsFor(tenantId, [data.o.id], now).then((m) => m.get(data.o.id) ?? null).catch(() => null)
  return { ...data, facts }
}

