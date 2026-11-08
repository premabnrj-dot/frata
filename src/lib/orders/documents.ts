import 'server-only'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { MAX_DOCUMENTS, type DocLine, type DocOrder, type DocShop } from '@/domains/orders/documents'
import { orderPrefix } from '@/domains/signup/slug'
import { orderState, type OrderState } from '@/domains/orders/order-state'
import { applies } from '@/domains/orders/work'
import { momentColumns } from '@/lib/db/order-predicates'
import type { Tx } from '@/lib/db'
import { shopSettings, tenants } from '@/lib/db/schema'
import { orderLines, orders } from '@/lib/db/schema-orders'

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

export async function documentsFor(tx: Tx, tenantId: string, numbers: number[], kind: 'slip' | 'invoice', now = new Date()): Promise<{ shop: DocShop; orders: { n: number; o: DocOrder; lines: DocLine[] }[]; skipped: { number: string; state: OrderState }[] }> {
  const wanted = [...new Set(numbers.filter((n) => Number.isSafeInteger(n) && n > 0))].slice(0, MAX_DOCUMENTS)
  const [s] = await tx.select({ name: tenants.name, legalName: shopSettings.legalName, address: shopSettings.address, prefix: shopSettings.orderPrefix })
    .from(tenants).innerJoin(shopSettings, eq(shopSettings.tenantId, tenants.id)).where(eq(tenants.id, tenantId))
  const shop: DocShop = { name: s?.name ?? '', legalName: s?.legalName ?? '', address: s?.address ?? '', returnAddress: s?.address ?? '' }
  const prefix = orderPrefix(s?.prefix ?? '', s?.name ?? '')
  if (!wanted.length) return { shop, orders: [], skipped: [] }
  const os = await tx.select({
    ...momentColumns, id: orders.id, number: orders.number, paymentMethod: orders.paymentMethod, paidAt: orders.paidAt, switchedToCodAt: orders.switchedToCodAt, cancelledAt: orders.cancelledAt,
    subtotal: orders.subtotal, shipping: orders.shipping, codCharge: orders.codCharge, gstTotal: orders.gstTotal, total: orders.total, pricesIncludeGst: orders.pricesIncludeGst,
    placedAt: orders.placedAt, packedAt: orders.packedAt, invoiceNumber: orders.invoiceNumber, sellerGstin: orders.sellerGstin, sellerName: orders.sellerName, sellerAddress: orders.sellerAddress,
    customerName: orders.customerName, phone: orders.phone, addressLine: orders.addressLine, area: orders.area, landmark: orders.landmark,
    city: orders.city, pincode: orders.pincode, state: orders.state, supplyState: orders.supplyState,
  }).from(orders).where(and(eq(orders.tenantId, tenantId), inArray(orders.number, wanted)))
  if (!os.length) return { shop, orders: [], skipped: [] }
  const ls = await tx.select({
    orderId: orderLines.orderId, title: orderLines.title, optionValues: orderLines.optionValues, qty: orderLines.qty, sku: orderLines.sku, hsn: orderLines.hsn,
    imageBase: orderLines.imageBase, imageWidths: orderLines.imageWidths, taxableValue: orderLines.taxableValue, gst: orderLines.gst, gstBps: orderLines.gstBps,
    unitPrice: orderLines.unitPrice, lineDiscount: orderLines.lineDiscount,
    chargeTaxable: orderLines.chargeTaxable, chargeGst: orderLines.chargeGst,
  }).from(orderLines).where(and(eq(orderLines.tenantId, tenantId), inArray(orderLines.orderId, os.map((o) => o.id)))).orderBy(asc(orderLines.position))
  // In the order asked for (a bulk print keeps the queue's order).
  const byNumber = new Map(os.map((o) => [o.number, o]))
  // A slip only for an order that may go out (applies('print'), the same rule as the buttons): a typed link to an
  // unconfirmed COD order must not print "Collect ₹…" (architecture review 2026-11-07). Said, not silent.
  const skipped: { number: string; state: OrderState }[] = []
  return {
    shop, skipped,
    orders: wanted.flatMap((n) => {
      const o = byNumber.get(n)
      if (!o) return [] // unknown or another shop's number: silently not printed
      if (kind === 'slip') { const st = orderState(o, now); if (!applies('print', st)) { skipped.push({ number: `${prefix}-${n}`, state: st }); return [] } }
      const lines = ls.filter((l) => l.orderId === o.id).map(({ orderId: _o, ...l }) => ({ ...l, taxableValue: Number(l.taxableValue), gst: Number(l.gst), unitPrice: Number(l.unitPrice), lineDiscount: Number(l.lineDiscount), chargeTaxable: l.chargeTaxable === null ? null : Number(l.chargeTaxable), chargeGst: l.chargeGst === null ? null : Number(l.chargeGst) }))
      const doc: DocOrder = {
        ...o, number: `${prefix}-${o.number}`, subtotal: Number(o.subtotal), shipping: Number(o.shipping), codCharge: Number(o.codCharge), gstTotal: Number(o.gstTotal), total: Number(o.total),
      }
      return [{ n, o: doc, lines }]
    }),
  }
}
