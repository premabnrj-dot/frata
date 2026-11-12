import 'server-only'
import { and, eq, isNull, sql } from 'drizzle-orm'
import type { Repriced, StoredPricing } from '@/domains/orders/amounts'
import type { Tx } from '@/lib/db'
import { chargesGst, type Scheme } from '@/domains/tax/gst'
import { orderDiscounts } from '@/lib/db/schema-discounts'
import { orderLines, orders } from '@/lib/db/schema-orders'

// =============================================================================
// FILE: src/lib/orders/reprice.ts
//
// READ AN ORDER'S STORED PRICING, AND WRITE A REPRICE — the one reader and the one writer for
// amounts.reprice() and an order edit's price (offers plan review 4). A reprice changes every money column of the
// order and of each line together: never some of them. Only the live lines and offers count (an order edit takes
// rows out: removed_at).
// =============================================================================

export type StoredOrderPricing = StoredPricing & { lineIds: string[] }

/** The live lines as sold (in position order, with their ids) and the live offers the order got. */
export async function storedPricing(tx: Tx, tenantId: string, orderId: string, o: { shipping: number; sellerGstin: string | null; pricesIncludeGst: boolean }): Promise<StoredOrderPricing> {
  // The order's own facts decide its tax: its seller scheme (a composition seller charges none) and the day it was
  // placed (the rate table in force then), never today's settings (plan review 2026-11-09, finding 4).
  const [ord] = await tx.select({ sellerScheme: orders.sellerScheme, placedAt: orders.placedAt }).from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId)))
  const lines = await tx.select({ id: orderLines.id, unitPrice: orderLines.unitPrice, qty: orderLines.qty, hsn: orderLines.hsn, productDiscount: orderLines.productDiscount, gstBps: orderLines.gstBps }).from(orderLines)
    .where(and(eq(orderLines.tenantId, tenantId), eq(orderLines.orderId, orderId), isNull(orderLines.removedAt))).orderBy(orderLines.position, orderLines.id)
  const applied = await tx.select({ class: orderDiscounts.class, amount: orderDiscounts.amount, method: orderDiscounts.method }).from(orderDiscounts)
    .where(and(eq(orderDiscounts.tenantId, tenantId), eq(orderDiscounts.orderId, orderId), isNull(orderDiscounts.removedAt)))
  return {
    lineIds: lines.map((l) => l.id),
    lines: lines.map((l) => ({ unitPrice: Number(l.unitPrice), qty: l.qty, hsn: l.hsn, productDiscount: Number(l.productDiscount), gstBps: l.gstBps })),
    applied: applied.map((a) => ({ class: a.class as 'product' | 'order' | 'shipping' | 'payment', amount: Number(a.amount), method: a.method as 'cod' | 'prepaid' | null })),
    shipping: o.shipping, registered: chargesGst({ gstin: o.sellerGstin, scheme: (ord?.sellerScheme ?? 'regular') as Scheme }), pricesIncludeGst: o.pricesIncludeGst,
    placedAt: ord!.placedAt,
  }
}

/**
 * Write a reprice: the order's money and every line's discount (the product offers' part with it), tax and charge share,
 * the lines in ONE statement (`update … from (values …)`). An order edit also sets what its lines changed: the subtotal,
 * the delivery charge and the cost of goods (`edit`).
 */
export async function writeReprice(tx: Tx, tenantId: string, orderId: string, lineIds: string[], r: Repriced, edit?: { subtotal: number; shipping: number; cogs: number | null }) {
  await tx.update(orders).set({ codCharge: r.codCharge, gstTotal: r.gst, total: r.total, discount: r.discount, merchandiseNet: r.merchandiseNet, ...(edit ?? {}) })
    .where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId)))
  if (!lineIds.length) return
  const rows = lineIds.map((id, i) => {
    const l = r.lines[i]!
    return sql`(${id}::uuid, ${l.discount}::bigint, ${l.productDiscount}::bigint, ${l.taxable}::bigint, ${l.gstBps}::int, ${l.gst}::bigint, ${l.chargeTaxable}::bigint, ${l.chargeGst}::bigint)`
  })
  await tx.execute(sql`update ${orderLines} l set line_discount = v.d, product_discount = v.pd, taxable_value = v.t, gst_bps = v.bps, gst = v.gst, charge_taxable = v.ct, charge_gst = v.cg
    from (values ${sql.join(rows, sql`, `)}) as v(id, d, pd, t, bps, gst, ct, cg)
    where l.tenant_id = ${tenantId} and l.order_id = ${orderId} and l.id = v.id`)
}
