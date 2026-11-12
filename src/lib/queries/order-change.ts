import 'server-only'
import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { changeWords, recordChanges, type RecordLine } from '@/domains/orders/edit'
import { refundChains, refundStage } from '@/domains/orders/refunds'
import { editWaitingSql } from '@/lib/db/order-predicates'
import { products, variants } from '@/lib/db/schema-catalogue'
import { orderEditLines, orderEdits, orderRefunds } from '@/lib/db/schema-edits'
import { orderLines, orders } from '@/lib/db/schema-orders'
import { withTenant } from '@/lib/db/tenant'

// =============================================================================
// FILE: src/lib/queries/order-change.ts — WHAT THE SHOPPER'S ORDER PAGE SAYS ABOUT A PAID ORDER'S EDIT (OE·2): a change
// waiting for their payment ("Pay ₹499 for the changes", each change in words, the total it makes) and the refunds on
// their way. Titles and option values only: never a reason (the merchant's), a price the shopper wasn't shown, or a cost.
// =============================================================================

export type ShopperChange = { asked: number; total: number; changes: string[] } | null
export type ShopperRefund = { amount: number }

export async function shopperChange(tenantId: string, orderId: string): Promise<{ change: ShopperChange; refunds: ShopperRefund[] }> {
  return withTenant(tenantId, async (tx) => {
    const [w] = await tx.select({ id: orderEdits.id, asked: orderEdits.asked, total: orderEdits.totalAfter }).from(orderEdits)
      .innerJoin(orders, and(eq(orders.tenantId, orderEdits.tenantId), eq(orders.id, orderEdits.orderId)))
      .where(and(eq(orderEdits.tenantId, tenantId), eq(orderEdits.orderId, orderId), editWaitingSql('"order_edits"', '"orders"'))).limit(1)
    const [rows, refunds] = await Promise.all([
      w ? tx.select({ side: orderEditLines.side, lineId: sql<string>`coalesce(${orderEditLines.orderLineId}, ${orderEditLines.id})`, qty: orderEditLines.qty, replaces: orderEditLines.replaces,
        title: sql<string>`coalesce(${orderLines.title}, ${products.title}, '')`, values: sql<string[]>`coalesce(${orderLines.optionValues}, ${variants.optionValues}, '{}'::text[])` }).from(orderEditLines)
        .leftJoin(orderLines, and(eq(orderLines.tenantId, orderEditLines.tenantId), eq(orderLines.id, orderEditLines.orderLineId)))
        .leftJoin(variants, and(eq(variants.tenantId, orderEditLines.tenantId), eq(variants.id, orderEditLines.variantId)))
        .leftJoin(products, and(eq(products.tenantId, variants.tenantId), eq(products.id, variants.productId)))
        .where(and(eq(orderEditLines.tenantId, tenantId), eq(orderEditLines.editId, w.id))).orderBy(asc(orderEditLines.id)) : Promise.resolve([]),
      tx.select({ id: orderRefunds.id, amount: orderRefunds.amount, retryOf: orderRefunds.retryOf, cancelledAt: orderRefunds.cancelledAt, sendingAt: orderRefunds.sendingAt, sentAt: orderRefunds.sentAt,
        processedAt: orderRefunds.processedAt, failedAt: orderRefunds.failedAt }).from(orderRefunds).where(and(eq(orderRefunds.tenantId, tenantId), eq(orderRefunds.orderId, orderId), isNull(orderRefunds.cancelledAt))),
    ])
    const side = (s: string): RecordLine[] => rows.filter((r) => r.side === s).map((r) => ({ lineId: r.lineId, title: r.title, values: r.values, qty: r.qty, replaces: r.replaces }))
    const change = w ? { asked: Number(w.asked), total: Number(w.total), changes: recordChanges(side('before'), side('after')).map((c) => `${c.title}: ${changeWords(c)}`) } : null
    // On its way once Razorpay has it (sent or processed: "processed" is not yet in the shopper's account).
    const going = refundChains(refunds).filter((r) => ['sending', 'sent', 'processed'].includes(refundStage(r)))
    return { change, refunds: going.map((r) => ({ amount: Number(r.amount) })) }
  }, { snapshot: true })
}
