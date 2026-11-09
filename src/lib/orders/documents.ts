import 'server-only'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { CREDIT_REASONS, MAX_DOCUMENTS, type CreditReason, type DocLine, type DocOrder, type DocShop, type IssuedCredit } from '@/domains/orders/documents'
import { orderPrefix } from '@/domains/signup/slug'
import { orderState, type OrderState } from '@/domains/orders/order-state'
import { applies } from '@/domains/orders/work'
import { momentColumns } from '@/lib/db/order-predicates'
import type { Tx } from '@/lib/db'
import { shopSettings, tenants } from '@/lib/db/schema'
import { creditNoteLines, creditNotes, orderLines, orders } from '@/lib/db/schema-orders'
import type { CreditKind } from '@/domains/orders/credits'

// =============================================================================
// FILE: src/lib/orders/documents.ts
//
// WHAT THE PACKING SLIP AND THE INVOICE PRINT (1D·5), for orders of ONE shop,
// found by number inside the tenant transaction the caller opened (asMember,
// so a Frrata support visit that opens a document is audited — documents carry
// the shopper's full address). Read exactly as stored at placement and
// packing: prices, rates, shares of the charges, the seller's GSTIN.
// Here, not in src/lib/queries/: it takes the caller's transaction, because
// the print page reads inside asMember (the support audit), like the writers.
// =============================================================================

export { MAX_DOCUMENTS }

/** Settings › Documents (D2): the logo for paper, the signatory and the invoice note — today's (slips), or as an invoice froze them. */
export type Paper = { logo: string | null; signatory: string; note: string }

export async function documentsFor(tx: Tx, tenantId: string, numbers: number[], kind: 'slip' | 'invoice' | 'credit', now = new Date(),
  /** The GST app reads a period's documents in batches above the print cap (MAX_DOCUMENTS is for a print page). */
  cap = MAX_DOCUMENTS): Promise<{ shop: DocShop; paper: Paper; orders: { n: number; o: DocOrder; lines: DocLine[]; frozen: Paper; credit: IssuedCredit | null; credits: IssuedCredit[] }[]; skipped: { number: string; state: OrderState }[] }> {
  const wanted = [...new Set(numbers.filter((n) => Number.isSafeInteger(n) && n > 0))].slice(0, cap)
  const [s] = await tx.select({ name: tenants.name, legalName: shopSettings.legalName, address: shopSettings.address, prefix: shopSettings.orderPrefix,
    logo: shopSettings.docLogo, signatory: shopSettings.docSignatory, note: shopSettings.docNote })
    .from(tenants).innerJoin(shopSettings, eq(shopSettings.tenantId, tenants.id)).where(eq(tenants.id, tenantId))
  const shop: DocShop = { name: s?.name ?? '', legalName: s?.legalName ?? '', address: s?.address ?? '', returnAddress: s?.address ?? '' }
  const paper: Paper = { logo: s?.logo ?? null, signatory: s?.signatory ?? '', note: s?.note ?? '' }
  const prefix = orderPrefix(s?.prefix ?? '', s?.name ?? '')
  if (!wanted.length) return { shop, paper, orders: [], skipped: [] }
  const os = await tx.select({
    ...momentColumns, id: orders.id, number: orders.number, paymentMethod: orders.paymentMethod, paidAt: orders.paidAt, switchedToCodAt: orders.switchedToCodAt, cancelledAt: orders.cancelledAt,
    subtotal: orders.subtotal, shipping: orders.shipping, codCharge: orders.codCharge, gstTotal: orders.gstTotal, total: orders.total, pricesIncludeGst: orders.pricesIncludeGst,
    placedAt: orders.placedAt, packedAt: orders.packedAt, invoiceNumber: orders.invoiceNumber, sellerGstin: orders.sellerGstin, sellerScheme: orders.sellerScheme, buyerGstin: orders.buyerGstin, buyerName: orders.buyerName, sellerName: orders.sellerName, sellerAddress: orders.sellerAddress, invoiceLogo: orders.invoiceLogo, invoiceSignatory: orders.invoiceSignatory, invoiceNote: orders.invoiceNote,
    customerName: orders.customerName, phone: orders.phone, addressLine: orders.addressLine, area: orders.area, landmark: orders.landmark,
    city: orders.city, pincode: orders.pincode, state: orders.state, supplyState: orders.supplyState,
  }).from(orders).where(and(eq(orders.tenantId, tenantId), inArray(orders.number, wanted)))
  if (!os.length) return { shop, paper, orders: [], skipped: [] }
  const ls = await tx.select({
    orderId: orderLines.orderId, id: orderLines.id, title: orderLines.title, optionValues: orderLines.optionValues, qty: orderLines.qty, sku: orderLines.sku, hsn: orderLines.hsn, uqc: orderLines.uqc,
    imageBase: orderLines.imageBase, imageWidths: orderLines.imageWidths, taxableValue: orderLines.taxableValue, gst: orderLines.gst, gstBps: orderLines.gstBps,
    unitPrice: orderLines.unitPrice, lineDiscount: orderLines.lineDiscount,
    chargeTaxable: orderLines.chargeTaxable, chargeGst: orderLines.chargeGst,
  }).from(orderLines).where(and(eq(orderLines.tenantId, tenantId), inArray(orderLines.orderId, os.map((o) => o.id)))).orderBy(asc(orderLines.position))
  // Credit notes issued for these orders (Documents D3): only read when one is asked for.
  const cns = kind === 'credit' ? await tx.select({ id: creditNotes.id, orderId: creditNotes.orderId, number: creditNotes.number, issuedAt: creditNotes.issuedAt, reason: creditNotes.reason, kind: creditNotes.kind, against: creditNotes.againstInvoice, total: creditNotes.total })
    .from(creditNotes).where(and(eq(creditNotes.tenantId, tenantId), inArray(creditNotes.orderId, os.map((o) => o.id)))).orderBy(asc(creditNotes.issuedAt)) : []
  const cnl = cns.length ? await tx.select({ creditNoteId: creditNoteLines.creditNoteId, lineId: creditNoteLines.orderLineId, qty: creditNoteLines.qty, taxable: creditNoteLines.taxable, gst: creditNoteLines.gst, bps: creditNoteLines.gstBps })
    .from(creditNoteLines).where(and(eq(creditNoteLines.tenantId, tenantId), inArray(creditNoteLines.creditNoteId, cns.map((c) => c.id)))) : []
  // In the order asked for (a bulk print keeps the queue's order). Grouped once (speed review 2026-11-09: a filter per
  // order was O(orders × lines), a second of CPU for a quarter's GST read).
  const byNumber = new Map(os.map((o) => [o.number, o]))
  const group = <T, K>(rows: T[], key: (r: T) => K) => { const m = new Map<K, T[]>(); for (const r of rows) { const k = key(r); const a = m.get(k); if (a) a.push(r); else m.set(k, [r]) } return m }
  const linesOf = group(ls, (l) => l.orderId), notesOf = group(cns, (c) => c.orderId), noteLinesOf = group(cnl, (l) => l.creditNoteId)
  // A slip only for an order that may go out (applies('print'), the same rule as the buttons): a typed link to an
  // unconfirmed COD order must not print "Collect ₹…" (architecture review 2026-11-07). Said, not silent.
  const skipped: { number: string; state: OrderState }[] = []
  return {
    shop, paper, skipped,
    orders: wanted.flatMap((n) => {
      const o = byNumber.get(n)
      if (!o) return [] // unknown or another shop's number: silently not printed
      if (kind === 'slip') { const st = orderState(o, now); if (!applies('print', st)) { skipped.push({ number: `${prefix}-${n}`, state: st }); return [] } }
      const lines = (linesOf.get(o.id) ?? []).map(({ orderId: _o, ...l }) => ({ ...l, taxableValue: Number(l.taxableValue), gst: Number(l.gst), unitPrice: Number(l.unitPrice), lineDiscount: Number(l.lineDiscount), chargeTaxable: l.chargeTaxable === null ? null : Number(l.chargeTaxable), chargeGst: l.chargeGst === null ? null : Number(l.chargeGst) }))
      const { invoiceLogo, invoiceSignatory, invoiceNote, ...stored } = o
      const doc: DocOrder = {
        ...stored, number: `${prefix}-${o.number}`, subtotal: Number(o.subtotal), shipping: Number(o.shipping), codCharge: Number(o.codCharge), gstTotal: Number(o.gstTotal), total: Number(o.total),
      }
      // What the invoice froze at packing (an order packed before D2 froze nothing: no logo, no signatory or note).
      // Every credit note on the order (GST phase 2: several), each with what it credited; a pre-0071 reversal has no lines.
      const credits: IssuedCredit[] = (notesOf.get(o.id) ?? []).map((cn) => {
        const ls2 = (noteLinesOf.get(cn.id) ?? []).map((l) => ({ lineId: l.lineId, qty: l.qty, taxable: Number(l.taxable), gst: Number(l.gst), bps: l.bps }))
        return { number: cn.number, issuedAt: cn.issuedAt, reason: (CREDIT_REASONS as readonly string[]).includes(cn.reason) ? cn.reason as CreditReason : 'cancelled', against: cn.against, total: Number(cn.total),
          kind: cn.kind as CreditKind, ...(ls2.length ? { lines: ls2 } : {}) }
      })
      return [{ n, o: doc, lines, frozen: { logo: invoiceLogo, signatory: invoiceSignatory ?? '', note: invoiceNote ?? '' }, credits, credit: credits[0] ?? null }]
    }),
  }
}
