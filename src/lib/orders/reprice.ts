import 'server-only'
import { and, eq } from 'drizzle-orm'
import type { MethodPrice } from '@/domains/checkout/discounts'
import type { StoredPricing } from '@/domains/orders/amounts'
import type { Tx } from '@/lib/db'
import { orderDiscounts } from '@/lib/db/schema-discounts'
import { orderLines, orders } from '@/lib/db/schema-orders'

// =============================================================================
// FILE: src/lib/orders/reprice.ts
//
// READ AN ORDER'S STORED PRICING, AND WRITE A REPRICE — the one reader and the one writer for
// amounts.reprice() (offers plan review 4). A reprice changes every money column of the order and
// of each line together: never some of them.
// =============================================================================

export type StoredOrderPricing = StoredPricing & { lineIds: string[] }

/** The lines as sold (in position order, with their ids) and the offers the order got. */
export async function storedPricing(tx: Tx, tenantId: string, orderId: string, o: { shipping: number; sellerGstin: string | null; pricesIncludeGst: boolean }): Promise<StoredOrderPricing> {
  const lines = await tx.select({ id: orderLines.id, unitPrice: orderLines.unitPrice, qty: orderLines.qty, hsn: orderLines.hsn }).from(orderLines)
    .where(and(eq(orderLines.tenantId, tenantId), eq(orderLines.orderId, orderId))).orderBy(orderLines.position)
  const applied = await tx.select({ class: orderDiscounts.class, amount: orderDiscounts.amount }).from(orderDiscounts)
    .where(and(eq(orderDiscounts.tenantId, tenantId), eq(orderDiscounts.orderId, orderId)))
  return {
    lineIds: lines.map((l) => l.id),
    lines: lines.map((l) => ({ unitPrice: Number(l.unitPrice), qty: l.qty, hsn: l.hsn })),
    applied: applied.map((a) => ({ class: a.class as 'order' | 'shipping' | 'payment', amount: Number(a.amount) })),
    shipping: o.shipping, registered: !!o.sellerGstin, pricesIncludeGst: o.pricesIncludeGst,
  }
}

/** Write a reprice: the order's money and every line's discount, tax and charge share. */
export async function writeReprice(tx: Tx, tenantId: string, orderId: string, lineIds: string[], r: MethodPrice & { codCharge: number }) {
  await tx.update(orders).set({ codCharge: r.codCharge, gstTotal: r.gst, total: r.total, discount: r.discount, merchandiseNet: r.merchandiseNet })
    .where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId)))
  for (const [i, id] of lineIds.entries()) {
    const l = r.lines[i]!
    await tx.update(orderLines).set({ lineDiscount: l.discount, taxableValue: l.taxable, gstBps: l.gstBps, gst: l.gst, chargeTaxable: l.chargeTaxable, chargeGst: l.chargeGst })
      .where(and(eq(orderLines.tenantId, tenantId), eq(orderLines.id, id)))
  }
}
