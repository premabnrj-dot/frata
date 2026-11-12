import 'server-only'
import { orderEmailsIn } from './emails'
import { orderDiscounts } from '@/lib/db/schema-discounts'
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm'
import { sourceOfInputs, type Source, type SourceInputs } from '@/domains/analytics/source'
import { attributionInputsSql } from '@/lib/db/attribution-sql'
import { creatorCodeJoinSql } from '@/lib/db/discount-predicates'
import { editWaitingSql, momentColumns, onlineTotalCol } from '@/lib/db/order-predicates'
import { ledgerIn } from '@/lib/payments/refunds'
import { creditNoteLines, creditNotes, orderEvents, orderLines, orderNotes, orders, shipments } from '@/lib/db/schema-orders'
import { orderEditLines, orderEdits, orderRefunds } from '@/lib/db/schema-edits'
import { products, variants } from '@/lib/db/schema-catalogue'
import { withTenant } from '@/lib/db/tenant'
import type { Tx } from '@/lib/db'
import { riskFactsFor } from './order-risk'
import type { RecordLine } from '@/domains/orders/edit'

/** One items edit as the order page reads it (OE·2: a change that asked the shopper to pay, and how it ended). */
export type EditRecord = { id: string; totalBefore: number; totalAfter: number; notify: boolean; asked: number | null; paidAt: Date | null; droppedAt: Date | null
  droppedReason: string | null; createdAt: Date; before: RecordLine[]; after: RecordLine[] }

// =============================================================================
// FILE: src/lib/queries/order-detail.ts
//
// ONE ORDER FOR THE CONSOLE'S ORDER PAGE (1D·4c): the order, its lines as
// sold, what people did (order_events — field names, never values), the
// team's notes, and its risk facts. Found by NUMBER within the member's own
// shop: the tenant comes from requireMember, so another shop's KS-1001 is the
// same "not found" as a number that does not exist (tenancy audit 2026-11-07).
// =============================================================================

/**
 * Where one order came from: the inputs and the creator join Analytics groups by (attribution-sql.ts,
 * creatorCodeJoinSql), classified by sourceOfInputs, so the order page and Analytics always name the same source. Inside
 * the caller's tenant transaction. Its label is text a page renders, never a link.
 */
export async function orderSourceIn(tx: Tx, tenantId: string, orderId: string, now: Date): Promise<Source | null> {
  const i = attributionInputsSql('o')
  const [r] = await tx.execute<SourceInputs>(sql`
    select ${i.us} us, ${i.um} um, ${i.uc} uc, ${i.rh} rh, ${i.gads} gads, ${i.srs} srs, ${i.fb} fb, dc.label cl, dc.code cc
      from ${orders} o ${creatorCodeJoinSql(now)}
     where o.tenant_id = ${tenantId} and o.id = ${orderId} order by od.created_at, dc.code limit 1`)
  return r ? sourceOfInputs(r) : null
}

export async function orderDetail(tenantId: string, number: number, now = new Date()) {
  if (!Number.isSafeInteger(number) || number < 1) return null
  const data = await withTenant(tenantId, async (tx) => {
    const [o] = await tx.select({
      ...momentColumns, id: orders.id, number: orders.number,
      onlineTotal: onlineTotalCol, subtotal: orders.subtotal, discount: orders.discount, shipping: orders.shipping, codCharge: orders.codCharge, gstTotal: orders.gstTotal, total: orders.total, pricesIncludeGst: orders.pricesIncludeGst,
      customerName: orders.customerName, phone: orders.phone, email: orders.email, addressLine: orders.addressLine, area: orders.area, landmark: orders.landmark,
      pincode: orders.pincode, city: orders.city, state: orders.state,
      invoiceNumber: orders.invoiceNumber, cancelReason: orders.cancelReason, cancelNote: orders.cancelNote, erasedAt: orders.erasedAt, razorpayOrderId: orders.razorpayOrderId,
    }).from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.number, number))).limit(1)
    if (!o) return null
    // Seven reads at once in the one transaction (speed review P8: postgres-js pipelines them; they ran in turn).
    const [lines, events, notes, offerRows, [shipment], creditRows, source, emails, editRows, refunds, ledger, [waiting]] = await Promise.all([tx.select({
      id: orderLines.id, title: orderLines.title, optionValues: orderLines.optionValues, sku: orderLines.sku, qty: orderLines.qty, unitPrice: orderLines.unitPrice,
      imageBase: orderLines.imageBase, imageWidths: orderLines.imageWidths, kind: orderLines.kind, shipsBy: orderLines.shipsBy,
      leadMinDays: orderLines.leadMinDays, leadMaxDays: orderLines.leadMaxDays, stockTakenAt: orderLines.stockTakenAt, variantId: orderLines.variantId,
      // An edit's successor: the line it replaced, for "Was M".
      was: sql<{ values: string[]; qty: number } | null>`(select json_build_object('values', p.option_values, 'qty', p.qty) from ${orderLines} p
        where p.tenant_id = ${tenantId} and p.order_id = ${o.id} and p.replaced_by = "order_lines"."id" limit 1)`,
    }).from(orderLines).where(and(eq(orderLines.tenantId, tenantId), eq(orderLines.orderId, o.id), isNull(orderLines.removedAt))).orderBy(asc(orderLines.position)),
    tx.select({ id: orderEvents.id, kind: orderEvents.kind, actorKind: orderEvents.actorKind, actorEmail: orderEvents.actorEmail, fields: orderEvents.fields,
      reason: orderEvents.reason, undoes: orderEvents.undoes, at: orderEvents.at })
      .from(orderEvents).where(and(eq(orderEvents.tenantId, tenantId), eq(orderEvents.orderId, o.id))).orderBy(desc(orderEvents.at)).limit(100),
    tx.select({ id: orderNotes.id, body: orderNotes.body, authorEmail: orderNotes.authorEmail, at: orderNotes.at })
      .from(orderNotes).where(and(eq(orderNotes.tenantId, tenantId), eq(orderNotes.orderId, o.id))).orderBy(desc(orderNotes.at)).limit(100),
    // The offers it got, as recorded at placement (the pay-online saving is shown only while it is paid online).
    tx.select({ title: orderDiscounts.title, class: orderDiscounts.class, amount: orderDiscounts.amount, method: orderDiscounts.method }).from(orderDiscounts)
      .where(and(eq(orderDiscounts.tenantId, tenantId), eq(orderDiscounts.orderId, o.id), isNull(orderDiscounts.removedAt))),
    // The parcel on its way (Ship): who carries it and how to follow it; none before it shipped.
    tx.select({ provider: shipments.provider, courierName: shipments.courierName, trackingNumber: shipments.trackingNumber })
      .from(shipments).where(and(eq(shipments.tenantId, tenantId), eq(shipments.orderId, o.id), isNull(shipments.endedAt))).limit(1),
    // Its credit notes (Documents D3; GST phase 2: several), with what each took from each line.
    tx.select({ id: creditNotes.id, number: creditNotes.number, issuedAt: creditNotes.issuedAt, kind: creditNotes.kind, total: creditNotes.total,
      lines: sql<{ lineId: string; qty: number }[]>`coalesce((select json_agg(json_build_object('lineId', l.order_line_id, 'qty', l.qty)) from ${creditNoteLines} l where l.tenant_id = ${tenantId} and l.credit_note_id = "credit_notes"."id"), '[]'::json)` })
      .from(creditNotes).where(and(eq(creditNotes.tenantId, tenantId), eq(creditNotes.orderId, o.id))).orderBy(creditNotes.issuedAt).limit(50),
    // Where it came from (the same route Analytics classifies by).
    orderSourceIn(tx, tenantId, o.id, now),
    // Its emails to the shopper (email E·2), states in words.
    orderEmailsIn(tx, tenantId, o.id),
    // Its items edits (OE·1): each edit's lines before and after, for Activity and Undo. A change waiting for the shopper's
    // payment (OE·2) names its new lines by their variant (they are on the order only once paid).
    tx.select({ id: orderEdits.id, eventId: orderEdits.eventId, totalBefore: orderEdits.totalBefore, totalAfter: orderEdits.totalAfter, notify: orderEdits.notify, side: orderEditLines.side,
      asked: orderEdits.asked, paidAt: orderEdits.paidAt, droppedAt: orderEdits.droppedAt, droppedReason: orderEdits.droppedReason, createdAt: orderEdits.createdAt,
      lineId: sql<string>`coalesce(${orderEditLines.orderLineId}, ${orderEditLines.id})`, qty: orderEditLines.qty, replaces: orderEditLines.replaces,
      title: sql<string>`coalesce(${orderLines.title}, ${products.title}, '')`, values: sql<string[]>`coalesce(${orderLines.optionValues}, ${variants.optionValues}, '{}'::text[])` }).from(orderEdits)
      .innerJoin(orderEditLines, and(eq(orderEditLines.tenantId, orderEdits.tenantId), eq(orderEditLines.editId, orderEdits.id)))
      .leftJoin(orderLines, and(eq(orderLines.tenantId, orderEditLines.tenantId), eq(orderLines.id, orderEditLines.orderLineId)))
      .leftJoin(variants, and(eq(variants.tenantId, orderEditLines.tenantId), eq(variants.id, orderEditLines.variantId)))
      .leftJoin(products, and(eq(products.tenantId, variants.tenantId), eq(products.id, variants.productId)))
      // The latest 20 edits whole (an edit holds at most 40 line rows), newest first: never an edit cut in half.
      .where(and(eq(orderEdits.tenantId, tenantId), eq(orderEdits.orderId, o.id), sql`${orderEdits.id} in (select x.id from ${orderEdits} x
        where x.tenant_id = ${tenantId} and x.order_id = ${o.id} order by x.created_at desc, x.id limit 20)`)).orderBy(desc(orderEdits.createdAt), orderEditLines.side, orderEditLines.id),
    // Refunds Frrata sent through the shop's Razorpay (OE·2), every attempt: the page shows each chain's latest.
    tx.select({ id: orderRefunds.id, amount: orderRefunds.amount, cause: orderRefunds.cause, retryOf: orderRefunds.retryOf, notBefore: orderRefunds.notBefore, cancelledAt: orderRefunds.cancelledAt,
      sendingAt: orderRefunds.sendingAt, sentAt: orderRefunds.sentAt, processedAt: orderRefunds.processedAt, failedAt: orderRefunds.failedAt, failure: orderRefunds.failure, createdAt: orderRefunds.createdAt,
      supersededBy: orderRefunds.supersededBy, gatewayFee: orderRefunds.gatewayFee })
      .from(orderRefunds).where(and(eq(orderRefunds.tenantId, tenantId), eq(orderRefunds.orderId, o.id))).orderBy(asc(orderRefunds.createdAt)).limit(100),
    // What the shopper's payments hold now (the cancel dialog's refund: impact review 2026-11-12), and a change waiting
    // for their payment, by the one rule (editWaitingSql).
    ledgerIn(tx, tenantId, o.id),
    tx.select({ eventId: orderEdits.eventId, asked: orderEdits.asked, totalAfter: orderEdits.totalAfter }).from(orderEdits)
      .innerJoin(orders, and(eq(orders.tenantId, orderEdits.tenantId), eq(orders.id, orderEdits.orderId)))
      .where(and(eq(orderEdits.tenantId, tenantId), eq(orderEdits.orderId, o.id), editWaitingSql('"order_edits"', '"orders"'))).limit(1),
    ])
    const offers = offerRows.map((d) => ({ ...d, amount: Number(d.amount) }))
    const credits = creditRows.map((c) => ({ number: c.number, issuedAt: c.issuedAt, kind: c.kind, total: Number(c.total), lines: c.lines }))
    // The whole invoice credited: a reversal with no lines (before 0071), or nothing left on any line (GST phase 2).
    const credit = credits.find((c) => c.kind === 'reversal') ?? null
    const edits = new Map<string, EditRecord>()
    for (const r of editRows) {
      const e = edits.get(r.eventId) ?? { id: r.id, totalBefore: Number(r.totalBefore), totalAfter: Number(r.totalAfter), notify: r.notify, asked: r.asked === null ? null : Number(r.asked),
        paidAt: r.paidAt, droppedAt: r.droppedAt, droppedReason: r.droppedReason, createdAt: r.createdAt, before: [], after: [] }
      e[r.side === 'before' ? 'before' : 'after'].push({ lineId: r.lineId, title: r.title, values: r.values, qty: r.qty, replaces: r.replaces })
      edits.set(r.eventId, e)
    }
    return { o, lines, events, notes, offers, shipment: shipment ?? null, credit, credits, source, emails, edits, ledger,
      refunds: refunds.map((r) => ({ ...r, amount: Number(r.amount), gatewayFee: r.gatewayFee === null ? null : Number(r.gatewayFee) })),
      waiting: waiting ? { eventId: waiting.eventId, asked: Number(waiting.asked), totalAfter: Number(waiting.totalAfter) } : null }
  })
  if (!data) return null
  // Risk: null when its facts cannot be read (the page then says "Risk unavailable" and fails closed).
  const facts = await riskFactsFor(tenantId, [data.o.id], now).then((m) => m.get(data.o.id) ?? null).catch(() => null)
  return { ...data, facts }
}

